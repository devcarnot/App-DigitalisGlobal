/**
 * Move objects from erp-files into __trash/…, record metadata for restore / purge.
 * Server-only (service role).
 */

import { randomUUID } from 'crypto';

import { ERP_TRASH_RETENTION_DAYS } from './erp-trash-constants';

export const ERP_FILES_BUCKET = 'erp-files';
export const ERP_TRASH_PREFIX = '__trash';
export { ERP_TRASH_RETENTION_DAYS };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function trashDestinationPath(originalPath) {
  const leaf = String(originalPath).split('/').filter(Boolean).pop() || 'file';
  const safe = leaf.replace(/[^\w.\-()+ ]/g, '_').slice(0, 200) || 'file';
  return `${ERP_TRASH_PREFIX}/${randomUUID()}/${safe}`;
}

/**
 * Workspace admin: any path. Others: paths they could delete under existing storage rules.
 */
export async function assertCanDisposeStoragePath(admin, profile, userId, path) {
  if (!path || typeof path !== 'string') return false;
  if (path.includes('..') || path.includes('\0')) return false;
  if (path.startsWith(`${ERP_TRASH_PREFIX}/`) || path === ERP_TRASH_PREFIX) return false;

  if (profile?.role === 'admin') return true;

  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) return false;

  if (UUID_RE.test(parts[0])) {
    const { data } = await admin
      .from('erp_project_members')
      .select('user_id')
      .eq('project_id', parts[0])
      .eq('user_id', userId)
      .maybeSingle();
    return !!data;
  }

  if (parts[0] === 'leave' && UUID_RE.test(parts[1])) {
    return parts[1] === userId;
  }

  if (parts[0] === 'finance') {
    return false;
  }

  if (parts[0] === 'dm' && parts.length >= 4 && UUID_RE.test(parts[1]) && UUID_RE.test(parts[2])) {
    return parts[1] === userId || parts[2] === userId;
  }

  if (parts[0] === 'groups' && UUID_RE.test(parts[1])) {
    const { data } = await admin
      .from('erp_message_group_members')
      .select('user_id')
      .eq('group_id', parts[1])
      .eq('user_id', userId)
      .maybeSingle();
    return !!data;
  }

  if (parts[0] === 'avatars' && parts[1] === userId) return true;

  return false;
}

export async function movePathsToTrash(admin, { deletedById, items }) {
  const retentionMs = Number(ERP_TRASH_RETENTION_DAYS) * 24 * 60 * 60 * 1000;
  const results = [];

  for (const item of items || []) {
    const originalPath = String(item?.path || '').trim();
    if (!originalPath) {
      results.push({ ok: false, path: '', error: 'missing_path' });
      continue;
    }
    if (originalPath.startsWith(`${ERP_TRASH_PREFIX}/`)) {
      results.push({ ok: false, path: originalPath, error: 'already_trash' });
      continue;
    }

    const dest = trashDestinationPath(originalPath);
    const { error: moveErr } = await admin.storage.from(ERP_FILES_BUCKET).move(originalPath, dest);
    if (moveErr) {
      results.push({ ok: false, path: originalPath, error: moveErr.message });
      continue;
    }

    const purgeAt = new Date(Date.now() + retentionMs).toISOString();
    const { data: row, error: insErr } = await admin
      .from('erp_trash_items')
      .insert({
        bucket: ERP_FILES_BUCKET,
        storage_path: dest,
        original_path: originalPath,
        display_name: item.display_name || originalPath.split('/').pop(),
        mime: item.mime || null,
        source_kind: item.source_kind || 'unknown',
        source_meta: item.source_meta || {},
        deleted_by: deletedById || null,
        purge_at: purgeAt,
      })
      .select('id')
      .single();

    if (insErr) {
      await admin.storage.from(ERP_FILES_BUCKET).move(dest, originalPath).catch(() => {});
      results.push({ ok: false, path: originalPath, error: insErr.message });
      continue;
    }

    results.push({ ok: true, path: originalPath, trashId: row?.id });
  }

  return results;
}

export async function purgeExpiredTrash(admin) {
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await admin
    .from('erp_trash_items')
    .select('id, storage_path')
    .lte('purge_at', nowIso);
  if (error) return { ok: false, error: error.message, removed: 0 };

  let removed = 0;
  for (const row of rows || []) {
    await admin.storage.from(ERP_FILES_BUCKET).remove([row.storage_path]);
    const { error: delErr } = await admin.from('erp_trash_items').delete().eq('id', row.id);
    if (!delErr) removed += 1;
  }

  return { ok: true, removed };
}

export async function restoreTrashItem(admin, trashId) {
  const { data: row, error } = await admin.from('erp_trash_items').select('*').eq('id', trashId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: 'not_found' };

  const { error: mvErr } = await admin.storage.from(ERP_FILES_BUCKET).move(row.storage_path, row.original_path);
  if (mvErr) return { ok: false, error: mvErr.message };

  await admin.from('erp_trash_items').delete().eq('id', trashId);
  return { ok: true };
}

export async function permanentDeleteTrashItem(admin, trashId) {
  const { data: row, error } = await admin.from('erp_trash_items').select('storage_path').eq('id', trashId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: 'not_found' };

  await admin.storage.from(ERP_FILES_BUCKET).remove([row.storage_path]);
  await admin.from('erp_trash_items').delete().eq('id', trashId);
  return { ok: true };
}

/** Walk erp-files/{projectId}/ recursively; uploaded objects have metadata.size set. */
async function collectProjectStorageLeafPaths(admin, prefix, projectId, depth = 0) {
  if (depth > 24) return [];
  const { data: entries } = await admin.storage.from(ERP_FILES_BUCKET).list(prefix, { limit: 1000 });
  const out = [];
  for (const e of entries || []) {
    if (!e?.name) continue;
    const full = `${prefix}/${e.name}`;
    const size = e.metadata?.size;
    if (typeof size === 'number') {
      out.push({
        path: full,
        display_name: e.name,
        source_kind: 'project_deleted',
        source_meta: { project_id: projectId },
      });
    } else {
      out.push(...(await collectProjectStorageLeafPaths(admin, full, projectId, depth + 1)));
    }
  }
  return out;
}

/** List objects under erp-files/{projectId}/ and move each to trash (project delete). */
export async function moveProjectStorageFolderToTrash(admin, projectId, deletedById) {
  const items = await collectProjectStorageLeafPaths(admin, projectId, projectId, 0);
  if (items.length === 0) return { moved: 0, results: [] };
  const results = await movePathsToTrash(admin, { deletedById, items });
  return { moved: results.filter((r) => r.ok).length, results };
}

/**
 * Permanently remove projects whose soft-delete grace period (purge_at) has passed.
 * Moves erp-files/{projectId}/ to __trash (file trash) then DELETE CASCADE cleans DB rows.
 */
export async function purgeExpiredSoftDeletedProjects(admin) {
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await admin
    .from('erp_projects')
    .select('id')
    .not('deleted_at', 'is', null)
    .not('purge_at', 'is', null)
    .lte('purge_at', nowIso);

  if (error) return { ok: false, error: error.message, purged: 0 };

  let purged = 0;
  for (const r of rows || []) {
    const id = r?.id;
    if (!id) continue;
    try {
      await moveProjectStorageFolderToTrash(admin, id, null);
    } catch {
      /* best-effort storage */
    }
    const { error: delErr } = await admin.from('erp_projects').delete().eq('id', id);
    if (!delErr) purged += 1;
  }

  return { ok: true, purged };
}
