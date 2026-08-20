'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function normalizeId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function computePosition(triggerRect, popoverHeight, viewportPadding = 8) {
  if (!triggerRect) return { left: 0, top: 0, width: 0, placeAbove: false };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceBelow = vh - triggerRect.bottom;
  const spaceAbove = triggerRect.top;
  const placeAbove = spaceBelow < Math.min(popoverHeight, 240) && spaceAbove > spaceBelow;

  const width = Math.max(triggerRect.width, 200);
  const left = Math.max(viewportPadding, Math.min(triggerRect.left, vw - width - viewportPadding));
  const top = placeAbove
    ? Math.max(viewportPadding, triggerRect.top - popoverHeight - 4)
    : Math.min(vh - viewportPadding - popoverHeight, triggerRect.bottom + 4);
  return { left, top, width, placeAbove };
}

/**
 * Single-select with optional "Add new" input (admins/leads).
 * @param {{
 *   valueId: string,
 *   options: {id: string, label: string}[],
 *   onChange: (nextId: string) => void,
 *   placeholder?: string,
 *   canCreate?: boolean,
 *   createLabel?: string, // short caption; shown as `${createLabel}…` heading above the creator row unless it already ends with …
 *   onCreate?: (payload: {id: string, label: string}) => Promise<void>,
 *   disabled?: boolean,
 *   className?: string,
 * }} props
 */
export default function ErpCreatableSelect({
  valueId,
  options,
  onChange,
  placeholder = 'Select…',
  canCreate = false,
  createLabel = '+ Add new',
  onCreate,
  disabled = false,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [err, setErr] = useState('');
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, placeAbove: false });

  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const byId = useMemo(() => {
    const map = new Map();
    for (const o of options || []) map.set(String(o.id), String(o.label || o.id));
    return map;
  }, [options]);
  const label = byId.get(String(valueId || '')) || '';

  const addNewHeading = String(createLabel).trim().endsWith('…')
    ? String(createLabel).trim()
    : `${String(createLabel).trim()}…`;

  const optionCount = (options || []).length;

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const popoverHeight = popover ? popover.offsetHeight : Math.min(280, optionCount * 40 + (canCreate ? 120 : 16));
    setPosition(computePosition(triggerRect, popoverHeight));
  }, [canCreate, optionCount]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const id = requestAnimationFrame(() => reposition());
    return () => cancelAnimationFrame(id);
  }, [open, optionCount, canCreate, reposition]);

  useEffect(() => {
    if (!open) return undefined;
    const onResize = () => reposition();
    const onScroll = (e) => {
      if (popoverRef.current?.contains(e.target)) return;
      reposition();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) {
      const t = e.target;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
      setNewLabel('');
      setErr('');
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        setNewLabel('');
        setErr('');
      }
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function submitNew() {
    if (!canCreate || !onCreate) return;
    const nextLabel = newLabel.trim();
    if (!nextLabel) return;
    const id = normalizeId(nextLabel);
    if (!id) return;
    const exists =
      (options || []).some((o) => String(o?.id) === id) ||
      (options || []).some((o) => String(o?.label || '').toLowerCase() === nextLabel.toLowerCase());
    if (exists) {
      setErr('Already exists.');
      return;
    }
    setErr('');
    setAdding(true);
    try {
      await onCreate({ id, label: nextLabel });
      onChange(id);
      setNewLabel('');
      setAdding(false);
      setOpen(false);
    } catch (e) {
      setErr(e?.message || 'Could not add.');
      setAdding(false);
    }
  }

  return (
    <div className={`relative min-w-0 ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={
          'flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-800 shadow-sm ' +
          'transition hover:border-slate-300/90 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 disabled:opacity-60 ' +
          'dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-100 dark:shadow-black/25 dark:hover:border-teal-700/50 dark:focus:ring-teal-500/20'
        }
      >
        <span className="min-w-0 flex-1 truncate">
          {label || <span className="text-slate-400 dark:text-slate-500">{placeholder}</span>}
        </span>
        <span
          className={`shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          ▼
        </span>
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              style={{
                position: 'fixed',
                left: position.left,
                top: position.top,
                minWidth: position.width,
                maxHeight: 'min(320px, 60vh)',
              }}
              className="z-[600] flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-teal-900/55 dark:bg-[#101824] dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.65)]"
            >
              <div className="max-h-64 overflow-y-auto p-2 [scrollbar-width:thin]">
                {(options || []).map((o) => {
                  const id = String(o.id);
                  const lab = String(o.label || o.id);
                  const checked = String(valueId || '') === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        onChange(id);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-teal-950/45 ${
                        checked ? 'bg-slate-50 dark:bg-teal-950/55' : ''
                      }`}
                      role="option"
                      aria-selected={checked}
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold text-slate-800 dark:text-slate-100">
                        {lab}
                      </span>
                      {checked ? <span className="text-[#103D4D] dark:text-teal-300">✓</span> : null}
                    </button>
                  );
                })}
              </div>

              {canCreate ? (
                <div className="border-t border-slate-200/70 dark:border-teal-900/45">
                  <p className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-wide text-[#103D4D] dark:text-teal-300">
                    {addNewHeading}
                  </p>
                  <div className="flex items-center gap-2 px-2 pb-2">
                    <input
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="Type name and press Enter"
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#103D4D]/40 focus:ring-2 focus:ring-cyan-400/20 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-500/45 dark:focus:ring-teal-500/20"
                      disabled={adding}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void submitNew();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void submitNew()}
                      disabled={adding || !newLabel.trim()}
                      className="shrink-0 rounded-xl erp-brand-fill px-3 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-50"
                    >
                      +
                    </button>
                  </div>
                  {err ? (
                    <p className="mt-1.5 px-2 pb-2 text-[11px] font-medium text-rose-700 dark:text-rose-400">{err}</p>
                  ) : null}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
