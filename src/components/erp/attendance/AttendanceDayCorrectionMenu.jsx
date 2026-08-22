'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  correctionOptionsForDay,
  buildCorrectionItemFromDay,
  formatCorrectionClock,
} from '../../../lib/erp-attendance-corrections';

function formatMenuDateLabel(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr).slice(0, 10);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function PunchChip({ label, value, tone = 'in' }) {
  const tones = {
    in: 'border-teal-200/80 bg-teal-50/90 text-teal-900 dark:border-teal-800/50 dark:bg-teal-950/35 dark:text-teal-100',
    out: 'border-slate-200/90 bg-slate-50/90 text-slate-800 dark:border-teal-900/45 dark:bg-[#131b24] dark:text-slate-200',
  };
  return (
    <div className={`min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 ${tones[tone] || tones.in}`}>
      <p className="text-[9px] font-bold uppercase tracking-[0.1em] opacity-70">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[12px] font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function AttendanceDayCorrectionMenu({
  anchor,
  dateStr,
  row,
  outcome,
  todayStr,
  onClose,
  onOpenCorrection,
}) {
  const options = correctionOptionsForDay({ dateStr, row, outcome, todayStr });

  useEffect(() => {
    if (!anchor) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [anchor, onClose]);

  if (!anchor || options.length === 0) return null;

  const menuWidth = 288;
  const left = Math.min(Math.max(8, anchor.x), window.innerWidth - menuWidth - 8);
  const top = Math.min(Math.max(8, anchor.y), window.innerHeight - 240);

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[550] cursor-default bg-slate-900/10 backdrop-blur-[1px] dark:bg-black/20"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div
        className="fixed z-[560] w-[min(100vw-16px,288px)] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_20px_50px_-16px_rgba(16,61,77,0.35)] dark:border-teal-900/45 dark:bg-[#0c121a] dark:shadow-none"
        style={{ left, top }}
        role="menu"
      >
        <div className="relative overflow-hidden border-b border-slate-100/80 px-3.5 py-3 dark:border-teal-900/35">
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-teal-50/90 via-white to-cyan-50/50 dark:from-teal-950/25 dark:via-[#0c121a] dark:to-cyan-950/10"
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[#103D4D] to-teal-500" aria-hidden />
          <div className="relative">
            <p className="text-[12px] font-bold tracking-tight text-[#103D4D] dark:text-white">
              {formatMenuDateLabel(dateStr)}
            </p>
            <div className="mt-2.5 flex gap-2">
              <PunchChip label="Check in" value={formatCorrectionClock(row?.check_in_at)} tone="in" />
              <PunchChip label="Check out" value={formatCorrectionClock(row?.check_out_at)} tone="out" />
            </div>
          </div>
        </div>

        <ul className="space-y-0.5 p-1.5">
          {options.map((opt) => (
            <li key={opt.requestKind}>
              <button
                type="button"
                role="menuitem"
                className="group w-full rounded-xl border border-transparent px-2.5 py-2.5 text-left transition hover:border-teal-200/70 hover:bg-gradient-to-r hover:from-teal-50/80 hover:to-white dark:hover:border-teal-800/45 dark:hover:from-teal-950/25 dark:hover:to-[#101824]"
                onClick={() => {
                  onOpenCorrection?.(
                    buildCorrectionItemFromDay({ dateStr, row, requestKind: opt.requestKind }),
                  );
                  onClose?.();
                }}
              >
                <p className="text-[11.5px] font-semibold text-[#103D4D] transition group-hover:text-teal-800 dark:text-teal-100 dark:group-hover:text-teal-200">
                  {opt.label}
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-slate-500 dark:text-slate-400">{opt.description}</p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>,
    document.body,
  );
}
