'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function normalizeId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const v of arr || []) {
    const s = String(v || '');
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Multi-select with checkboxes + optional "Add new" row.
 * @param {{
 *   valueIds: string[],
 *   options: {id: string, label: string}[],
 *   onChange: (nextIds: string[]) => void,
 *   placeholder?: string,
 *   canCreate?: boolean,
 *   createLabel?: string,
 *   onCreate?: (payload: {id: string, label: string}) => Promise<void>,
 *   disabled?: boolean,
 *   className?: string,
 * }} props
 */
export default function ErpCreatableMultiSelect({
  valueIds,
  options,
  onChange,
  placeholder = 'Select…',
  canCreate = false,
  createLabel = 'Add',
  onCreate,
  disabled = false,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const shellRef = useRef(null);

  const byId = useMemo(() => {
    const map = new Map();
    for (const o of options || []) {
      if (o?.id) map.set(String(o.id), String(o.label || o.id));
    }
    return map;
  }, [options]);

  const selected = useMemo(() => uniq(valueIds), [valueIds]);

  const selectedLabels = useMemo(() => {
    return selected.map((id) => byId.get(id) || id);
  }, [selected, byId]);

  const toggle = useCallback(
    (id) => {
      const cur = new Set(selected);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      onChange([...cur]);
    },
    [selected, onChange],
  );

  const visibleOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options || [];
    return (options || []).filter((o) => {
      const id = String(o?.id || '').toLowerCase();
      const lab = String(o?.label || '').toLowerCase();
      return id.includes(q) || lab.includes(q);
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      const t = e.target;
      if (shellRef.current && t instanceof Node && shellRef.current.contains(t)) return;
      setOpen(false);
      setAdding(false);
      setNewLabel('');
      setErr('');
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        setAdding(false);
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

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  async function submitNew() {
    if (!canCreate || !onCreate) return;
    const label = (newLabel || query).trim();
    if (!label) return;
    const id = normalizeId(label);
    if (!id) return;
    const exists = (options || []).some((o) => String(o?.id) === id) || (options || []).some((o) => String(o?.label || '').toLowerCase() === label.toLowerCase());
    if (exists) {
      setErr('Already exists.');
      return;
    }
    setErr('');
    setAdding(true);
    try {
      await onCreate({ id, label });
      onChange(uniq([...selected, id]));
      setNewLabel('');
      setQuery('');
      setAdding(false);
    } catch (e) {
      setErr(e?.message || 'Could not add.');
      setAdding(false);
    }
  }

  return (
    <div ref={shellRef} className={`relative min-w-0 ${className}`.trim()}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={
          'flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-800 shadow-sm ' +
          'transition hover:border-slate-300/90 focus:outline-none focus:ring-2 focus:ring-cyan-400/25 disabled:opacity-60'
        }
      >
        <span className="min-w-0 flex-1">
          {selectedLabels.length ? (
            <span className="flex flex-wrap gap-1.5">
              {selectedLabels.slice(0, 4).map((t) => (
                <span key={t} className="inline-flex max-w-full items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                  <span className="truncate">{t}</span>
                </span>
              ))}
              {selectedLabels.length > 4 ? (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                  +{selectedLabels.length - 4}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </span>
        <span className="shrink-0 text-slate-500" aria-hidden>
          ▼
        </span>
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-[#121a22] dark:shadow-black/50">
          <div className="border-b border-slate-100 p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter…"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-[#103D4D]/35 focus:ring-2 focus:ring-cyan-400/20"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-2 [scrollbar-width:thin]">
            {visibleOptions.length === 0 ? (
              <p className="px-2.5 py-2 text-[11px] text-slate-500">
                No matches{canCreate ? '. Use the field below to add a new one.' : '.'}
              </p>
            ) : null}
            {visibleOptions.map((o) => {
              const id = String(o.id);
              const lab = String(o.label || o.id);
              const checked = selected.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-slate-50"
                  role="option"
                  aria-selected={checked}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? 'border-[#103D4D] bg-[#103D4D] text-white' : 'border-slate-300 bg-white text-white'}`}>
                    ✓
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{lab}</span>
                </button>
              );
            })}
          </div>

          {canCreate ? (
            <div className="border-t border-slate-200/70 p-2">
              <div className="flex items-center gap-2">
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={`${createLabel}…`}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#103D4D]/40 focus:ring-2 focus:ring-cyan-400/20"
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
                  className="shrink-0 rounded-xl bg-[#103D4D] px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#0d3442] disabled:opacity-50"
                >
                  +
                </button>
              </div>
              {err ? <p className="mt-1.5 text-[11px] font-medium text-rose-700">{err}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

