'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  ERP_ATTENDANCE_BREAK_MENU_TYPES,
  attendanceBreakTypeLabel,
} from '../../../lib/erp-attendance';

/**
 * “Break options ▾” dropdown — pick lunch, namaz, short break, etc.
 */
export default function AttendanceBreakOptionsMenu({
  disabled = false,
  busy = false,
  isOnBreak = false,
  activeBreakType,
  onBreakStart,
  onBreakEnd,
  align = 'right',
  className = '',
  triggerLabel,
  triggerClassName,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });

  const updatePanelPos = () => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const panelW = 196;
    const left =
      align === 'right'
        ? Math.max(8, Math.min(rect.right - panelW, window.innerWidth - panelW - 8))
        : Math.max(8, rect.left);
    setPanelPos({ top: rect.bottom + 6, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPos();
    window.addEventListener('resize', updatePanelPos);
    window.addEventListener('scroll', updatePanelPos, true);
    return () => {
      window.removeEventListener('resize', updatePanelPos);
      window.removeEventListener('scroll', updatePanelPos, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(type) {
    setOpen(false);
    onBreakStart?.(type);
  }

  function resume() {
    setOpen(false);
    onBreakEnd?.();
  }

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled || busy}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={
          triggerClassName ||
          'inline-flex items-center gap-1 text-[11.5px] font-medium text-[#103D4D] disabled:opacity-40 dark:text-teal-200'
        }
      >
        {triggerLabel || 'Break options'} <span className="text-[10px] text-slate-400">▾</span>
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="menu"
          className="fixed z-[500] min-w-[196px] overflow-hidden rounded-lg border border-slate-200/90 bg-white py-1 shadow-lg dark:border-teal-900/45 dark:bg-[#0c121a]"
          style={{ top: panelPos.top, left: panelPos.left }}
        >
          {isOnBreak ? (
            <>
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                On {attendanceBreakTypeLabel(activeBreakType, { short: true }).toLowerCase()} break
              </p>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={resume}
                className="flex w-full px-3 py-2 text-left text-[12px] font-semibold text-[#103D4D] hover:bg-slate-50 disabled:opacity-40 dark:text-teal-100 dark:hover:bg-[#131b24]"
              >
                Resume work
              </button>
            </>
          ) : (
            <>
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Start a break
              </p>
              {ERP_ATTENDANCE_BREAK_MENU_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => pick(type)}
                  className="flex w-full px-3 py-2 text-left text-[12px] text-slate-800 hover:bg-slate-50 disabled:opacity-40 dark:text-slate-100 dark:hover:bg-[#131b24]"
                >
                  {attendanceBreakTypeLabel(type)}
                </button>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
