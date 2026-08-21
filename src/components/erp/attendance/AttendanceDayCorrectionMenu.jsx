'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { correctionOptionsForDay, buildCorrectionItemFromDay } from '../../../lib/erp-attendance-corrections';

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

  const left = Math.min(Math.max(8, anchor.x), window.innerWidth - 268);
  const top = Math.min(Math.max(8, anchor.y), window.innerHeight - 220);

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[550] cursor-default bg-transparent"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div
        className="fixed z-[560] w-[min(100vw-16px,260px)] overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl dark:border-teal-900/45 dark:bg-[#0c121a]"
        style={{ left, top }}
        role="menu"
      >
        <div className="border-b border-slate-100 px-3 py-2 dark:border-teal-900/35">
          <p className="text-[11px] font-bold text-slate-900 dark:text-white">{String(dateStr).slice(0, 10)}</p>
          <p className="text-[10px] text-slate-500">Request a correction</p>
        </div>
        <ul className="p-1">
          {options.map((opt) => (
            <li key={opt.requestKind}>
              <button
                type="button"
                role="menuitem"
                className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-teal-950/30"
                onClick={() => {
                  onOpenCorrection?.(
                    buildCorrectionItemFromDay({ dateStr, row, requestKind: opt.requestKind }),
                  );
                  onClose?.();
                }}
              >
                <p className="text-[11.5px] font-semibold text-[#103D4D] dark:text-teal-100">{opt.label}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{opt.description}</p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>,
    document.body,
  );
}
