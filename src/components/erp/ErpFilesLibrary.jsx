'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { isErpGlobalAdmin } from '../../lib/erp-roles';
import { useErpSession } from './useErpSession';
import { ERP_LIST_SEARCH_INPUT_CLASS } from '../../lib/erp-list-search';
import ErpAdminPageHero from './ErpAdminPageHero';
import ErpConfirmDialog from './ErpConfirmDialog';
import ErpFilePreviewModal from './ErpFilePreviewModal';

function isImagePath(path) {
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(String(path || ''));
}

function isVideoPath(path) {
  return /\.(mp4|webm|mov|m4v)$/i.test(String(path || ''));
}

function isAudioPath(path) {
  return /\.(mp3|wav|m4a|aac|ogg)$/i.test(String(path || ''));
}

function shortName(path) {
  const s = String(path || '');
  const parts = s.split('/');
  return parts[parts.length - 1] || s || 'file';
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

const ERP_FILES_BUCKET = 'erp-files';

/**
 * List file objects under `erp-files/{projectId}/…` via the Storage API (RLS applies).
 * Chat/tasks/brief use nested paths (e.g. projectId/userId/file, projectId/userId/task-main/file).
 */
async function listProjectFilesInBucket(supabase, projectId, projectName) {
  const bucket = supabase.storage.from(ERP_FILES_BUCKET);
  const out = [];

  async function walk(prefix, depth) {
    if (depth > 14) return;
    const { data, error } = await bucket.list(prefix, {
      limit: 1000,
      sortBy: { column: 'created_at', order: 'desc' },
    });
    if (error) throw new Error(error.message);
    if (!data?.length) return;
    for (const item of data) {
      const rel = `${prefix}/${item.name}`;
      const meta = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
      const hasFileSize = typeof meta.size === 'number';
      if (hasFileSize) {
        out.push({
          object_id: item.id || rel,
          path: rel,
          created_at: item.created_at || item.updated_at,
          updated_at: item.updated_at || item.created_at,
          bytes: meta.size,
          mimetype: meta.mimetype ?? null,
          project_id: projectId,
          project_name: projectName,
        });
      } else {
        await walk(rel, depth + 1);
      }
    }
  }

  await walk(projectId, 0);
  return out;
}

export default function ErpFilesLibrary() {
  const { profile, session, loading: sessionLoading } = useErpSession();
  const uid = session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  /** null = project overview; UUID = file list for that project */
  const [drillProjectId, setDrillProjectId] = useState(null);
  const [tab, setTab] = useState('files'); // media | files | links
  const [items, setItems] = useState([]);
  /** Links shared in chat across accessible projects (deduped by url+project). */
  const [links, setLinks] = useState([]);
  /** Projects the user can access (for filter even when storage is empty). */
  const [accessibleProjects, setAccessibleProjects] = useState([]);

  const [preview, setPreview] = useState(null); // { path, name, projectName, mime?, project_id? }
  const [deleteBusyPath, setDeleteBusyPath] = useState(null);
  /** Pending trash dispose — opened from row or preview */
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null);

  const load = useCallback(async () => {
    if (sessionLoading) return;
    if (!uid) {
      setItems([]);
      setAccessibleProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Ensure memberships are in sync for members (same pattern as other pages).
      if (profile && !isErpGlobalAdmin(profile.role)) {
        await erpAuthorizedFetch('/api/erp/me/sync-project-memberships', { method: 'POST' }).catch(() => {});
      }

      // Determine project ids user can see.
      let projectIds = [];
      if (isErpGlobalAdmin(profile?.role)) {
        const { data: allProjs, error: apErr } = await supabase.from('erp_projects').select('id').order('name', { ascending: true }).limit(500);
        if (apErr) throw new Error(apErr.message);
        projectIds = (allProjs || []).map((p) => p.id).filter(Boolean);
      } else {
        const { data: mems, error: memErr } = await supabase
          .from('erp_project_members')
          .select('project_id')
          .eq('user_id', uid)
          .limit(500);
        if (memErr) throw new Error(memErr.message);
        projectIds = [...new Set((mems || []).map((m) => m.project_id).filter(Boolean))];
      }

      if (projectIds.length === 0) {
        setItems([]);
        setLinks([]);
        setAccessibleProjects([]);
        setLoading(false);
        return;
      }

      // Fetch project names.
      const projNames = {};
      const CHUNK = 80;
      for (let i = 0; i < projectIds.length; i += CHUNK) {
        const slice = projectIds.slice(i, i + CHUNK);
        const { data: projs } = await supabase.from('erp_projects').select('id, name').in('id', slice);
        for (const p of projs || []) {
          if (p?.id) projNames[p.id] = p.name || 'Project';
        }
      }

      setAccessibleProjects(
        projectIds
          .map((id) => ({ id, name: projNames[id] || 'Project' }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );

      // Pull files via Storage API (storage.objects is not exposed on the public PostgREST schema).
      // Each per-project list is an independent network walk; run them in
      // parallel batches so first paint doesn't scale linearly with the
      // number of accessible projects.
      const out = [];
      const listErrors = [];
      const OCHUNK = 8;
      for (let i = 0; i < projectIds.length; i += OCHUNK) {
        const slice = projectIds.slice(i, i + OCHUNK);
        const results = await Promise.all(
          slice.map(async (pid) => {
            try {
              const rows = await listProjectFilesInBucket(supabase, pid, projNames[pid] || 'Project');
              return { ok: true, rows };
            } catch (e) {
              return { ok: false, err: `${projNames[pid] || 'Project'}: ${e?.message || 'Could not list files'}` };
            }
          }),
        );
        for (const r of results) {
          if (r.ok) out.push(...r.rows);
          else listErrors.push(r.err);
        }
      }
      if (!out.length && listErrors.length) {
        setError(listErrors[0]);
      }

      // Deduplicate + cap.
      const seen = new Set();
      const deduped = [];
      for (const r of out.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))) {
        const k = r.path;
        if (seen.has(k)) continue;
        seen.add(k);
        deduped.push(r);
        if (deduped.length >= 800) break;
      }

      setItems(deduped);

      // Collect URLs from chat messages across accessible projects. Each
      // project gets its own bounded request (capped at LINKS_PER_PROJECT
      // newest messages) and the per-batch fan-out runs in parallel — this
      // replaces the prior pattern that fetched up to 1500 rows per 30-project
      // chunk, which on large workspaces silently truncated and was slow.
      try {
        const urlRegex = /(https?:\/\/[^\s<>"'`]+)/gi;
        const LINKS_PER_PROJECT = 200;
        const MCHUNK = 8;
        const collected = [];
        for (let i = 0; i < projectIds.length; i += MCHUNK) {
          const slice = projectIds.slice(i, i + MCHUNK);
          const batches = await Promise.all(
            slice.map(async (pid) => {
              const { data } = await supabase
                .from('erp_messages')
                .select('id, project_id, user_id, body, created_at')
                .eq('project_id', pid)
                .not('body', 'is', null)
                .order('created_at', { ascending: false })
                .limit(LINKS_PER_PROJECT);
              return data || [];
            }),
          );
          const msgs = batches.flat();
          for (const m of msgs || []) {
            const body = typeof m.body === 'string' ? m.body : '';
            if (!body) continue;
            const matches = body.match(urlRegex);
            if (!matches) continue;
            for (const raw of matches) {
              const url = raw.replace(/[)\],.;!?]+$/g, '');
              if (!url) continue;
              let host = url;
              try {
                host = new URL(url).hostname.replace(/^www\./, '');
              } catch {
                /* ignore */
              }
              collected.push({
                url,
                host,
                project_id: m.project_id,
                project_name: projNames[m.project_id] || 'Project',
                message_id: m.id,
                created_at: m.created_at,
                user_id: m.user_id,
              });
            }
          }
        }
        const seenLink = new Set();
        const dedupedLinks = [];
        for (const l of collected.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))) {
          const k = `${l.project_id}::${l.url}`;
          if (seenLink.has(k)) continue;
          seenLink.add(k);
          dedupedLinks.push(l);
          if (dedupedLinks.length >= 1000) break;
        }
        setLinks(dedupedLinks);
      } catch {
        setLinks([]);
      }
    } catch (e) {
      setItems([]);
      setLinks([]);
      setAccessibleProjects([]);
      setError(e?.message || 'Could not load files');
    } finally {
      setLoading(false);
    }
  }, [sessionLoading, uid, profile]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setQuery('');
  }, [tab]);

  const itemsForTab = useMemo(() => {
    return items.filter((it) => {
      const path = String(it.path || '');
      const isMedia = isImagePath(path) || isVideoPath(path);
      if (tab === 'media') return isMedia;
      return !isMedia;
    });
  }, [items, tab]);

  /** Project cards for overview (name + count only). */
  const projectOverviewRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const counts = new Map();
    if (tab === 'links') {
      for (const l of links) {
        const pid = l.project_id;
        if (!pid) continue;
        counts.set(pid, (counts.get(pid) || 0) + 1);
      }
    } else {
      for (const it of itemsForTab) {
        const pid = it.project_id;
        if (!pid) continue;
        counts.set(pid, (counts.get(pid) || 0) + 1);
      }
    }
    return accessibleProjects
      .map((p) => ({
        id: p.id,
        name: p.name || 'Project',
        fileCount: counts.get(p.id) || 0,
      }))
      .filter((p) => {
        if (!q) return true;
        return String(p.name || '').toLowerCase().includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [accessibleProjects, itemsForTab, links, tab, query]);

  /** Files in the drilled project (list view). */
  const filesInDrillProject = useMemo(() => {
    if (!drillProjectId) return [];
    const q = query.trim().toLowerCase();
    return itemsForTab
      .filter((it) => {
        if (it.project_id !== drillProjectId) return false;
        if (!q) return true;
        const nm = shortName(it.path).toLowerCase();
        const path = String(it.path || '').toLowerCase();
        return nm.includes(q) || path.includes(q);
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 500);
  }, [itemsForTab, drillProjectId, query]);

  /** Links in the drilled project (list view). */
  const linksInDrillProject = useMemo(() => {
    if (!drillProjectId) return [];
    const q = query.trim().toLowerCase();
    return links
      .filter((l) => {
        if (l.project_id !== drillProjectId) return false;
        if (!q) return true;
        return (
          String(l.url || '').toLowerCase().includes(q) ||
          String(l.host || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 500);
  }, [links, drillProjectId, query]);

  const drillProjectName = useMemo(() => {
    if (!drillProjectId) return '';
    const row = accessibleProjects.find((p) => p.id === drillProjectId);
    return row?.name || 'Project';
  }, [drillProjectId, accessibleProjects]);

  const openPreview = useCallback((it) => {
    if (!it?.path) return;
    setPreview({
      path: it.path,
      name: shortName(it.path),
      projectName: it.project_name || 'Project',
      mime: it.mimetype ?? null,
      project_id: it.project_id ?? null,
    });
  }, []);

  const closePreview = useCallback(() => setPreview(null), []);

  const performDeleteFile = useCallback(
    async (it) => {
      if (!it?.path) return;
      const nm = shortName(it.path);
      setDeleteBusyPath(it.path);
      setError('');
      try {
        const res = await erpAuthorizedFetch('/api/erp/trash/dispose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [
              {
                path: it.path,
                display_name: nm,
                mime: it.mimetype ?? it.mime ?? null,
                source_kind: 'files_library',
                source_meta: { project_id: it.project_id ?? null },
              },
            ],
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not delete file');
        setPreview((p) => (p?.path === it.path ? null : p));
        setDeleteConfirmItem(null);
        await load();
      } catch (e) {
        setError(e?.message || 'Could not delete file');
      } finally {
        setDeleteBusyPath(null);
      }
    },
    [load],
  );

  const mediaFilesTablist = (
    <div
      className="inline-flex w-fit shrink-0 rounded-2xl border border-slate-800/25 bg-slate-900 p-1 shadow-inner"
      role="tablist"
      aria-label="Files view"
    >
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'media'}
        onClick={() => setTab('media')}
        className={`rounded-xl px-3 py-2 text-xs font-bold transition-all ${
          tab === 'media' ? 'bg-gradient-to-r from-cyan-500 to-teal-600 text-white shadow-md shadow-teal-900/35' : 'text-slate-400 hover:text-white'
        }`}
      >
        Media
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'files'}
        onClick={() => setTab('files')}
        className={`rounded-xl px-3 py-2 text-xs font-bold transition-all ${
          tab === 'files' ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-950/35' : 'text-slate-400 hover:text-white'
        }`}
      >
        Files
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'links'}
        onClick={() => setTab('links')}
        className={`rounded-xl px-3 py-2 text-xs font-bold transition-all ${
          tab === 'links' ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-orange-950/35' : 'text-slate-400 hover:text-white'
        }`}
      >
        Links
      </button>
    </div>
  );

  return (
    <div className="w-full max-w-none space-y-5 text-[13px] leading-snug text-slate-800">
      <ErpAdminPageHero
        eyebrow="Library"
        title="Files"
        accent="teal"
        description={
          <span>
            Browse by project, then open a list of uploads and project chat media (not direct messages). Pick a project to see its files.
          </span>
        }
      />

      <div className="rounded-2xl border border-cyan-200/50 bg-gradient-to-br from-white via-white to-cyan-50/20 p-3 shadow-[0_12px_40px_-24px_rgba(16,61,77,0.18)] ring-1 ring-cyan-900/[0.05] sm:p-4">
        {drillProjectId ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3" aria-label="Project files">
                <button
                  type="button"
                  onClick={() => {
                    setDrillProjectId(null);
                    setQuery('');
                  }}
                  className="shrink-0 touch-manipulation rounded-lg text-sm font-semibold text-[#103D4D] underline decoration-cyan-400/50 underline-offset-2 transition hover:text-teal-800"
                >
                  All projects
                </button>
                <span className="shrink-0 select-none text-slate-300" aria-hidden>
                  /
                </span>
                <span className="min-w-0 truncate text-sm font-bold tracking-tight text-slate-900 sm:text-base">
                  {drillProjectName}
                </span>
              </nav>
              <div className="shrink-0 self-center">{mediaFilesTablist}</div>
            </div>
            <label className="block min-w-0">
              <span className="sr-only">Search files</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search files…"
                className={`${ERP_LIST_SEARCH_INPUT_CLASS} w-full max-w-none`}
                autoComplete="off"
              />
            </label>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 sm:max-w-xl">
                <label className="block min-w-0">
                  <span className="sr-only">Search projects</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search projects…"
                    className={`${ERP_LIST_SEARCH_INPUT_CLASS} max-w-none`}
                    autoComplete="off"
                  />
                </label>
              </div>
            </div>
            <div className="shrink-0 self-start sm:self-center">{mediaFilesTablist}</div>
          </div>
        )}
      </div>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</p> : null}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-10 w-10 rounded-full border-[3px] border-cyan-200/50 border-t-[#103D4D] border-r-violet-500 animate-spin shadow-md" />
        </div>
      ) : !drillProjectId && projectOverviewRows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-cyan-200/60 bg-gradient-to-br from-slate-50 via-white to-cyan-50/40 py-16 text-center shadow-inner">
          <p className="text-sm font-semibold text-slate-800">
            {query.trim() ? 'No projects match your search.' : 'No projects to show.'}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {query.trim()
              ? 'Try a different name or clear the search.'
              : 'You may not be assigned to any projects yet, or storage is still empty.'}
          </p>
        </div>
      ) : !drillProjectId ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projectOverviewRows.map((p) => (
            <li key={p.id} className="min-w-0">
              <button
                type="button"
                onClick={() => setDrillProjectId(p.id)}
                className="group flex w-full flex-col gap-3 overflow-hidden rounded-2xl border border-slate-200/85 bg-white/95 p-5 text-left shadow-sm transition hover:border-cyan-200/90 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold text-slate-900">{p.name}</p>
                    <p className="mt-2 text-sm text-slate-600">
                      {p.fileCount === 0
                        ? tab === 'media'
                          ? 'No media in this project'
                          : tab === 'links'
                            ? 'No links shared in this project'
                            : 'No files in this project'
                        : `${p.fileCount} ${
                            p.fileCount === 1
                              ? tab === 'media'
                                ? 'item'
                                : tab === 'links'
                                  ? 'link'
                                  : 'file'
                              : tab === 'media'
                                ? 'items'
                                : tab === 'links'
                                  ? 'links'
                                  : 'files'
                          }`}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-bold text-[#103D4D] ring-1 ring-cyan-200/80 group-hover:bg-cyan-100/80">
                    View
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : tab === 'links' ? (
        linksInDrillProject.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-cyan-200/60 bg-gradient-to-br from-slate-50 via-white to-cyan-50/40 py-16 text-center shadow-inner">
            <p className="text-sm font-semibold text-slate-800">No links here.</p>
            <p className="mt-2 text-xs text-slate-500">
              This project has no URLs shared in chat yet, or nothing matches your search.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm">
            <ul className="divide-y divide-slate-100">
              {linksInDrillProject.map((l) => {
                const created = l.created_at ? new Date(l.created_at) : null;
                const dateLabel =
                  created && !Number.isNaN(created.getTime()) ? created.toLocaleDateString() : '—';
                return (
                  <li key={`${l.message_id}-${l.url}`}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex w-full items-center gap-2 px-3 py-2.5 transition hover:bg-slate-50/90 sm:gap-4 sm:px-5 sm:py-3.5"
                      title={l.url}
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-50 to-orange-50 text-orange-900 ring-1 ring-amber-200/70"
                        aria-hidden
                      >
                        🔗
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-orange-800">
                          {l.host}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500">{l.url}</p>
                      </div>
                      <span className="hidden shrink-0 tabular-nums text-xs text-slate-500 sm:block sm:w-28">
                        {dateLabel}
                      </span>
                      <span className="shrink-0 text-xs font-bold text-[#103D4D] opacity-80 group-hover:opacity-100">
                        Open ↗
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )
      ) : filesInDrillProject.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-cyan-200/60 bg-gradient-to-br from-slate-50 via-white to-cyan-50/40 py-16 text-center shadow-inner">
          <p className="text-sm font-semibold text-slate-800">No files here.</p>
          <p className="mt-2 text-xs text-slate-500">
            This project has no matching {tab === 'media' ? 'media' : 'documents'} for the current tab, or nothing matches your search.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm">
          <ul className="divide-y divide-slate-100">
            {filesInDrillProject.map((it) => {
              const path = it.path;
              const name = shortName(path);
              const isImg = isImagePath(path);
              const isVid = isVideoPath(path);
              const isAud = isAudioPath(path);
              const created = it.created_at ? new Date(it.created_at) : null;
              const dateLabel = created && !Number.isNaN(created.getTime()) ? created.toLocaleDateString() : '—';
              const sizeLabel = formatBytes(it.bytes) || '—';
              const busy = deleteBusyPath === path;
              return (
                <li key={it.object_id || it.path}>
                  <div className="group flex w-full items-center gap-2 px-3 py-2.5 transition hover:bg-slate-50/90 sm:gap-4 sm:px-5 sm:py-3.5">
                    <button
                      type="button"
                      onClick={() => void openPreview(it)}
                      disabled={busy}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-4 disabled:opacity-60"
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-slate-200/70 ${
                          isImg ? 'bg-gradient-to-br from-cyan-50 to-violet-50 text-cyan-900' : isVid ? 'bg-gradient-to-br from-violet-50 to-indigo-50 text-violet-900' : 'bg-slate-50 text-slate-700'
                        }`}
                        aria-hidden
                      >
                        {isImg ? '🖼️' : isVid ? '🎬' : isAud ? '🎵' : '📄'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
                        <p className="mt-0.5 text-[11px] tabular-nums text-slate-500 sm:hidden">
                          {dateLabel} · {sizeLabel}
                        </p>
                      </div>
                      <span className="hidden shrink-0 tabular-nums text-xs text-slate-500 sm:block sm:w-28">{dateLabel}</span>
                      <span className="hidden shrink-0 text-xs font-medium text-slate-600 sm:block sm:w-20">{sizeLabel}</span>
                      <span className="shrink-0 text-xs font-bold text-[#103D4D] opacity-80 group-hover:opacity-100">Open →</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => {
                        e.preventDefault();
                        setDeleteConfirmItem(it);
                      }}
                      className="shrink-0 rounded-lg border border-rose-200/90 bg-white px-2.5 py-2 text-[11px] font-bold uppercase tracking-wide text-rose-800 shadow-sm hover:bg-rose-50 disabled:opacity-50 sm:px-3 touch-manipulation"
                      title="Move to trash"
                    >
                      {busy ? '…' : 'Delete'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ErpFilePreviewModal
        file={preview}
        onClose={closePreview}
        extraActions={
          preview ? (
            <button
              type="button"
              disabled={deleteBusyPath === preview.path}
              onClick={() =>
                setDeleteConfirmItem({
                  path: preview.path,
                  mimetype: preview.mime,
                  mime: preview.mime,
                  project_id: preview.project_id,
                  project_name: preview.projectName,
                })
              }
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-rose-800 shadow-sm hover:bg-rose-50 disabled:opacity-50 touch-manipulation"
            >
              {deleteBusyPath === preview.path ? 'Deleting…' : 'Move to trash'}
            </button>
          ) : null
        }
      />

      <ErpConfirmDialog
        open={Boolean(deleteConfirmItem)}
        title="Move file to trash?"
        confirmLabel="Move to trash"
        tone="danger"
        busy={Boolean(deleteConfirmItem && deleteBusyPath === deleteConfirmItem?.path)}
        onCancel={() => {
          if (!deleteBusyPath) setDeleteConfirmItem(null);
        }}
        onConfirm={() => deleteConfirmItem && void performDeleteFile(deleteConfirmItem)}
      >
        <p>
          <span className="font-semibold text-slate-800">{deleteConfirmItem ? shortName(deleteConfirmItem.path) : ''}</span> will
          be moved to Trash. Workspace admins and team leads can restore it from{' '}
          <span className="font-semibold">Trash</span> for about 30 days.
        </p>
      </ErpConfirmDialog>
    </div>
  );
}

