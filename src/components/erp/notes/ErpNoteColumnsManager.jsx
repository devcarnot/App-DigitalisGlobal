'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ErpBodyPortal from '../ErpBodyPortal';
import {
  erpModalBackdropClass,
  erpModalFooterClass,
  erpModalPanelClass,
  ErpModalCloseButton,
  ErpModalFieldLabel,
  erpModalInputClass,
} from '../ErpModalFormPrimitives';
import {
  ERP_NOTE_COLORS,
  ERP_NOTE_DEFAULT_COLOR,
  ERP_NOTE_DEFAULT_COLUMNS,
  makeColumnKey,
  noteColorDotClass,
} from './erpNotesConstants';

/**
 * Modal for managing the Kanban board's columns:
 *  - rename, recolor and reorder existing columns
 *  - add new columns (e.g. "Urgent" in rose)
 *  - delete a column (any notes in it move to the first remaining column so
 *    nothing is ever lost)
 *
 * The actual persistence lives in the parent (`ErpNotesBoard`) — this modal
 * just edits a working copy and calls `onSave(columns, { notesToMove })` when
 * the user clicks "Save changes".
 *
 * Props:
 *  - open: boolean
 *  - columns: ErpNoteColumn[]                      (current board state)
 *  - notesByColumn: Record<string, number>         (counts per column_key, for the delete-with-notes warning)
 *  - onClose: () => void
 *  - onSave: (
 *      next: ErpNoteColumn[],
 *      opts: { reassignments: Record<string, string> }
 *    ) => Promise<void>
 *      `reassignments` maps "removed column key" → "new column key" so the
 *      parent can move existing notes en-masse before persisting.
 *  - busy: boolean
 */
