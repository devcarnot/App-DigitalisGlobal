'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { logErpActivity } from '../../lib/erp-activity-client';
import { normalizeTaskPriority } from '../../lib/erp-task-priority';
import { ERP_TASK_STATUS_LABELS, normalizeTaskStatus } from '../../lib/erp-task-status';
import { formatTaskDueDate, taskDueColorClasses, taskDueStatus } from '../../lib/task-dates';
import ErpBodyPortal from './ErpBodyPortal';
import ChatMessageHtml from './ChatMessageHtml';
import ErpFilePreviewModal from './ErpFilePreviewModal';
import { ReadOnlyPriorityPill } from './TaskPriorityPill';
import ErpUserAvatar from './ErpUserAvatar';
import ErpTaskChecklistAndComments from './ErpTaskChecklistAndComments';
import { erpModalPanelMaxWidthClass } from './ErpModalFormPrimitives';
import { downloadFromSignedUrlWithFallback, basenameFromStoragePath } from '../../lib/browser-download';

function statusPillClass(statusId) {
  if (statusId === 'open') {
    return 'bg-slate-100 text-slate-700 ring-1 ring-slate-300 dark:bg-slate-900/70 dark:text-slate-100 dark:ring-slate-600/60';
  }
  if (statusId === 'in_progress') {
    return 'bg-sky-100 text-sky-800 ring-1 ring-sky-300 dark:bg-sky-950/70 dark:text-sky-100 dark:ring-sky-700/50';
  }
  if (statusId === 'in_review') {
    return 'bg-violet-100 text-violet-800 ring-1 ring-violet-300 dark:bg-violet-950/65 dark:text-violet-100 dark:ring-violet-800/50';
  }
  if (statusId === 'done') {
    return 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-100 dark:ring-emerald-800/45';
  }
  return 'bg-rose-100 text-rose-800 ring-1 ring-rose-300 dark:bg-rose-950/65 dark:text-rose-100 dark:ring-rose-800/50';
}

function normalizeAttachments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((a) => a && typeof a.path === 'string');
  return [];
}

function isImageAttachment(a) {
  const mime = String(a?.mime || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const name = String(a?.name || a?.path || '').toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name);
}

