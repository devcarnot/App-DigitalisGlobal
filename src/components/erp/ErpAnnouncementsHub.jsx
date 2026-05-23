'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { pushErpAppToast } from '../../lib/erp-app-toast';
import { ERP_DARK_ACCOUNT_CARD, ERP_DARK_PRIMARY_BUTTON } from '../../lib/erp-dark-surfaces';
import { formatErpFetchError } from '../../lib/supabase-errors';
import { isErpGlobalAdmin } from '../../lib/erp-roles';
import { useErpSession } from './useErpSession';
import ErpAccessDeniedCard from './ErpAccessDeniedCard';
import ErpAdminPageHero from './ErpAdminPageHero';
import ErpConfirmDialog from './ErpConfirmDialog';
import ChatMessageHtml from './ChatMessageHtml';

function formatWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return String(iso);
  }
}

const PRIMARY_ACTION_BUTTON = [
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-cyan-400/60',
  'px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-900/20',
  'transition hover:brightness-105 disabled:pointer-events-none disabled:opacity-50',
  'dark:border-teal-600/55',
  ERP_DARK_PRIMARY_BUTTON,
].join(' ');

const SECONDARY_ACTION_BUTTON =
  'inline-flex items-center justify-center rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-teal-800/50 dark:bg-[#121a22] dark:text-slate-200 dark:hover:bg-[#162029]';

const CARD_EDIT_BUTTON =
  'rounded-lg border border-slate-200/80 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-teal-800/50 dark:text-slate-200 dark:hover:bg-[#162029]';

const CARD_DELETE_BUTTON =
  'rounded-lg border border-rose-200/80 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900/50 dark:text-rose-300 dark:hover:bg-rose-950/40';