export default function ErpNoteColumnsManager({
  open,
  columns,
  notesByColumn = {},
  onClose,
  onSave,
  busy = false,
}) {
  const [draft, setDraft] = useState(/** @type {{key:string,title:string,color:string}[]} */ ([]));
  const [removedKeys, setRemovedKeys] = useState(/** @type {string[]} */ ([]));
  const [err, setErr] = useState('');

  // Reset working copy each time the modal opens (or when the source columns
  // change while it's open — defensive).
  useEffect(() => {
    if (!open) return;
    setDraft(columns?.length ? columns.map((c) => ({ ...c })) : ERP_NOTE_DEFAULT_COLUMNS.map((c) => ({ ...c })));
    setRemovedKeys([]);
    setErr('');
  }, [columns, open]);

  // Esc closes (when not in the middle of a save).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose, open]);

  const draftKeys = useMemo(() => draft.map((c) => c.key), [draft]);

  const updateColumnAt = useCallback((index, patch) => {
    setDraft((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }, []);

  const moveColumn = useCallback((index, dir) => {
    setDraft((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  }, []);

  const removeColumnAt = useCallback((index) => {
    setDraft((prev) => {
      const removed = prev[index];
      if (!removed) return prev;
      if (prev.length <= 1) return prev; // never let the board go empty
      setRemovedKeys((rk) => (rk.includes(removed.key) ? rk : [...rk, removed.key]));
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const addColumn = useCallback(() => {
    setDraft((prev) => {
      const existingKeys = prev.map((c) => c.key);
      const title = 'New lane';
      const key = makeColumnKey(title, existingKeys);
      // Pick a color that isn't already on the board if possible — keeps the
      // board visually distinguishable by default.
      const taken = new Set(prev.map((c) => c.color));
      const colorChoice =
        ERP_NOTE_COLORS.find((c) => !taken.has(c.id))?.id || ERP_NOTE_DEFAULT_COLOR;
      return [...prev, { key, title, color: colorChoice }];
    });
  }, []);

  const handleSave = useCallback(async () => {
    setErr('');
    const cleaned = draft
      .map((c) => ({ ...c, title: String(c.title || '').trim() }))
      .filter((c) => c.title);
    if (!cleaned.length) {
      setErr('At least one column is required.');
      return;
    }
    const dupTitles = new Set();
    for (const c of cleaned) {
      const t = c.title.toLowerCase();
      if (dupTitles.has(t)) {
        setErr(`Duplicate column name: "${c.title}".`);
        return;
      }
      dupTitles.add(t);
    }
    // Notes that lived in a removed column get re-homed to the first column
    // in the new layout. The parent uses this map to issue a single
    // UPDATE … IN (…) per fallback target.
    const fallbackKey = cleaned[0].key;
    const reassignments = {};
    for (const k of removedKeys) {
      if (!cleaned.some((c) => c.key === k)) {
        reassignments[k] = fallbackKey;
      }
    }
    try {
      await onSave(cleaned, { reassignments });
    } catch (saveErr) {
      setErr(saveErr?.message || 'Could not save column changes.');
    }
  }, [draft, onSave, removedKeys]);

  if (!open) return null;

  return (
    <ErpBodyPortal>
      <div
        className="fixed inset-0 z-[110] flex items-stretch justify-center p-0 sm:p-4"
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
          aria-labelledby="erp-note-columns-title"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-cyan-50/40 px-5 py-4 dark:border-teal-900/45 dark:bg-gradient-to-r dark:from-[#0f2438] dark:via-[#0b1e2e] dark:to-[#061018]">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Notes board
              </p>
              <h2
                id="erp-note-columns-title"
                className="mt-1 truncate text-base font-bold text-slate-900 dark:text-white"
              >
                Manage columns
              </h2>
            </div>
            <ErpModalCloseButton onClose={onClose} />
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Each column has its own color — every card in a column inherits it. Notes that live in a deleted column move to the first column on save.
            </p>

            <ul className="space-y-2.5">
              {draft.map((col, idx) => {
                const count = notesByColumn[col.key] || 0;
                const canDelete = draft.length > 1;
                return (
                  <li
                    key={`${col.key}-${idx}`}
                    className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-teal-900/45 dark:bg-[#0f1820]"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-2 sm:w-10">
                        <button
                          type="button"
                          onClick={() => moveColumn(idx, -1)}
                          disabled={busy || idx === 0}
                          aria-label="Move column up"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-300 dark:hover:bg-[#1a2732]"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3.5 w-3.5" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveColumn(idx, 1)}
                          disabled={busy || idx === draft.length - 1}
                          aria-label="Move column down"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-300 dark:hover:bg-[#1a2732]"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3.5 w-3.5" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>

                      <div className="grid flex-1 grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <div>
                          <ErpModalFieldLabel htmlFor={`col-name-${idx}`}>Name</ErpModalFieldLabel>
                          <input
                            id={`col-name-${idx}`}
                            type="text"
                            value={col.title}
                            onChange={(e) => updateColumnAt(idx, { title: e.target.value })}
                            disabled={busy}
                            maxLength={60}
                            className={erpModalInputClass}
                            placeholder="e.g. Urgent"
                          />
                        </div>
                        <div>
                          <ErpModalFieldLabel>Color</ErpModalFieldLabel>
                          <div className="flex flex-wrap gap-1.5">
                            {ERP_NOTE_COLORS.map((c) => {
                              const active = col.color === c.id;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => updateColumnAt(idx, { color: c.id })}
                                  disabled={busy}
                                  title={c.label}
                                  aria-pressed={active}
                                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${
                                    active
                                      ? 'border-slate-900/30 bg-white shadow-sm dark:border-teal-300/40 dark:bg-[#121f28]'
                                      : 'border-slate-200 bg-white/60 hover:bg-white dark:border-teal-800/55 dark:bg-[#0f1820]/70 dark:hover:bg-[#121f28]'
                                  }`}
                                >
                                  <span className={`inline-block h-3 w-3 rounded-full ${noteColorDotClass(c.id)}`} aria-hidden />
                                  <span className="text-slate-700 dark:text-slate-200">{c.label.split(' ')[0]}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 sm:w-32 sm:items-stretch">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          {count} {count === 1 ? 'note' : 'notes'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeColumnAt(idx)}
                          disabled={busy || !canDelete}
                          title={canDelete ? 'Delete this column' : 'At least one column is required'}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-rose-700 hover:bg-rose-50 disabled:opacity-40 dark:border-rose-900/55 dark:bg-[#121f28] dark:text-rose-200 dark:hover:bg-rose-950/40"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={addColumn}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-slate-300/80 bg-white/40 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:border-slate-400 hover:bg-white disabled:opacity-50 dark:border-teal-800/55 dark:bg-[#0f1820]/40 dark:text-slate-300 dark:hover:border-teal-700/70 dark:hover:bg-[#0f1820]/70"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3.5 w-3.5" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add column
            </button>

            {removedKeys.some((k) => (notesByColumn[k] || 0) > 0) ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-900/55 dark:bg-amber-950/40 dark:text-amber-200">
                Some notes will be moved to “{draft[0]?.title || 'the first column'}” when you save — none are deleted.
              </p>
            ) : null}

            {err ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900/55 dark:bg-rose-950/40 dark:text-rose-200">
                {err}
              </p>
            ) : null}
          </div>

          <div className={erpModalFooterClass}>
            <div className="flex-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {draftKeys.length} {draftKeys.length === 1 ? 'column' : 'columns'}
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
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="inline-flex items-center justify-center rounded-xl erp-brand-fill px-5 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-md disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </ErpBodyPortal>
  );
}
