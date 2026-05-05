'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

const BTN_CLASS =
  'relative isolate w-full min-w-[11rem] cursor-pointer rounded-xl border border-slate-200 bg-white pl-3.5 pr-10 py-2 text-left text-sm font-semibold ' +
  'text-slate-800 shadow-sm transition hover:border-slate-300/90 focus-visible:border-[#103D4D]/40 focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-cyan-400/25 ' +
  'dark:border-teal-800/50 dark:bg-[#101a22] dark:text-slate-200 dark:shadow-black/35 dark:hover:border-teal-700/50 ' +
  'dark:focus-visible:border-teal-600/55 dark:focus-visible:ring-teal-500/20';

const PANEL_CLASS =
  'absolute left-0 top-full z-[140] mt-1 max-h-[min(18rem,60vh)] w-[min(calc(100vw-2rem),20rem)] min-w-[11rem] overflow-y-auto rounded-xl border border-slate-200 ' +
  'bg-white py-1.5 shadow-xl ring-1 ring-slate-900/[0.06] dark:border-teal-800/65 dark:bg-[#0f1a23] dark:ring-teal-950/40';

const ROW_CLASS =
  'flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm transition hover:bg-slate-50 dark:hover:bg-white/[0.06]';

const CB_CLASS =
  'h-4 w-4 shrink-0 rounded border-slate-300 text-[#103D4D] focus:ring-cyan-500/40 dark:border-teal-700 dark:bg-[#121f28] dark:text-teal-500';

/**
 * Multi-select dropdown for ERP filter toolbars (types, channels).
 * Empty `value` = no filtering (typically shown as placeholder).
 *
 * @param {object} props
 * @param {string} [props.id]
 * @param {string} props.placeholder e.g. "All types"
 * @param {{ value: string, label: string }[]} props.options
 * @param {string[]} props.value Selected option values (subset of options).
 * @param {(next: string[]) => void} props.onChange
 */
export default function ErpFilterMultiSelect({ id, placeholder, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedSet = useMemo(() => new Set(value), [value]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      const el = rootRef.current;
      if (!el || !(e.target instanceof Node) || el.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const summary = useMemo(() => {
    if (!value.length) return placeholder;
    if (value.length === 1) {
      const o = options.find((x) => x.value === value[0]);
      return o?.label || value[0];
    }
    return `${value.length} selected`;
  }, [value, options, placeholder]);

  const toggle = (v) => {
    if (selectedSet.has(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  };

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        type="button"
        id={id}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={BTN_CLASS}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="block truncate pr-0.5">{summary}</span>
        <span
          className={
            'pointer-events-none absolute inset-y-px right-px z-[1] flex w-10 items-center justify-center ' +
            'rounded-r-[11px] border-l border-slate-200/75 bg-gradient-to-b from-slate-50/98 to-slate-100/90 text-[#103D4D] ' +
            'dark:border-teal-900/55 dark:bg-gradient-to-b dark:from-[#141f2c] dark:to-[#0a1218] dark:text-teal-300'
          }
          aria-hidden
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} className="h-4 w-4 shrink-0 opacity-90">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {open ? (
        <div
          className={PANEL_CLASS}
          role="listbox"
          aria-multiselectable="true"
          onMouseDown={(e) => e.preventDefault()}
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400">No options</p>
          ) : (
            options.map((o) => {
              const checked = selectedSet.has(o.value);
              return (
                <label key={o.value} className={ROW_CLASS}>
                  <input
                    type="checkbox"
                    className={CB_CLASS}
                    checked={checked}
                    onChange={() => toggle(o.value)}
                  />
                  <span className="min-w-0 flex-1 font-medium text-slate-800 dark:text-slate-100">{o.label}</span>
                </label>
              );
            })
          )}
          {value.length > 0 ? (
            <div className="border-t border-slate-100 px-2 py-1.5 dark:border-teal-900/50">
              <button
                type="button"
                className="w-full rounded-lg px-2 py-1.5 text-center text-xs font-bold text-[#103D4D] hover:bg-slate-50 dark:text-teal-300 dark:hover:bg-white/[0.06]"
                onClick={() => onChange([])}
              >
                Clear selection
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
