'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { pushErpAppToast } from '../../lib/erp-app-toast';
import { downloadFromSignedUrlWithFallback, basenameFromStoragePath } from '../../lib/browser-download';
import { ERP_DARK_ACCOUNT_CARD } from '../../lib/erp-dark-surfaces';
import { formatErpFetchError } from '../../lib/supabase-errors';
import ErpConfirmDialog from './ErpConfirmDialog';

const KIND_LABELS = {
  project_chat_attachment: 'Project chat file',
  project_brief_attachment: 'Project brief / file',
  project_deleted: 'Project files (deleted project)',
  finance_expense: 'Finance receipt',
  dm_attachment: 'Direct message file',
  group_dm_attachment: 'Group message file',
  files_library: 'Files library',
  unknown: 'File',
};

function kindLabel(k) {
  if (k && KIND_LABELS[k]) return KIND_LABELS[k];
  return String(k || 'unknown').replace(/_/g, ' ');
}

function daysLeftFromPurge(purgeAt) {
  if (!purgeAt) return null;
  const purgeMs = new Date(purgeAt).getTime();
  if (Number.isNaN(purgeMs)) return null;
  return Math.ceil((purgeMs - Date.now()) / (24 * 60 * 60 * 1000));
}

function userRoleLabel(role) {
  if (!role) return 'Member';
  if (role === 'admin') return 'Admin';
  if (role === 'team_lead') return 'Team lead';
  if (role === 'team_member') return 'Team member';
  if (role === 'client') return 'Client';
  return String(role).replace(/_/g, ' ');
}

