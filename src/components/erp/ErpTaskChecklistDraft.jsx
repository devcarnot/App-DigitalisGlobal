'use client';

import { useMemo, useRef, useState } from 'react';
import {
  checklistTitleLengthError,
  ERP_TASK_CHECKLIST_TITLE_MAX_CHARS,
  normalizeChecklistItemTitle,
} from '../../lib/erp-task-checklist';

function IconPlus({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconTrash({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M3 6h18" strokeLinecap="round" />
      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconEdit({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M4 20h4l11-11-4-4L4 16v4z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheckbox({ checked, className = 'h-4 w-4' }) {
  return checked ? (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path
        d="M7.5 12.5l3 3L17 9"
        stroke="white"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  ) : (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
    </svg>
  );
}

function newDraftId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Local checklist editor for the Add task modal (saved when the task is created).
 *
 * @param {{ items: { id: string, title: string, done?: boolean }[], onItemsChange: (items: object[]) => void, disabled?: boolean }} props
 */
export default function ErpTaskChecklistDraft({ items = [], onItemsChange, disabled = false }) {
  const [newItemTitle, setNewItemTitle] = useState('');
  const [err, setErr] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemTitle, setEditingItemTitle] = useState('');
  const editingItemInputRef = useRef(null);

  const progress = useMemo(() => {
    const total = items.length;
    const done = items.filter((it) => it.done).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, pct };
  }, [items]);

  function addItem() {
    const title = normalizeChecklistItemTitle(newItemTitle);
    if (!title || disabled) return;
    const lengthErr = checklistTitleLengthError(title);
    if (lengthErr) {
      setErr(lengthErr);
      return;
    }
    setErr('');
    onItemsChange?.([...items, { id: newDraftId(), title, done: false }]);
    setNewItemTitle('');
  }

  function toggleItem(item) {
    if (!item?.id || disabled) return;
    onItemsChange?.(items.map((it) => (it.id === item.id ? { ...it, done: !it.done } : it)));
  }

  function deleteItem(item) {
    if (!item?.id || disabled) return;
    onItemsChange?.(items.filter((it) => it.id !== item.id));
    if (editingItemId === item.id) {
      setEditingItemId(null);
      setEditingItemTitle('');
    }
  }

  function beginEditItem(item) {
    if (disabled) return;
    setEditingItemId(item.id);
    setEditingItemTitle(item.title || '');
    queueMicrotask(() => {
      editingItemInputRef.current?.focus();
      editingItemInputRef.current?.select();
    });
  }

  function cancelEditItem() {
    setEditingItemId(null);
    setEditingItemTitle('');
  }

  function saveEditItem() {
    const title = normalizeChecklistItemTitle(editingItemTitle);
    if (!editingItemId) return;
    if (!title) {
      deleteItem({ id: editingItemId });
      return;
    }
    const lengthErr = checklistTitleLengthError(title);
    if (lengthErr) {
      setErr(lengthErr);
      return;
    }
    setErr('');
    onItemsChange?.(items.map((it) => (it.id === editingItemId ? { ...it, title } : it)));
    cancelEditItem();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50/60 p-3.5 shadow-sm dark:border-teal-800/40 dark:bg-[#101824] dark:[background-image:none] dark:shadow-black/25">
      <header className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-100">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path d="M4 6h10M4 12h8M4 18h6" strokeLinecap="round" />
              <path d="M16 14l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
            Checklist <span className="font-normal normal-case text-slate-400 dark:text-slate-500">(optional)</span>
          </h4>
          {progress.total > 0 ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 dark:bg-teal-950/55 dark:text-slate-300">
              {progress.done}/{progress.total}
            </span>
          ) : null}
        </div>
        {progress.total > 0 ? (
          <span className="text-[10px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{progress.pct}%</span>
        ) : null}
      </header>

      {progress.total > 0 ? (
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/90">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all dark:bg-teal-600 dark:[background-image:none]"
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">
          Break this task into steps. Items are saved when you create the task.
        </p>
      ) : (
        <div className="mb-2 max-h-[min(220px,38vh)] overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
          <ul className="space-y-1.5">
            {items.map((item) => {
              const isEditing = editingItemId === item.id;
              return (
                <li
                  key={item.id}
                  className={`group flex items-start gap-2 rounded-xl border px-2 py-1.5 transition-colors ${
                    item.done
                      ? 'border-emerald-200/80 bg-emerald-50/60 dark:border-emerald-900/45 dark:bg-emerald-950/30'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-teal-900/40 dark:bg-[#121f28] dark:hover:border-teal-800/60'
                  }`}
                >
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleItem(item)}
                    className={`mt-0.5 flex-none transition-colors ${
                      item.done
                        ? 'text-emerald-600 hover:text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-400 hover:text-teal-700 dark:text-slate-500 dark:hover:text-teal-400'
                    }`}
                    aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
                  >
                    <IconCheckbox checked={item.done} className="h-4 w-4" />
                  </button>
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        ref={editingItemInputRef}
                        value={editingItemTitle}
                        maxLength={ERP_TASK_CHECKLIST_TITLE_MAX_CHARS}
                        disabled={disabled}
                        onChange={(e) => setEditingItemTitle(e.target.value)}
                        onBlur={saveEditItem}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            saveEditItem();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelEditItem();
                          }
                        }}
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-900 outline-none focus:border-[#103D4D]/50 dark:border-teal-800/50 dark:bg-[#0c141c] dark:text-slate-100 dark:focus:border-teal-500/45"
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => beginEditItem(item)}
                        className={`block w-full cursor-text break-words text-left text-[13px] ${
                          item.done
                            ? 'text-slate-500 line-through dark:text-slate-500'
                            : 'text-slate-800 dark:text-slate-100'
                        }`}
                        title="Click to edit"
                      >
                        {item.title}
                      </button>
                    )}
                  </div>
                  {!isEditing && !disabled ? (
                    <div className="flex flex-none items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => beginEditItem(item)}
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
                        aria-label="Edit item"
                      >
                        <IconEdit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteItem(item)}
                        className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                        aria-label="Delete item"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-400 dark:border-teal-800/60 dark:text-slate-500">
          <IconPlus className="h-3.5 w-3.5" />
        </span>
        <input
          value={newItemTitle}
          maxLength={ERP_TASK_CHECKLIST_TITLE_MAX_CHARS}
          disabled={disabled}
          onChange={(e) => setNewItemTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            addItem();
          }}
          placeholder="Add checklist item and press Enter"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-900 outline-none focus:border-[#103D4D]/40 dark:border-teal-800/50 dark:bg-[#121f28] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-500/45 disabled:opacity-50"
        />
        <button
          type="button"
          disabled={
            disabled ||
            !normalizeChecklistItemTitle(newItemTitle) ||
            Boolean(checklistTitleLengthError(normalizeChecklistItemTitle(newItemTitle)))
          }
          onClick={addItem}
          className="rounded-lg erp-brand-fill px-3 py-1.5 text-[11px] font-bold text-white shadow-sm disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {err ? <p className="mt-2 text-[11px] font-medium text-rose-600 dark:text-rose-400">{err}</p> : null}
    </section>
  );
}
