'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import ErpBodyPortal from '../ErpBodyPortal';
import { ErpDateTimeInput } from '../ErpDateInput';
import {
  erpModalBackdropClass,
  erpModalFooterClass,
  erpModalPanelClass,
  ErpModalCloseButton,
  erpModalInputClass,
  erpModalTitleInputClass,
  ErpModalFieldLabel,
} from '../ErpModalFormPrimitives';
import { uploadInlineImageToErpFiles } from '../../../lib/erp-inline-image-upload';

/** Lazy-load the WYSIWYG editor on the client only — its `isomorphic-dompurify`
 *  + jsdom transitive imports break Turbopack's SSR bundle on Windows, and the
 *  editor isn't useful during SSR anyway. */
const MarkdownWysiwygEditor = dynamic(() => import('../../MarkdownWysiwygEditor'), {
  ssr: false,
  loading: () => (
    <div className="h-32 w-full animate-pulse rounded-2xl border border-slate-200 bg-slate-100/70 dark:border-teal-800/50 dark:bg-[#121f28]" />
  ),
});
import {
  ERP_NOTE_DEFAULT_COLUMN,
  ERP_NOTE_DEFAULT_COLUMNS,
  noteColorDotClass,
  resolveNoteColumn,
} from './erpNotesConstants';

const datetimeLocalValue = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Format yyyy-MM-ddTHH:mm in the viewer's local zone.
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const datetimeLocalToIso = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

/**
 * Create / edit a personal note.
 *
 * Props:
 *  - open: boolean
 *  - note: existing row (edit) or `null` (create)
 *  - columns: ErpNoteColumn[] — the user's current Kanban layout. Drives both
 *      the Column dropdown and the visual color swatch shown next to it (the
 *      column owns the color now — there's no per-note color picker anymore).
 *  - defaultColumn: column_key to seed for new notes
 *  - onClose: () => void
 *  - onSave: ({ title, body, column_key, pinned, due_at }) => Promise<void>
 *  - onDelete?: () => Promise<void>  (only shown in edit mode)
 *  - busy: boolean — disables form during in-flight save / delete
 */
