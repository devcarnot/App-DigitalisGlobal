'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import ErpConfirmDialog from './ErpConfirmDialog';

const emptyForm = () => ({
  name: '',
  url: '',
  username: '',
  secret: '',
  notes: '',
});

export default function ErpProjectCredentialsPanel({ projectId, userId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [add, setAdd] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState(emptyForm);
  const [revealedIds, setRevealedIds] = useState(() => new Set());
  const [confirmDeleteCredentialId, setConfirmDeleteCredentialId] = useState(null);

  const fetchRows = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    const { data, error: qErr } = await supabase
      .from('erp_project_credentials')
      .select('id, project_id, name, url, username, secret, notes, created_by, created_at, updated_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (qErr) {
      setError(qErr.message || 'Could not load credentials.');
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`erp-credentials-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'erp_project_credentials', filter: `project_id=eq.${projectId}` },
        () => {
          fetchRows();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, fetchRows]);

  function toggleReveal(id) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyText(label, text) {
    const t = (text || '').trim();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      setError(`Could not copy ${label}.`);
    }
  }

  async function onAdd(e) {
    e.preventDefault();
    if (!userId || !projectId) return;
    const name = add.name.trim();
    if (!name) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      project_id: projectId,
      name,
      url: add.url.trim() || null,
      username: add.username.trim() || null,
      secret: add.secret.trim() || null,
      notes: add.notes.trim() || null,
      created_by: userId,
    };
    const { error: insErr } = await supabase.from('erp_project_credentials').insert(payload);
    setSaving(false);
    if (insErr) {
      setError(insErr.message || 'Could not save.');
      return;
    }
    setAdd(emptyForm());
    await fetchRows();
  }

  function startEdit(row) {
    setEditingId(row.id);
    setEdit({
      name: row.name || '',
      url: row.url || '',
      username: row.username || '',
      secret: row.secret || '',
      notes: row.notes || '',
    });
    setRevealedIds((prev) => new Set(prev).add(row.id));
  }

  async function onSaveEdit(e) {
    e.preventDefault();
    if (!editingId) return;
    const name = edit.name.trim();
    if (!name) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError('');
    const { error: upErr } = await supabase
      .from('erp_project_credentials')
      .update({
        name,
        url: edit.url.trim() || null,
        username: edit.username.trim() || null,
        secret: edit.secret.trim() || null,
        notes: edit.notes.trim() || null,
      })
      .eq('id', editingId);
    setSaving(false);
    if (upErr) {
      setError(upErr.message || 'Could not update.');
      return;
    }
    setEditingId(null);
    setEdit(emptyForm());
    await fetchRows();
  }

  async function executeDeleteCredential() {
    const id = confirmDeleteCredentialId;
    if (!id) return;
    setError('');
    const { error: delErr } = await supabase.from('erp_project_credentials').delete().eq('id', id);
    if (delErr) {
      setError(delErr.message || 'Could not delete.');
      return;
    }
    setConfirmDeleteCredentialId(null);
    if (editingId === id) {
      setEditingId(null);
      setEdit(emptyForm());
    }
    await fetchRows();
  }

  const fieldClass =
    'w-full rounded-xl border border-slate-200/90 bg-white/90 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-cyan-400/80 focus:outline-none focus:ring-2 focus:ring-cyan-200/60';

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-slate-500">
        Only team leads and members can see this list. Secrets are visible to everyone with access — store highly sensitive
        values in a dedicated vault if needed.
      </p>
      {error ? (
        <p className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <form onSubmit={onAdd} className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-3 space-y-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Add credential</p>
        <input
          className={fieldClass}
          placeholder="Name (e.g. Staging DB)"
          value={add.name}
          onChange={(e) => setAdd((p) => ({ ...p, name: e.target.value }))}
          autoComplete="off"
        />
        <input
          className={fieldClass}
          placeholder="URL (optional)"
          value={add.url}
          onChange={(e) => setAdd((p) => ({ ...p, url: e.target.value }))}
          autoComplete="off"
        />
        <input
          className={fieldClass}
          placeholder="Username (optional)"
          value={add.username}
          onChange={(e) => setAdd((p) => ({ ...p, username: e.target.value }))}
          autoComplete="off"
        />
        <input
          className={fieldClass}
          placeholder="Password / secret (optional)"
          type="password"
          value={add.secret}
          onChange={(e) => setAdd((p) => ({ ...p, secret: e.target.value }))}
          autoComplete="new-password"
        />
        <textarea
          className={`${fieldClass} min-h-[4rem] resize-y`}
          placeholder="Notes (optional)"
          value={add.notes}
          onChange={(e) => setAdd((p) => ({ ...p, notes: e.target.value }))}
          rows={2}
        />
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-[#103D4D] px-3 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#0d3442] disabled:opacity-60 transition-colors"
        >
          {saving ? 'Saving…' : 'Save credential'}
        </button>
      </form>

      {loading ? (
        <p className="text-xs text-slate-500 py-2">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-500 py-2">No credentials yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-slate-200/70 bg-white/90 px-3 py-2.5 text-sm shadow-sm space-y-2"
            >
              {editingId === row.id ? (
                <form onSubmit={onSaveEdit} className="space-y-2">
                  <input className={fieldClass} value={edit.name} onChange={(e) => setEdit((p) => ({ ...p, name: e.target.value }))} />
                  <input className={fieldClass} value={edit.url} onChange={(e) => setEdit((p) => ({ ...p, url: e.target.value }))} />
                  <input
                    className={fieldClass}
                    value={edit.username}
                    onChange={(e) => setEdit((p) => ({ ...p, username: e.target.value }))}
                  />
                  <input
                    className={fieldClass}
                    type={revealedIds.has(row.id) ? 'text' : 'password'}
                    value={edit.secret}
                    onChange={(e) => setEdit((p) => ({ ...p, secret: e.target.value }))}
                    autoComplete="new-password"
                  />
                  <textarea
                    className={`${fieldClass} min-h-[3.5rem]`}
                    value={edit.notes}
                    onChange={(e) => setEdit((p) => ({ ...p, notes: e.target.value }))}
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 rounded-lg bg-[#103D4D] py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-700"
                      onClick={() => {
                        setEditingId(null);
                        setEdit(emptyForm());
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-slate-900 truncate">{row.name}</span>
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#103D4D] hover:bg-slate-100"
                        onClick={() => startEdit(row)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-red-600 hover:bg-red-50"
                        onClick={() => setConfirmDeleteCredentialId(row.id)}
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                  {row.url ? (
                    <a
                      href={row.url.match(/^https?:\/\//i) ? row.url : `https://${row.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-xs text-cyan-800 underline-offset-2 hover:underline"
                    >
                      {row.url}
                    </a>
                  ) : null}
                  {row.username ? (
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
                      <span className="truncate font-mono">{row.username}</span>
                      <button
                        type="button"
                        className="shrink-0 rounded-lg border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                        onClick={() => copyText('username', row.username)}
                      >
                        Copy
                      </button>
                    </div>
                  ) : null}
                  {row.secret ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-slate-800 break-all">
                          {revealedIds.has(row.id) ? row.secret : '••••••••'}
                        </span>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            className="rounded-lg border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                            onClick={() => toggleReveal(row.id)}
                          >
                            {revealedIds.has(row.id) ? 'Hide' : 'Show'}
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                            onClick={() => copyText('secret', row.secret)}
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {row.notes ? <p className="text-xs text-slate-600 whitespace-pre-wrap">{row.notes}</p> : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <ErpConfirmDialog
        open={confirmDeleteCredentialId != null}
        title="Delete credential?"
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setConfirmDeleteCredentialId(null)}
        onConfirm={() => void executeDeleteCredential()}
      >
        <p>Remove this credential from the project for everyone. This cannot be undone.</p>
      </ErpConfirmDialog>
    </div>
  );
}