const FIELD_INPUT_CLASS =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/20 dark:border-teal-900/50 dark:bg-[#121a22] dark:text-slate-100';

export default function ErpAnnouncementsHub() {
  const { erpCan, profile } = useErpSession();
  const searchParams = useSearchParams();
  const highlightId = searchParams?.get('id') || '';

  const canView = erpCan('announcements', 'view');
  const canPublish = isErpGlobalAdmin(profile?.role);

  const [announcements, setAnnouncements] = useState([]);
  const [authorsById, setAuthorsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notProvisioned, setNotProvisioned] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [savingEditId, setSavingEditId] = useState(null);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const res = await erpAuthorizedFetch('/api/erp/announcements');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load announcements');
      setAnnouncements(Array.isArray(data.announcements) ? data.announcements : []);
      setAuthorsById(data.authorsById && typeof data.authorsById === 'object' ? data.authorsById : {});
      setNotProvisioned(Boolean(data.notProvisioned));
    } catch (e) {
      setError(formatErpFetchError(e?.message || 'Could not load announcements'));
      setAnnouncements([]);
      setAuthorsById({});
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!highlightId || loading) return;
    const el = document.getElementById(`announcement-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-cyan-400/50');
      const t = window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-cyan-400/50');
      }, 2400);
      return () => window.clearTimeout(t);
    }
  }, [highlightId, loading, announcements]);

  const isEmpty = !loading && announcements.length === 0;

  async function publishAnnouncement(e) {
    e.preventDefault();
    if (!canPublish || publishing) return;
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) {
      pushErpAppToast({
        title: 'Missing fields',
        body: 'Add a title and message before publishing.',
        tone: 'error',
      });
      return;
    }

    setPublishing(true);
    try {
      const res = await erpAuthorizedFetch('/api/erp/announcements', {
        method: 'POST',
        body: JSON.stringify({ title: trimmedTitle, body: trimmedBody }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not publish announcement');

      setComposeOpen(false);
      setTitle('');
      setBody('');
      await load();

      const sent = data.broadcast?.emailsSent ?? 0;
      const recipients = data.broadcast?.recipients ?? 0;
      const failed = data.broadcast?.emailsFailed ?? 0;
      const skipped = data.broadcast?.emailsSkippedNoAddress ?? 0;
      const emailErrors = Array.isArray(data.broadcast?.emailErrors) ? data.broadcast.emailErrors : [];

      let toastBody = 'Your announcement is live in the workspace.';
      if (recipients > 0) {
        toastBody = `Notified ${recipients} team member${recipients === 1 ? '' : 's'}`;
        if (sent > 0) toastBody += ` · ${sent} email${sent === 1 ? '' : 's'} sent`;
        if (skipped > 0) toastBody += ` · ${skipped} without an email on file`;
        if (failed > 0) {
          toastBody += ` · ${failed} email${failed === 1 ? '' : 's'} failed`;
          if (emailErrors[0]) toastBody += ` (${emailErrors[0]})`;
        } else if (sent === 0 && skipped === 0 && recipients > 0) {
          toastBody += ' · no emails were sent (check Resend/domain config)';
        }
      }

      pushErpAppToast({
        title: 'Announcement published',
        body: toastBody,
        tone: failed > 0 || (recipients > 0 && sent === 0 && skipped === 0) ? 'info' : 'success',
      });
    } catch (err) {
      pushErpAppToast({
        title: 'Could not publish',
        body: formatErpFetchError(err?.message || 'Publish failed'),
        tone: 'error',
      });
    } finally {
      setPublishing(false);
    }
  }

  async function deleteAnnouncement(row) {
    if (!row?.id || !canPublish) return;
    setBusyId(row.id);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/announcements/${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete announcement');
      setAnnouncements((prev) => prev.filter((a) => a.id !== row.id));
      if (editingId === row.id) {
        setEditingId(null);
        setEditTitle('');
        setEditBody('');
      }
      pushErpAppToast({ title: 'Announcement deleted', tone: 'success' });
    } catch (err) {
      pushErpAppToast({
        title: 'Could not delete',
        body: formatErpFetchError(err?.message || 'Delete failed'),
        tone: 'error',
      });
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  }

  function startEditing(row) {
    if (!row?.id || !canPublish) return;
    setComposeOpen(false);
    setTitle('');
    setBody('');
    setEditingId(row.id);
    setEditTitle(row.title || '');
    setEditBody(row.body || '');
  }

  function cancelEditing() {
    setEditingId(null);
    setEditTitle('');
    setEditBody('');
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editingId || !canPublish || savingEditId) return;
    const trimmedTitle = editTitle.trim();
    const trimmedBody = editBody.trim();
    if (!trimmedTitle || !trimmedBody) {
      pushErpAppToast({
        title: 'Missing fields',
        body: 'Add a title and message before saving.',
        tone: 'error',
      });
      return;
    }

    setSavingEditId(editingId);
    try {
      const res = await erpAuthorizedFetch(`/api/erp/announcements/${encodeURIComponent(editingId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: trimmedTitle, body: trimmedBody }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save changes');

      const updated = data.announcement;
      setAnnouncements((prev) =>
        prev.map((row) => (row.id === editingId ? { ...row, ...updated } : row)),
      );
      cancelEditing();
      pushErpAppToast({ title: 'Announcement updated', tone: 'success' });
    } catch (err) {
      pushErpAppToast({
        title: 'Could not save',
        body: formatErpFetchError(err?.message || 'Update failed'),
        tone: 'error',
      });
    } finally {
      setSavingEditId(null);
    }
  }

  const heroDescription = useMemo(() => {
    if (canPublish) {
      return 'Post important workspace updates (Eid holidays, office closures, policy changes). Everyone on the internal team gets an in-app notification and email.';
    }
    return 'Important updates from Super Admin — holidays, closures, and workspace news.';
  }, [canPublish]);

  if (!canView) {
    return (
      <ErpAccessDeniedCard message="Announcements are not available for your role." />
    );
  }

  return (
    <div className="space-y-6">
      <ErpAdminPageHero
        eyebrow="Communication"
        title="Announcements"
        description={heroDescription}
        accent="amber"
      />

      {canPublish ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              cancelEditing();
              setComposeOpen((v) => !v);
            }}
            className={composeOpen ? SECONDARY_ACTION_BUTTON : PRIMARY_ACTION_BUTTON}
          >
            {composeOpen ? 'Cancel' : 'New announcement'}
          </button>
        </div>
      ) : null}

      {composeOpen && canPublish ? (
        <form
          onSubmit={publishAnnouncement}
          className={`rounded-2xl border border-amber-200/60 bg-white/90 p-5 shadow-sm dark:border-amber-900/40 ${ERP_DARK_ACCOUNT_CARD}`}
        >
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Compose announcement</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Markdown links are supported. All internal staff will receive email and a workspace notification.
          </p>
          <label className="mt-4 block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="E.g. Eid holidays — office closed"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/20 dark:border-teal-900/50 dark:bg-[#121a22] dark:text-slate-100"
            />
          </label>
          <label className="mt-3 block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Message</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={12000}
              placeholder="Share dates, instructions, and any links the team needs."
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/20 dark:border-teal-900/50 dark:bg-[#121a22] dark:text-slate-100"
            />
          </label>
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={publishing} className={PRIMARY_ACTION_BUTTON}>
              {publishing ? 'Publishing…' : 'Publish & notify team'}
            </button>
          </div>
        </form>
      ) : null}

      {notProvisioned ? (
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          Announcements database table is not set up yet. Run migration{' '}
          <code className="rounded bg-white/70 px-1 py-0.5 text-xs dark:bg-black/30">
            20260601120000_erp_announcements.sql
          </code>{' '}
          in the Supabase SQL editor.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading announcements…</p>
      ) : null}

      {isEmpty && !notProvisioned ? (
        <div
          className={`rounded-2xl border border-dashed border-slate-200/80 px-6 py-12 text-center dark:border-teal-900/45 ${ERP_DARK_ACCOUNT_CARD}`}
        >
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No announcements yet</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {canPublish
              ? 'Post the first update for your team.'
              : 'When Super Admin posts an update, it will appear here.'}
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        {announcements.map((row) => {
          const author = authorsById[row.created_by]?.full_name || 'Super Admin';
          const highlighted = highlightId && row.id === highlightId;
          const isEditing = editingId === row.id;
          const rowBusy = busyId === row.id || savingEditId === row.id;
          return (
            <article
              key={row.id}
              id={`announcement-${row.id}`}
              className={`rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm transition dark:border-teal-900/45 dark:bg-[#0f1720]/90 ${
                highlighted ? 'ring-2 ring-cyan-400/50' : ''
              }`}
            >
              {isEditing ? (
                <form onSubmit={saveEdit} className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Edit announcement</h3>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Title</span>
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      maxLength={200}
                      className={FIELD_INPUT_CLASS}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Message</span>
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={6}
                      maxLength={12000}
                      className={FIELD_INPUT_CLASS}
                    />
                  </label>
                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    <button type="button" onClick={cancelEditing} className={SECONDARY_ACTION_BUTTON}>
                      Cancel
                    </button>
                    <button type="submit" disabled={rowBusy} className={PRIMARY_ACTION_BUTTON}>
                      {rowBusy ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Important
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{row.title}</h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {author} · {formatWhen(row.created_at)}
                        {row.updated_at ? ` · edited ${formatWhen(row.updated_at)}` : ''}
                      </p>
                    </div>
                    {canPublish ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          disabled={rowBusy}
                          onClick={() => startEditing(row)}
                          className={CARD_EDIT_BUTTON}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={rowBusy}
                          onClick={() => setConfirmDelete(row)}
                          className={CARD_DELETE_BUTTON}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-4 border-t border-slate-100 pt-4 dark:border-teal-900/35">
                    <ChatMessageHtml text={row.body} className="text-sm" />
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>

      <ErpConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete announcement?"
        description="This permanently deletes the announcement for everyone. Email notifications already sent cannot be recalled."
        confirmLabel="Delete"
        tone="danger"
        busy={Boolean(busyId)}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void deleteAnnouncement(confirmDelete)}
      />
    </div>
  );
}
