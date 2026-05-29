'use client';

import { useEffect, useMemo, useState } from 'react';
import ErpBodyPortal from './ErpBodyPortal';
import {
  MOBILE_QUICK_ACTIONS_DEFAULT,
  MOBILE_QUICK_MAX,
  MOBILE_QUICK_MIN,
} from '../../lib/erp-mobile-quick-actions';

export default function ErpMobileQuickActionsEditor({
  open,
  onClose,
  onSave,
  selectedItems = [],
  availableItems = [],
  iconMap,
}) {
  const [draftHrefs, setDraftHrefs] = useState([]);

  useEffect(() => {
    if (!open) return;
    setDraftHrefs(selectedItems.map((item) => item.href));
  }, [open, selectedItems]);

  const draftSet = useMemo(() => new Set(draftHrefs), [draftHrefs]);

  const draftItems = useMemo(() => {
    const byHref = new Map(selectedItems.map((item) => [item.href, item]));
    for (const item of availableItems) byHref.set(item.href, item);
    return draftHrefs.map((href) => byHref.get(href)).filter(Boolean);
  }, [draftHrefs, selectedItems, availableItems]);

  const addPool = useMemo(
    () => availableItems.filter((item) => !draftSet.has(item.href)),
    [availableItems, draftSet],
  );

  const canSave = draftHrefs.length >= MOBILE_QUICK_MIN && draftHrefs.length <= MOBILE_QUICK_MAX;
  const atMax = draftHrefs.length >= MOBILE_QUICK_MAX;

  const removeHref = (href) => {
    if (draftHrefs.length <= MOBILE_QUICK_MIN) return;
    setDraftHrefs((prev) => prev.filter((h) => h !== href));
  };

  const addHref = (href) => {
    if (atMax || draftSet.has(href)) return;
    setDraftHrefs((prev) => [...prev, href]);
  };

  const moveHref = (href, dir) => {
    setDraftHrefs((prev) => {
      const idx = prev.indexOf(href);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  };

  const resetDefault = () => {
    setDraftHrefs([...MOBILE_QUICK_ACTIONS_DEFAULT]);
  };

  if (!open) return null;

  return (
    <ErpBodyPortal>
      <div className="fixed inset-0 z-[62] lg:hidden" role="presentation">
        <button
          type="button"
          className="absolute inset-0 bg-[#103D4D]/60 motion-safe:animate-[erpFadeIn_180ms_ease-out]"
          onClick={onClose}
          aria-label="Close editor"
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit quick actions"
          className="absolute inset-x-0 bottom-0 flex max-h-[min(82vh,36rem)] flex-col pb-[calc(5rem+env(safe-area-inset-bottom))]"
        >
          <div className="mx-2 mb-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl border border-slate-200/90 bg-white shadow-[0_-12px_40px_-8px_rgba(16,61,77,0.25)] motion-safe:animate-[erpSlideUp_280ms_ease-out] dark:border-teal-900/55 dark:bg-[#0a121a]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3 dark:border-teal-900/45">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-[#103D4D] dark:text-teal-50">Edit quick actions</h2>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Add or remove shortcuts — up to {MOBILE_QUICK_MAX} items.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:border-teal-800/55 dark:text-slate-300"
              >
                Cancel
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3 [scrollbar-width:thin]">
              <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-teal-800/50 dark:text-teal-300/55">
                Your shortcuts ({draftHrefs.length}/{MOBILE_QUICK_MAX})
              </p>
              {draftItems.length === 0 ? (
                <p className="mt-2 rounded-xl border border-dashed border-slate-300/70 px-3 py-4 text-center text-xs text-slate-500 dark:border-teal-800/45 dark:text-slate-400">
                  Pick items below to add them.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {draftItems.map((item, index) => {
                    const Icon = iconMap?.[item.iconId];
                    return (
                      <li
                        key={item.href}
                        className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-2 py-2 dark:border-teal-900/45 dark:bg-[#101820]"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#103D4D] ring-1 ring-slate-200/80 dark:bg-[#0f1a24] dark:text-cyan-100 dark:ring-teal-800/50">
                          {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                          {item.label}
                        </span>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => moveHref(item.href, -1)}
                            className="rounded-md px-1.5 py-1 text-[10px] font-bold text-slate-500 disabled:opacity-30 dark:text-slate-400"
                            aria-label={`Move ${item.label} up`}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={index === draftItems.length - 1}
                            onClick={() => moveHref(item.href, 1)}
                            className="rounded-md px-1.5 py-1 text-[10px] font-bold text-slate-500 disabled:opacity-30 dark:text-slate-400"
                            aria-label={`Move ${item.label} down`}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            disabled={draftHrefs.length <= MOBILE_QUICK_MIN}
                            onClick={() => removeHref(item.href)}
                            className="rounded-md px-1.5 py-1 text-[10px] font-bold text-rose-600 disabled:opacity-30 dark:text-rose-400"
                            aria-label={`Remove ${item.label}`}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="mt-4 px-1 text-[10px] font-bold uppercase tracking-wide text-teal-800/50 dark:text-teal-300/55">
                Add from menu
              </p>
              {addPool.length === 0 ? (
                <p className="mt-2 px-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {atMax ? 'Maximum reached — remove one to add another.' : 'All available items are already added.'}
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {addPool.map((item) => {
                    const Icon = iconMap?.[item.iconId];
                    return (
                      <button
                        key={item.href}
                        type="button"
                        disabled={atMax}
                        onClick={() => addHref(item.href)}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-cyan-200/80 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#103D4D] shadow-sm disabled:opacity-40 dark:border-teal-800/55 dark:bg-[#0f1a24] dark:text-cyan-100"
                      >
                        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
                        <span className="truncate">+ {item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 px-3 py-3 dark:border-teal-900/45">
              <button
                type="button"
                onClick={resetDefault}
                className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 dark:border-teal-800/55 dark:text-slate-300"
              >
                Reset default
              </button>
              <button
                type="button"
                disabled={!canSave}
                onClick={() => onSave?.(draftHrefs)}
                className="rounded-xl erp-brand-fill px-4 py-2 text-[11px] font-bold text-white shadow-sm disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </ErpBodyPortal>
  );
}