export default function ErpNoteEditorModal({
  open,
  note,
  columns,
  defaultColumn = ERP_NOTE_DEFAULT_COLUMN,
  onClose,
  onSave,
  onDelete,
  busy = false,
}) {
  const isEdit = Boolean(note?.id);

  const lanes = useMemo(() => {
    return Array.isArray(columns) && columns.length ? columns : ERP_NOTE_DEFAULT_COLUMNS;
  }, [columns]);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [columnKey, setColumnKey] = useState(defaultColumn);
  const [pinned, setPinned] = useState(false);
  const [dueLocal, setDueLocal] = useState('');
  const [err, setErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editorBumpRef = useRef(0);

  // Reset whenever the modal opens (or is reused for a different note).
  useEffect(() => {
    if (!open) return;
    setTitle(note?.title || '');
    setBody(note?.body || '');
    const seedKey = note?.column_key || defaultColumn;
    // If the saved column_key no longer exists in the user's layout, fall
    // back to the first lane so the dropdown isn't empty.
    const validKey = lanes.some((c) => c.key === seedKey) ? seedKey : lanes[0]?.key || ERP_NOTE_DEFAULT_COLUMN;
    setColumnKey(validKey);
    setPinned(Boolean(note?.pinned));
    setDueLocal(datetimeLocalValue(note?.due_at));
    setErr('');
    setConfirmDelete(false);
    editorBumpRef.current += 1;
  }, [open, note?.id, defaultColumn, note?.body, note?.column_key, note?.due_at, note?.pinned, note?.title, lanes]);

  const editorResetKey = useMemo(() => `${note?.id || 'new'}:${editorBumpRef.current}`, [note?.id]);

  /** The column the user has currently picked — used for the color swatch
   *  next to the dropdown so they get visual feedback for the lane choice. */
  const activeColumn = useMemo(() => resolveNoteColumn(columnKey, lanes), [columnKey, lanes]);

  const handleSubmit = useCallback(
    async (e) => {
      e?.preventDefault?.();
      const t = title.trim();
      if (!t) {
        setErr('Title is required.');
        return;
      }
      setErr('');
      try {
        await onSave({
          title: t,
          body: String(body || '').trim(),
          column_key: columnKey,
          pinned,
          due_at: datetimeLocalToIso(dueLocal),
        });
      } catch (saveErr) {
        setErr(saveErr?.message || 'Could not save the note.');
      }
    },
    [body, columnKey, dueLocal, onSave, pinned, title],
  );

  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setErr('');
    try {
      await onDelete();
    } catch (delErr) {
      setErr(delErr?.message || 'Could not delete the note.');
    }
  }, [confirmDelete, onDelete]);

  // Close on Escape so the modal feels like the rest of the ERP shell.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose, open]);

  if (!open) return null;

  return (
    <ErpBodyPortal>
      <div
        className="fixed inset-0 z-[100] flex items-stretch justify-center p-0 sm:p-4"
        role="presentation"
      >
        <button
          type="button"
          aria-label="Close dialog"
          onClick={() => !busy && onClose?.()}
          className={erpModalBackdropClass}
        />
        <div
          className={erpModalPanelClass}
          role="dialog"
          aria-modal="true"
          aria-labelledby="erp-note-editor-title"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-cyan-50/40 px-5 py-4 dark:border-teal-900/45 dark:bg-gradient-to-r dark:from-[#0f2438] dark:via-[#0b1e2e] dark:to-[#061018]">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {isEdit ? 'Edit note' : 'New note'}
              </p>
              <h2
                id="erp-note-editor-title"
                className="mt-1 truncate text-base font-bold text-slate-900 dark:text-white"
              >
                {title || (isEdit ? 'Untitled note' : 'Capture what is next')}
              </h2>
            </div>
            <ErpModalCloseButton onClose={onClose} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
              <section className="space-y-2.5">
                <ErpModalFieldLabel htmlFor="erp-note-title" required>
                  Title
                </ErpModalFieldLabel>
                <input
                  id="erp-note-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs to happen?"
                  className={erpModalTitleInputClass}
                  maxLength={200}
                  disabled={busy}
                  autoFocus={!isEdit}
                />
              </section>

              <section className="space-y-2.5">
                <ErpModalFieldLabel optional>Details</ErpModalFieldLabel>
                <MarkdownWysiwygEditor
                  resetKey={editorResetKey}
                  value={body}
                  onChange={setBody}
                  disabled={busy}
                  placeholder="Add context, links, screenshots…"
                  onImagePaste={(file) => uploadInlineImageToErpFiles(file, { folder: 'note' })}
                  onImagePasteError={(error) => setErr(error?.message || 'Image upload failed.')}
                />
              </section>

              <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2.5">
                  <ErpModalFieldLabel htmlFor="erp-note-column">Column</ErpModalFieldLabel>
                  <div className="relative">
                    {/* Color swatch echoes the column's color so the user
                        sees at a glance what the card will look like. */}
                    <span
                      className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 inline-block h-2.5 w-2.5 rounded-full ${noteColorDotClass(activeColumn?.color)}`}
                      aria-hidden
                    />
                    <select
                      id="erp-note-column"
                      value={columnKey}
                      onChange={(e) => setColumnKey(e.target.value)}
                      disabled={busy}
                      className={`${erpModalInputClass} pl-8`}
                    >
                      {lanes.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <ErpModalFieldLabel htmlFor="erp-note-due">Due (optional)</ErpModalFieldLabel>
                  <ErpDateTimeInput
                    id="erp-note-due"
                    value={dueLocal}
                    onChange={(e) => setDueLocal(e.target.value)}
                    disabled={busy}
                    className={erpModalInputClass}
                  />
                </div>
                <div className="space-y-2.5">
                  <ErpModalFieldLabel>Pin to top</ErpModalFieldLabel>
                  <button
                    type="button"
                    onClick={() => setPinned((v) => !v)}
                    disabled={busy}
                    aria-pressed={pinned}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${
                      pinned
                        ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/45 dark:text-amber-200'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-200 dark:hover:bg-[#1a2732]'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                    </svg>
                    {pinned ? 'Pinned' : 'Pin to top'}
                  </button>
                </div>
              </section>

              {err ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900/55 dark:bg-rose-950/40 dark:text-rose-200">
                  {err}
                </p>
              ) : null}
            </div>

            <div className={erpModalFooterClass}>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {isEdit && onDelete ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={busy}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wide transition disabled:opacity-50 ${
                      confirmDelete
                        ? 'border-rose-500 bg-rose-600 text-white shadow-md hover:bg-rose-700'
                        : 'border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50 dark:border-rose-900/55 dark:bg-[#121f28] dark:text-rose-200 dark:hover:bg-rose-950/40'
                    }`}
                  >
                    {confirmDelete ? 'Click again to confirm' : 'Delete'}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-teal-800/50 dark:bg-[#121f28] dark:text-slate-200 dark:hover:bg-[#1a2732]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !title.trim()}
                className="inline-flex items-center justify-center rounded-xl erp-brand-fill px-5 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-md disabled:opacity-50"
              >
                {busy ? 'Saving…' : isEdit ? 'Save note' : 'Create note'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ErpBodyPortal>
  );
}

