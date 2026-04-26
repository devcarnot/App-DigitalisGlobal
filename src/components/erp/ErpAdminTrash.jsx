'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { ERP_TRASH_RETENTION_DAYS } from '../../lib/erp-trash-constants';
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

export default function ErpAdminTrash() {
  const [items, setItems] = useState([]);
  const [trashedProjects, setTrashedProjects] = useState([]);
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
    } catch (e) {
      setError(e?.message || 'Could not load trash');
      setItems([]);
      setTrashedProjects([]);
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

  const isEmpty = !loading && rows.length === 0 && projectRows.length === 0;

  async function openSigned(id) {
    try {
      const res = await erpAuthorizedFetch(`/api/erp/trash/signed-url?id=${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.signedUrl) throw new Error(data.error || 'Could not open');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e?.message || 'Could not open file');
    }
  }

  async function runTrashConfirmAction() {
    if (!confirmDialog) return;
    const { action, id, kind = 'file' } = confirmDialog;
    if (kind === 'project') {
      setBusyId(`p:${id}`);
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
        e?.message ||
          (action === 'restore' ? 'Could not restore' : 'Could not delete'),
      );
    } finally {
      setBusyId(null);
    }
  }

  const fileRestoreBusy = Boolean(confirmDialog?.action === 'restore' && confirmDialog?.kind !== 'project' && busyId === confirmDialog?.id);
  const filePurgeBusy = Boolean(confirmDialog?.action === 'purge' && confirmDialog?.kind !== 'project' && busyId === confirmDialog?.id);
  const projectRestoreBusy = Boolean(confirmDialog?.action === 'restore' && confirmDialog?.kind === 'project' && busyId === `p:${confirmDialog?.id}`);
  const projectPurgeBusy = Boolean(confirmDialog?.action === 'purge' && confirmDialog?.kind === 'project' && busyId === `p:${confirmDialog?.id}`);

  if (loading && items.length === 0 && trashedProjects.length === 0) {
    return (
      <div className="rounded-2xl border border-teal-200/40 bg-white/80 px-8 py-12 text-center text-[#103D4D]/70">
        Loading trash…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-[#103D4D]/75 max-w-2xl">
        Deleted <strong>projects</strong> and <strong>file uploads</strong> stay here for about {ERP_TRASH_RETENTION_DAYS} days. Restore
        brings a project or file back; after the retention period, the system purges it automatically. You can also delete
        items permanently.
      </p>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}

      {isEmpty ? (
        <div className="rounded-2xl border border-teal-200/40 bg-white/80 px-8 py-12 text-center text-[#103D4D]/65">
          Trash is empty.
        </div>
      ) : null}

      {projectRows.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#103D4D]/70">Trashed projects</h3>
          <div className="overflow-x-auto rounded-2xl border border-violet-200/50 bg-white/90 shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-violet-100 bg-violet-50/60 text-[11px] font-semibold uppercase tracking-wide text-[#103D4D]/70">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Deleted</th>
                  <th className="px-4 py-3">Purges in</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-100/80">
                {projectRows.map(({ row, daysLeft }) => (
                  <tr key={row.id} className="text-[#103D4D]/90">
                    <td className="px-4 py-3 font-medium">{row.name || 'Project'}</td>
                    <td className="px-4 py-3 text-[#103D4D]/75">Project</td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#103D4D]/70">
                      {row.deleted_at ? new Date(row.deleted_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {daysLeft == null ? (
                        '—'
                      ) : daysLeft <= 0 ? (
                        <span className="font-medium text-amber-800">Due now</span>
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
                          className="rounded-lg border border-teal-200/70 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-50"
                          onClick={() => setConfirmDialog({ action: 'restore', id: row.id, kind: 'project' })}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          disabled={busyId === `p:${row.id}`}
                          className="rounded-lg border border-rose-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50"
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

      {rows.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#103D4D]/70">Trashed files</h3>
          <div className="overflow-x-auto rounded-2xl border border-teal-200/40 bg-white/90 shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-teal-100 bg-teal-50/60 text-[11px] font-semibold uppercase tracking-wide text-[#103D4D]/70">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Deleted</th>
                  <th className="px-4 py-3">Purges in</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-teal-100/80">
                {rows.map(({ row, daysLeft }) => (
                  <tr key={row.id} className="text-[#103D4D]/90">
                    <td className="px-4 py-3 font-medium">{row.display_name || row.original_path}</td>
                    <td className="px-4 py-3 text-[#103D4D]/75">{kindLabel(row.source_kind)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#103D4D]/70">
                      {row.deleted_at ? new Date(row.deleted_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {daysLeft == null ? (
                        '—'
                      ) : daysLeft <= 0 ? (
                        <span className="font-medium text-amber-800">Due now</span>
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
                          className="rounded-lg border border-teal-200/70 bg-white px-3 py-1.5 text-xs font-semibold text-[#103D4D] hover:bg-teal-50 disabled:opacity-50"
                          onClick={() => void openSigned(row.id)}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          className="rounded-lg border border-teal-200/70 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-50"
                          onClick={() => setConfirmDialog({ action: 'restore', id: row.id, kind: 'file' })}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          className="rounded-lg border border-rose-200/80 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50"
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
    </div>
  );
}