function isVideoAttachment(a) {
  const mime = String(a?.mime || '').toLowerCase();
  if (mime.startsWith('video/')) return true;
  const name = String(a?.name || a?.path || '').toLowerCase();
  return /\.(mp4|mov|webm|m4v|avi|mkv)$/.test(name);
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AttachmentTile({ attachment, signedUrl, onOpen }) {
  const name = attachment.name || attachment.path.split('/').pop() || 'file';
  const img = isImageAttachment(attachment);
  const vid = isVideoAttachment(attachment);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-2.5 text-left shadow-sm transition hover:border-[#103D4D]/40 hover:shadow-md dark:border-teal-800/50 dark:bg-[#121f28] dark:shadow-none dark:hover:border-teal-500/45"
    >
      <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-teal-950/80 dark:to-slate-900/90">
        {img && signedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signedUrl} alt="" className="h-full w-full object-cover" />
        ) : vid && signedUrl ? (
          <video src={signedUrl} className="h-full w-full object-cover" muted playsInline />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-7 w-7 text-slate-500 dark:text-slate-400" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 3.75H7.5a2.25 2.25 0 00-2.25 2.25v12a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25V8.25l-4.5-4.5z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 3.75v4.5h4.5" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{name}</span>
        <span className="block text-[11px] text-slate-500 dark:text-slate-400">
          {img ? 'Image' : vid ? 'Video' : 'File'} · open preview
        </span>
      </span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-[#103D4D] dark:group-hover:text-teal-300" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H18v4.5M18 6L10.5 13.5M6 6h4.5M6 6v12h12v-4.5" />
      </svg>
    </button>
  );
}

/**
 * Read-only detail popup for a project task.
 * Shows title, description (markdown), priority, status, dates, assignees,
 * attachments (images/videos thumbs), and the checklist + comments panel.
 *
 * Buttons:
 *  - Edit  → calls onEdit (caller opens the edit form)
 *  - Delete → inline confirmation that requires typing "delete"; soft deletes the task
 *
 * @param {{
 *   task: object,
 *   userId?: string | null,
 *   nameMap?: Record<string, string>,
 *   avatarProfileFor?: (uid: string) => object,
 *   canManageProject?: boolean,
 *   canDelete?: boolean,
 *   onClose: () => void,
 *   onEdit: (taskId: string) => void,
 *   onDeleted?: (taskId: string) => void,
 *   projectId?: string | null,
 * }} props
 */
export default function ErpProjectTaskDetailModal({
  task,
  userId = null,
  nameMap = {},
  avatarProfileFor,
  canManageProject = false,
  canDelete = false,
  onClose,
  onEdit,
  onDeleted,
  projectId = null,
}) {
  const [signedUrls, setSignedUrls] = useState({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  // Inline preview state — clicking an attachment now opens it inside the
  // app (image lightbox / PDF / video / etc.) instead of bouncing to the
  // system browser via a download or `target="_blank"` link.
  const [attachmentPreview, setAttachmentPreview] = useState(null);

  const attachments = useMemo(() => normalizeAttachments(task?.attachments), [task?.attachments]);
  const assigneeIds = useMemo(() => {
    if (Array.isArray(task?.assignee_ids) && task.assignee_ids.length) {
      return task.assignee_ids.filter(Boolean);
    }
    if (task?.assignee_id) return [task.assignee_id];
    return [];
  }, [task?.assignee_ids, task?.assignee_id]);

  useEffect(() => {
    if (!attachments.length) {
      setSignedUrls({});
      return;
    }
    let cancelled = false;
    (async () => {
      const paths = attachments.map((a) => a.path);
      const { data, error } = await supabase.storage
        .from('erp-files')
        .createSignedUrls(paths, 3600);
      if (cancelled || error || !Array.isArray(data)) return;
      const next = {};
      data.forEach((row, i) => {
        if (row?.signedUrl) next[paths[i]] = row.signedUrl;
      });
      setSignedUrls(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [attachments]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !deleting) {
        if (deleteOpen) setDeleteOpen(false);
        else onClose?.();
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, deleteOpen, deleting]);

  const openAttachment = useCallback((attachment) => {
    const path = typeof attachment === 'string' ? attachment : attachment?.path;
    if (!path) return;
    const name =
      (typeof attachment === 'object' && attachment?.name && String(attachment.name).trim()) ||
      basenameFromStoragePath(path);
    const mime =
      typeof attachment === 'object' ? attachment?.mime || attachment?.mimetype || null : null;
    setAttachmentPreview({ path, name, mime });
  }, []);

  // Kept for legacy call sites that explicitly want to download (the preview
  // modal already exposes its own Download button).
  const downloadAttachment = useCallback(
    async (attachment) => {
      const path = typeof attachment === 'string' ? attachment : attachment?.path;
      if (!path) return;
      const name =
        (typeof attachment === 'object' && attachment?.name && String(attachment.name).trim()) ||
        basenameFromStoragePath(path);
      const existing = signedUrls[path];
      let url = existing;
      if (!url) {
        const { data, error } = await supabase.storage.from('erp-files').createSignedUrl(path, 3600);
        if (error || !data?.signedUrl) return;
        url = data.signedUrl;
      }
      await downloadFromSignedUrlWithFallback(url, name);
    },
    [signedUrls],
  );
  // Mark as referenced so an unused-callback lint doesn't flag it; the helper
  // remains available for future call sites that want pure-download behaviour.
  void downloadAttachment;

  const confirmDelete = useCallback(async () => {
    if (!task?.id) return;
    if (deleteText.trim().toLowerCase() !== 'delete') {
      setDeleteError('Type "delete" to confirm.');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      const { error } = await supabase.from('erp_tasks').delete().eq('id', task.id);
      if (error) {
        setDeleteError(error.message || 'Could not delete task.');
        return;
      }
      if (projectId && userId) {
        void logErpActivity({
          projectId,
          userId,
          action: 'task_deleted',
          meta: { task_id: task.id, title: task.title || '', from: 'project_task_detail' },
        });
      }
      onDeleted?.(task.id);
      onClose?.();
    } finally {
      setDeleting(false);
    }
  }, [task?.id, task?.title, deleteText, onDeleted, onClose, projectId, userId]);

  if (!task) return null;

  const status = normalizeTaskStatus(task.status);
  const statusLabel = ERP_TASK_STATUS_LABELS[status] || 'Open';
  const description = (task.description || '').trim();
  const createdLabel = formatDateTime(task.created_at);

  return (
    <ErpBodyPortal>
      <div
        className="fixed inset-0 z-[270] flex items-end justify-center overflow-y-auto px-0 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-title"
      >
        <button
          type="button"
          className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
          aria-label="Close task details"
          disabled={deleting}
          onClick={() => {
            if (!deleting) onClose?.();
          }}
        />

        <div
          className={`relative flex max-h-[min(92vh,900px)] w-full ${erpModalPanelMaxWidthClass} flex-col overflow-hidden rounded-none border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/5 sm:rounded-2xl dark:border-teal-900/50 dark:bg-[#0b1218] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)] dark:ring-teal-950/35`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative shrink-0 overflow-hidden erp-brand-fill px-5 py-4 shadow-md shadow-teal-900/15 sm:px-6">
            <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-cyan-400/20 blur-2xl" aria-hidden />
            <div className="pointer-events-none absolute -bottom-8 left-1/4 h-24 w-48 rounded-full bg-teal-300/15 blur-xl" aria-hidden />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/95">Task</p>
                <h3
                  id="task-detail-title"
                  className="mt-1 text-lg font-bold tracking-tight text-white sm:text-xl break-words"
                >
                  {task.title || 'Untitled task'}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusPillClass(status)}`}>
                    {statusLabel}
                  </span>
                  <ReadOnlyPriorityPill priority={normalizeTaskPriority(task.priority)} />
                  {createdLabel ? (
                    <span className="text-[11px] text-cyan-100/80">
                      Created {createdLabel}
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={deleting}
                aria-label="Close"
                className="shrink-0 rounded-xl border border-white/25 bg-white/10 px-2.5 py-1 text-lg leading-none text-white/90 transition hover:bg-white/20 disabled:opacity-50"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6 dark:bg-[#070b10] [scrollbar-width:thin]">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 dark:border-teal-800/50 dark:bg-[#0f1824]/95">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Start date</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {task.start_date ? formatTaskDueDate(task.start_date) : <span className="text-slate-400 dark:text-slate-500">Not set</span>}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 dark:border-teal-800/50 dark:bg-[#0f1824]/95">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Due date</p>
                {(() => {
                  const c = taskDueColorClasses(task.due_date ? taskDueStatus(task.due_date) : null);
                  return (
                    <p className={`mt-0.5 text-sm font-semibold ${c.value}`}>
                      {task.due_date ? formatTaskDueDate(task.due_date) : <span className="text-slate-400 dark:text-slate-500">Not set</span>}
                    </p>
                  );
                })()}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Description</p>
              {description ? (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 dark:border-teal-800/50 dark:bg-[#121f28] dark:text-slate-100">
                  <ChatMessageHtml
                    text={description}
                    onMediaOpen={({ url, name }) =>
                      setAttachmentPreview({ url, name, mime: null })
                    }
                  />
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3 text-[12px] italic text-slate-400 dark:border-teal-800/45 dark:bg-[#0f1824]/60 dark:text-slate-500">
                  No description provided.
                </p>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Assignees{assigneeIds.length ? ` · ${assigneeIds.length}` : ''}
              </p>
              {assigneeIds.length ? (
                <ul className="flex flex-wrap gap-2">
                  {assigneeIds.map((uid) => {
                    const profile = avatarProfileFor ? avatarProfileFor(uid) : null;
                    const label = nameMap[uid] || profile?.full_name || uid.slice(0, 8);
                    return (
                      <li
                        key={uid}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 text-[12px] font-semibold text-slate-800 shadow-sm dark:border-teal-800/50 dark:bg-[#121f28] dark:text-slate-100 dark:shadow-none"
                      >
                        {profile ? (
                          <ErpUserAvatar
                            profile={profile}
                            size="sm"
                            alt=""
                            className="!h-6 !w-6 !text-[9px] !ring-0 shadow-none"
                            imgClassName="!ring-0 shadow-none"
                          />
                        ) : null}
                        <span className="max-w-[10rem] truncate">{label}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-2 text-[12px] italic text-slate-400 dark:border-teal-800/45 dark:bg-[#0f1824]/60 dark:text-slate-500">
                  Unassigned
                </p>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Media & files{attachments.length ? ` · ${attachments.length}` : ''}
              </p>
              {attachments.length ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {attachments.map((a) => (
                    <AttachmentTile
                      key={a.path}
                      attachment={a}
                      signedUrl={signedUrls[a.path]}
                      onOpen={() => void openAttachment(a)}
                    />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-2 text-[12px] italic text-slate-400 dark:border-teal-800/45 dark:bg-[#0f1824]/60 dark:text-slate-500">
                  No files attached.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3 sm:p-4 dark:border-teal-900/45 dark:bg-[#0c141c]/95">
              <ErpTaskChecklistAndComments
                taskId={task.id}
                userId={userId}
                nameMap={nameMap}
                avatarProfileFor={avatarProfileFor}
                canManageProject={canManageProject}
              />
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-slate-50/60 px-5 py-3 sm:px-6 dark:border-teal-900/50 dark:bg-[#080d14]">
            {deleteOpen ? (
              <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/70 p-3 dark:border-rose-900/50 dark:bg-rose-950/40">
                <p className="text-[12px] font-semibold text-rose-800 dark:text-rose-100">
                  This will permanently delete the task, its checklist, and comments.
                </p>
                <p className="text-[11px] text-rose-700/90 dark:text-rose-200/90">
                  Type <span className="font-mono font-bold">delete</span> below to confirm.
                </p>
                <input
                  type="text"
                  value={deleteText}
                  onChange={(e) => {
                    setDeleteText(e.target.value);
                    if (deleteError) setDeleteError('');
                  }}
                  placeholder="delete"
                  disabled={deleting}
                  autoFocus
                  className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-rose-900 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-300/40 disabled:opacity-60 dark:border-rose-800/60 dark:bg-[#1a0f12] dark:text-rose-100 dark:placeholder:text-rose-400/70 dark:focus:border-rose-500 dark:focus:ring-rose-900/40"
                />
                {deleteError ? (
                  <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">{deleteError}</p>
                ) : null}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (deleting) return;
                      setDeleteOpen(false);
                      setDeleteText('');
                      setDeleteError('');
                    }}
                    disabled={deleting}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-200 dark:hover:bg-[#1a2835]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmDelete()}
                    disabled={deleting || deleteText.trim().toLowerCase() !== 'delete'}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-md shadow-rose-900/20 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deleting ? 'Deleting…' : 'Delete task'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteOpen(true);
                        setDeleteText('');
                        setDeleteError('');
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-rose-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 dark:border-rose-900/55 dark:bg-rose-950/35 dark:text-rose-200 dark:shadow-none dark:hover:border-rose-800 dark:hover:bg-rose-950/55"
                      aria-label="Delete task"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden>
                        <path d="M3 6h18" strokeLinecap="round" />
                        <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Delete
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-200 dark:hover:bg-[#1a2835]"
                  >
                    Close
                  </button>
                  {typeof onEdit === 'function' ? (
                    <button
                      type="button"
                      onClick={() => onEdit(task.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl erp-brand-fill px-4 py-2 text-xs font-bold uppercase tracking-wide shadow-md shadow-sky-900/25 transition"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3.5 w-3.5" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.25 2.25 0 113.182 3.182L7.5 19.213l-4.5 1 1-4.5 12.862-12.226z" />
                      </svg>
                      Edit
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <ErpFilePreviewModal
        file={attachmentPreview}
        onClose={() => setAttachmentPreview(null)}
      />
    </ErpBodyPortal>
  );
}
