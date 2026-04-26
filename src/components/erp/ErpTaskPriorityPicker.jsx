'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ERP_TASK_PRIORITY_LABELS,
  ERP_TASK_PRIORITY_ORDER,
  ERP_TASK_PRIORITY_PILL_CLASS,
  ERP_TASK_PRIORITY_SELECT_CLASS,
  normalizeTaskPriority,
} from '../../lib/erp-task-priority';

/** Closed-state sizing, matches the pill sizing used outside on the task. */
const SIZE = {
  sm: {
    btn: 'max-w-[9rem] rounded-full !pl-2.5 !pr-6 py-1 text-[9px] leading-none font-bold uppercase',
    caret: 'right-1.5 h-2.5 w-2.5',
    menu: 'min-w-[9rem] text-[10px]',
    row: 'px-2 py-1 text-[9px] leading-none',
  },
  xs: {
    btn: 'max-w-[5.5rem] rounded-full !pl-2 !pr-4 py-0.5 text-[8px] leading-none font-bold uppercase',
    caret: 'right-1 h-2 w-2',
    menu: 'min-w-[7.5rem] text-[10px]',
    row: 'px-1.5 py-1 text-[8px] leading-none',
  },
};

/**
 * Popover priority picker whose options reuse the same pill colors shown on the task outside.
 * Drop-in replacement for the native &lt;select&gt; previously used for priority.
 *
 * @param {{
 *   value: string,
 *   onChange: (next: string) => void,
 *   disabled?: boolean,
 *   size?: 'sm' | 'xs',
 *   ariaLabel?: string,
 *   className?: string,
 *   onPointerDown?: (e: React.PointerEvent) => void,
 * }} props
 */
export default function ErpTaskPriorityPicker({
  value,
  onChange,
  disabled = false,
  size = 'sm',
  ariaLabel = 'Task priority',
  className = '',
  onPointerDown,
}) {
  const s = SIZE[size] || SIZE.sm;
  const current = normalizeTaskPriority(value);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0 });

  const close = useCallback(() => setOpen(false), []);

  const place = useCallback(() => {
    const b = btnRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const gap = 4;
    const menuW = Math.max(r.width, 140);
    const menuH = 6 + ERP_TASK_PRIORITY_ORDER.length * 28;
    let left = r.left;
    let top = r.bottom + gap;
    if (typeof window !== 'undefined') {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (left + menuW > vw - 8) left = Math.max(8, vw - menuW - 8);
      if (top + menuH > vh - 8) top = Math.max(8, r.top - gap - menuH);
      if (left < 8) left = 8;
    }
    setPos({ left, top, width: menuW });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const onScroll = () => place();
    const onResize = () => place();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    const onAway = (e) => {
      if (e.button !== 0) return;
      if (menuRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onAway);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onAway);
    };
  }, [open, close]);

  const choose = useCallback(
    (id) => {
      close();
      if (id !== current) onChange(id);
    },
    [close, onChange, current]
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        className={[
          'relative inline-flex items-center justify-start border tracking-wide whitespace-nowrap shrink-0',
          'outline-none transition-shadow focus:ring-2 focus:ring-offset-1 focus:ring-white/80',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          s.btn,
          ERP_TASK_PRIORITY_SELECT_CLASS[current],
          className,
        ].join(' ')}
      >
        <span className="truncate">{ERP_TASK_PRIORITY_LABELS[current]}</span>
        <span
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${s.caret} opacity-90`}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-full w-full">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              aria-label={ariaLabel}
              className={`fixed z-[500] rounded-xl border border-slate-200 bg-white p-1 shadow-xl ring-1 ring-slate-900/10 ${s.menu}`}
              style={{ left: pos.left, top: pos.top, minWidth: pos.width }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {ERP_TASK_PRIORITY_ORDER.map((id) => {
                const selected = id === current;
                return (
                  <button
                    key={id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => choose(id)}
                    className={[
                      'flex w-full items-center justify-between gap-2 rounded-lg font-bold uppercase tracking-wide',
                      'transition-transform hover:scale-[1.01] hover:shadow-md focus:outline-none',
                      s.row,
                      ERP_TASK_PRIORITY_PILL_CLASS[id],
                      selected ? 'ring-2 ring-offset-1 ring-white/70' : '',
                      'my-0.5',
                    ].join(' ')}
                  >
                    <span className="truncate">{ERP_TASK_PRIORITY_LABELS[id]}</span>
                    {selected ? (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        className="h-3 w-3 shrink-0 opacity-90"
                        aria-hidden
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : null}
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