export default function ErpAdminTrash() {
  const [items, setItems] = useState([]);
  const [trashedProjects, setTrashedProjects] = useState([]);
  const [trashedUsers, setTrashedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await erpAuthorizedFetch('/api/erp/trash');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load trash');
      setItems(Array.isArray(data.items) ? data.items : []);
      setTrashedProjects(Array.isArray(data.trashedProjects) ? data.trashedProjects : []);
      setTrashedUsers(Array.isArray(data.trashedUsers) ? data.trashedUsers : []);
    } catch (e) {
      setError(formatErpFetchError(e?.message || 'Could not load trash'));
      setItems([]);
      setTrashedProjects([]);
      setTrashedUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    return items.map((row) => ({ row, daysLeft: daysLeftFromPurge(row.purge_at) }));
  }, [items]);

  const projectRows = useMemo(() => {
    return trashedProjects.map((row) => ({ row, daysLeft: daysLeftFromPurge(row.purge_at) }));
  }, [trashedProjects]);

  const userRows = useMemo(() => {
    return trashedUsers.map((row) => ({ row, daysLeft: daysLeftFromPurge(row.purge_at) }));
  }, [trashedUsers]);

  const isEmpty = !loading && rows.length === 0 && projectRows.length === 0 && userRows.length === 0;

  async function downloadTrashedFile(row) {
    if (!row?.id) return;
    try {
      const res = await erpAuthorizedFetch(`/api/erp/trash/signed-url?id=${encodeURIComponent(row.id)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.signedUrl) throw new Error(data.error || 'Could not open');
      const name = basenameFromStoragePath(row.display_name || row.original_path || '', 'file');
      await downloadFromSignedUrlWithFallback(data.signedUrl, name);
    } catch (e) {
      setError(formatErpFetchError(e?.message || 'Could not download file'));
    }
  }

  async function reinviteTrashedUser(row) {
    if (!row?.id || !row?.email) {
      setError('No email on this record — use Add client / Add member with their address.');
      return;
    }
    setBusyId(`u:${row.id}`);
    setError('');
    try {
      const res = await erpAuthorizedFetch(`/api/erp/trash/users/${row.id}/reinvite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send invite');
      setError('');
      pushErpAppToast({
        title: 'Invite sent',
        body: `${row.email} can sign in again after accepting the invite.`,
        tone: 'success',
        durationMs: 6000,
      });
    } catch (e) {
      const msg = formatErpFetchError(e?.message || 'Could not send invite');
      setError(msg);
      pushErpAppToast({ title: 'Could not send invite', body: msg, tone: 'error', durationMs: 8000 });
    } finally {
      setBusyId(null);
    }
  }

  async function runTrashConfirmAction() {
    if (!confirmDialog) return;
    const { action, id, kind = 'file' } = confirmDialog;
    if (kind === 'project') {
      setBusyId(`p:${id}`);
    } else if (kind === 'user') {
      setBusyId(`u:${id}`);
    } else {
      setBusyId(id);
    }
    setError('');
    try {
      if (kind === 'project') {
        const path = action === 'restore' ? '/api/erp/trash/restore-project' : '/api/erp/trash/purge-project';
        const res = await erpAuthorizedFetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || (action === 'restore' ? 'Could not restore' : 'Could not delete'));
      } else if (kind === 'user') {
        const res = await erpAuthorizedFetch(`/api/erp/trash/users/${id}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not delete');
      } else if (action === 'restore') {
        const res = await erpAuthorizedFetch(`/api/erp/trash/${id}/restore`, { method: 'POST', body: '{}' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not restore');
      } else {
        const res = await erpAuthorizedFetch(`/api/erp/trash/${id}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not delete');
      }
      setConfirmDialog(null);
      await load();
    } catch (e) {
      setError(
        formatErpFetchError(
          e?.message || (action === 'restore' ? 'Could not restore' : 'Could not delete'),
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  const fileRestoreBusy = Boolean(confirmDialog?.action === 'restore' && confirmDialog?.kind !== 'project' && confirmDialog?.kind !== 'user' && busyId === confirmDialog?.id);
  const filePurgeBusy = Boolean(confirmDialog?.action === 'purge' && confirmDialog?.kind !== 'project' && confirmDialog?.kind !== 'user' && busyId === confirmDialog?.id);
  const projectRestoreBusy = Boolean(confirmDialog?.action === 'restore' && confirmDialog?.kind === 'project' && busyId === `p:${confirmDialog?.id}`);
  const projectPurgeBusy = Boolean(confirmDialog?.action === 'purge' && confirmDialog?.kind === 'project' && busyId === `p:${confirmDialog?.id}`);
  const userPurgeBusy = Boolean(confirmDialog?.action === 'purge' && confirmDialog?.kind === 'user' && busyId === `u:${confirmDialog?.id}`);

  if (loading && items.length === 0 && trashedProjects.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-teal-200/40 bg-white/80 px-8 py-12 text-center text-[#103D4D]/70 ${ERP_DARK_ACCOUNT_CARD} dark:text-slate-300`}
      >
        Loading trash…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/45 dark:text-rose-100">
          {error}
        </div>
      ) : null}

      {isEmpty ? (
        <div
          className={`rounded-2xl border border-teal-200/40 bg-white/80 px-8 py-12 text-center text-[#103D4D]/65 ${ERP_DARK_ACCOUNT_CARD} dark:text-slate-300`}
        >
          Trash is empty.
        </div>
      ) : null}

      {projectRows.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#103D4D]/70 dark:text-violet-200/85">Trashed projects</h3>
          <div className="overflow-x-auto rounded-2xl border border-violet-200/50 bg-white/90 shadow-sm dark:border-violet-900/40 dark:bg-gradient-to-b dark:from-[#14101c] dark:to-[#080610]">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-violet-100 bg-violet-50/60 text-[11px] font-semibold uppercase tracking-wide text-[#103D4D]/70 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-200/90">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Deleted</th>
                  <th className="px-4 py-3">Purges in</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-100/80 dark:divide-violet-900/40">
                {projectRows.map(({ row, daysLeft }) => (
                  <tr key={row.id} className="text-[#103D4D]/90 dark:text-slate-100">
                    <td className="px-4 py-3 font-medium">{row.name || 'Project'}</td>
                    <td className="px-4 py-3 text-[#103D4D]/75 dark:text-slate-300">Project</td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#103D4D]/70 dark:text-slate-400">
                      {row.deleted_at ? new Date(row.deleted_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap dark:text-slate-300">
                      {daysLeft == null ? (
                        '—'
                      ) : daysLeft <= 0 ? (
                        <span className="font-medium text-amber-800 dark:text-amber-300">Due now</span>
                      ) : (
                        <span>
                          {daysLeft} day{daysLeft === 1 ? '' : 's'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={busyId === `p:${row.id}`}
                          className="rounded-lg border border-teal-200/70 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-50 dark:border-teal-800/55 dark:bg-[#0f1820] dark:text-teal-200 dark:hover:bg-[#152230]"
                          onClick={() => setConfirmDialog({ action: 'restore', id: row.id, kind: 'project' })}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          disabled={busyId === `p:${row.id}`}
                          className="rounded-lg border border-rose-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800/55 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:bg-rose-950/55"
                          onClick={() => setConfirmDialog({ action: 'purge', id: row.id, kind: 'project' })}
                        >
                          Delete forever
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {userRows.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#103D4D]/70 dark:text-rose-200/85">Trashed members &amp; clients</h3>
          <div className="overflow-x-auto rounded-2xl border border-rose-200/50 bg-white/90 shadow-sm dark:border-rose-900/40 dark:bg-gradient-to-b dark:from-[#1c1014] dark:to-[#0a0608]">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-rose-100 bg-rose-50/60 text-[11px] font-semibold uppercase tracking-wide text-[#103D4D]/70 dark:border-rose-900/45 dark:bg-rose-950/35 dark:text-rose-200/85">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Deleted</th>
                  <th className="px-4 py-3">Purges in</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-100/80 dark:divide-rose-900/40">
                {userRows.map(({ row, daysLeft }) => (
                  <tr key={row.id} className="text-[#103D4D]/90 dark:text-slate-100">
                    <td className="px-4 py-3 font-medium">{row.full_name || '—'}</td>
                    <td className="px-4 py-3 text-[#103D4D]/80 dark:text-slate-300">{row.email || '—'}</td>
                    <td className="px-4 py-3 text-[#103D4D]/75 dark:text-slate-300">{userRoleLabel(row.role)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#103D4D]/70 dark:text-slate-400">
                      {row.deleted_at ? new Date(row.deleted_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap dark:text-slate-300">
                      {daysLeft == null ? (
                        '—'
                      ) : daysLeft <= 0 ? (
                        <span className="font-medium text-amber-800 dark:text-amber-300">Due now</span>
                      ) : (
                        <span>
                          {daysLeft} day{daysLeft === 1 ? '' : 's'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {row.email ? (
                          <button
                            type="button"
                            disabled={busyId === `u:${row.id}`}
                            className="rounded-lg border border-teal-200/70 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-50 dark:border-teal-800/55 dark:bg-[#0f1820] dark:text-teal-200 dark:hover:bg-[#152230]"
                            onClick={() => void reinviteTrashedUser(row)}
                          >
                            {busyId === `u:${row.id}` ? 'Sending…' : 'Re-invite'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busyId === `u:${row.id}`}
                          className="rounded-lg border border-rose-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800/55 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:bg-rose-950/55"
                          onClick={() => setConfirmDialog({ action: 'purge', id: row.id, kind: 'user' })}
                        >
                          Delete forever
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            The original sign-in account was already removed when the user was deleted. To bring someone back, use{' '}
            <span className="font-semibold">Add member</span> or <span className="font-semibold">Add client</span> with their email — they’ll get a fresh invite.
          </p>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#103D4D]/70 dark:text-teal-200/85">Trashed files</h3>
          <div className="overflow-x-auto rounded-2xl border border-teal-200/40 bg-white/90 shadow-sm dark:border-teal-800/45 dark:bg-gradient-to-b dark:from-[#0e1824] dark:to-[#060b10]">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-teal-100 bg-teal-50/60 text-[11px] font-semibold uppercase tracking-wide text-[#103D4D]/70 dark:border-teal-900/45 dark:bg-teal-950/35 dark:text-teal-200/85">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Deleted</th>
                  <th className="px-4 py-3">Purges in</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-teal-100/80 dark:divide-teal-900/40">
                {rows.map(({ row, daysLeft }) => (
                  <tr key={row.id} className="text-[#103D4D]/90 dark:text-slate-100">
                    <td className="px-4 py-3 font-medium">{row.display_name || row.original_path}</td>
                    <td className="px-4 py-3 text-[#103D4D]/75 dark:text-slate-300">{kindLabel(row.source_kind)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#103D4D]/70 dark:text-slate-400">
                      {row.deleted_at ? new Date(row.deleted_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap dark:text-slate-300">
                      {daysLeft == null ? (
                        '—'
                      ) : daysLeft <= 0 ? (
                        <span className="font-medium text-amber-800 dark:text-amber-300">Due now</span>
                      ) : (
                        <span>
                          {daysLeft} day{daysLeft === 1 ? '' : 's'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          className="rounded-lg border border-teal-200/70 bg-white px-3 py-1.5 text-xs font-semibold text-[#103D4D] hover:bg-teal-50 disabled:opacity-50 dark:border-teal-800/55 dark:bg-[#0f1820] dark:text-slate-100 dark:hover:bg-[#152230]"
                          onClick={() => void downloadTrashedFile(row)}
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          className="rounded-lg border border-teal-200/70 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-50 dark:border-teal-800/55 dark:bg-[#0f1820] dark:text-teal-200 dark:hover:bg-[#152230]"
                          onClick={() => setConfirmDialog({ action: 'restore', id: row.id, kind: 'file' })}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          className="rounded-lg border border-rose-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800/55 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:bg-rose-950/55"
                          onClick={() => setConfirmDialog({ action: 'purge', id: row.id, kind: 'file' })}
                        >
                          Delete forever
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <ErpConfirmDialog
        open={confirmDialog?.action === 'restore' && confirmDialog?.kind === 'file'}
        title="Restore this file?"
        confirmLabel="Restore"
        tone="teal"
        busy={fileRestoreBusy}
        onCancel={() => {
          if (!busyId) setConfirmDialog(null);
        }}
        onConfirm={() => void runTrashConfirmAction()}
      >
        <p>This moves the file back to its original path in storage. If something already exists there, restore may fail.</p>
      </ErpConfirmDialog>

      <ErpConfirmDialog
        open={confirmDialog?.action === 'purge' && confirmDialog?.kind === 'file'}
        title="Delete permanently?"
        confirmLabel="Delete forever"
        tone="danger"
        busy={filePurgeBusy}
        onCancel={() => {
          if (!busyId) setConfirmDialog(null);
        }}
        onConfirm={() => void runTrashConfirmAction()}
      >
        <p>This removes the file from storage immediately. This cannot be undone.</p>
      </ErpConfirmDialog>

      <ErpConfirmDialog
        open={confirmDialog?.action === 'restore' && confirmDialog?.kind === 'project'}
        title="Restore this project?"
        confirmLabel="Restore"
        tone="teal"
        busy={projectRestoreBusy}
        onCancel={() => {
          if (!busyId) setConfirmDialog(null);
        }}
        onConfirm={() => void runTrashConfirmAction()}
      >
        <p>
          The project will appear in the project list again with tasks, chat, and files (storage paths are unchanged). Members
          regain access.
        </p>
      </ErpConfirmDialog>

      <ErpConfirmDialog
        open={confirmDialog?.action === 'purge' && confirmDialog?.kind === 'project'}
        title="Delete this project forever?"
        confirmLabel="Delete forever"
        tone="danger"
        busy={projectPurgeBusy}
        onCancel={() => {
          if (!busyId) setConfirmDialog(null);
        }}
        onConfirm={() => void runTrashConfirmAction()}
      >
        <p>
          This removes the project and related data from the database and moves its files in storage to the file trash. This
          cannot be undone.
        </p>
      </ErpConfirmDialog>

      <ErpConfirmDialog
        open={confirmDialog?.action === 'purge' && confirmDialog?.kind === 'user'}
        title="Remove this trash record?"
        confirmLabel="Delete forever"
        tone="danger"
        busy={userPurgeBusy}
        onCancel={() => {
          if (!busyId) setConfirmDialog(null);
        }}
        onConfirm={() => void runTrashConfirmAction()}
      >
        <p>
          This only clears the audit row in Trash. The user’s sign-in account was already removed when they were deleted, so
          there is nothing to restore. Re-invite them from <span className="font-semibold">Add member</span> or{' '}
          <span className="font-semibold">Add client</span> if you want them back.
        </p>
      </ErpConfirmDialog>
    </div>
  );
}
