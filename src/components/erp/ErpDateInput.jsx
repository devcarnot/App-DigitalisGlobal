'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  buildCalendarCells,
  dateToYmd,
  formatYmdDisplay,
  isYmdDisabled,
  joinDatetimeLocalValue,
  splitDatetimeLocalValue,
  ymdToDate,
} from '../../lib/erp-mini-calendar';
import { todayDateInputValue } from '../../lib/task-dates';

export const ERP_DATE_INPUT_CLASS =
  'erp-date-input w-full min-w-0';

/** Fixed-width date control for datetime rows and compact toolbars. */
export const ERP_DATE_INPUT_INLINE_CLASS = 'erp-date-input w-[11.5rem] max-w-full shrink-0';

const FIELD_SHELL_BASE =
  'flex min-h-[2.625rem] items-stretch overflow-hidden rounded-lg border shadow-sm transition ' +
  'border-slate-200 bg-white hover:border-slate-300 ' +
  'focus-within:border-slate-400 focus-within:outline-none focus-within:ring-2 focus-within:ring-slate-200/80 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  'dark:border-slate-700 dark:bg-[#141c24] dark:shadow-none dark:hover:border-slate-600 ' +
  'dark:focus-within:border-slate-500 dark:focus-within:ring-slate-700/50';

const FIELD_INNER =
  'min-w-0 flex-1 border-0 bg-transparent py-2 pl-3.5 pr-1 text-sm font-medium text-slate-800 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-0 ' +
  'dark:text-slate-200 dark:placeholder:text-slate-500';

const CALENDAR_BTN =
  'flex w-10 shrink-0 items-center justify-center border-l border-slate-200 bg-slate-50 ' +
  'text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 ' +
  'dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200';

const TIME_INPUT_CLASS =
  'erp-date-input h-[2.625rem] w-[7.5rem] shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition ' +
  'focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200/80 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  'dark:border-slate-700 dark:bg-[#141c24] dark:text-slate-200 dark:focus:border-slate-500 dark:focus:ring-slate-700/50';

/** Above ERP modals (highest overlay is z-[1300]). */
export const ERP_MINI_CALENDAR_Z_INDEX = 1400;

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function CalendarIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 8.25h18M4.5 6.75h15a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5h-15a1.5 1.5 0 01-1.5-1.5v-12a1.5 1.5 0 011.5-1.5z"
      />
    </svg>
  );
}

function computePanelPosition(triggerRect, panelHeight = 320) {
  if (!triggerRect) return { left: 0, top: 0, width: 280 };
  const pad = 8;
  const width = Math.max(triggerRect.width, 280);
  const left = Math.max(pad, Math.min(triggerRect.left, window.innerWidth - width - pad));
  const spaceBelow = window.innerHeight - triggerRect.bottom;
  const placeAbove = spaceBelow < panelHeight && triggerRect.top > spaceBelow;
  const top = placeAbove
    ? Math.max(pad, triggerRect.top - panelHeight - 6)
    : Math.min(window.innerHeight - pad - panelHeight, triggerRect.bottom + 6);
  return { left, top, width };
}

function emitValue(onChange, value) {
  onChange?.({ target: { value } });
}

/**
 * Modern date field with a portal mini-calendar (replaces native `type="date"`).
 * Value format: `YYYY-MM-DD`.
 */
export function ErpMiniCalendarPanel({
  value,
  onSelect,
  min,
  max,
  onClose,
  panelStyle,
  panelId,
}) {
  const selected = ymdToDate(value);
  const todayYmd = todayDateInputValue();
  const initial = selected || ymdToDate(todayYmd) || new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  useEffect(() => {
    const d = ymdToDate(value);
    if (!d) return;
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [value]);

  const cells = useMemo(() => buildCalendarCells(viewYear, viewMonth), [viewYear, viewMonth]);
  const monthLabel = useMemo(
    () => new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    [viewYear, viewMonth],
  );

  const shiftMonth = (delta) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  return (
    <div
      id={panelId}
      role="dialog"
      aria-label="Choose date"
      style={{ ...panelStyle, zIndex: ERP_MINI_CALENDAR_Z_INDEX }}
      className="fixed overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-lg ring-1 ring-slate-900/[0.04] dark:border-slate-700 dark:bg-[#141c24] dark:shadow-black/40 dark:ring-white/[0.04]"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Previous month"
        >
          ‹
        </button>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{monthLabel}</p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const disabled = isYmdDisabled(cell.ymd, min, max);
          const selectedCell = value && cell.ymd === value;
          const todayCell = cell.ymd === todayYmd;
          return (
            <button
              key={cell.ymd}
              type="button"
              disabled={disabled}
              onClick={() => {
                onSelect(cell.ymd);
                onClose?.();
              }}
              className={`flex h-9 w-full items-center justify-center rounded-xl text-sm font-semibold transition ${
                selectedCell
                  ? 'erp-brand-fill text-white shadow-sm'
                  : todayCell
                    ? 'border border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
                    : cell.inMonth
                      ? 'text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/[0.07]'
                      : 'text-slate-400 hover:bg-slate-50 dark:text-slate-600 dark:hover:bg-white/[0.04]'
              } disabled:cursor-not-allowed disabled:opacity-35`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-700">
        <button
          type="button"
          onClick={() => {
            onSelect(todayYmd);
            onClose?.();
          }}
          className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Today
        </button>
        {value ? (
          <button
            type="button"
            onClick={() => {
              onSelect('');
              onClose?.();
            }}
            className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/[0.06]"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function ErpDateInput({
  value = '',
  onChange,
  min,
  max,
  disabled = false,
  required = false,
  id: idProp,
  name,
  placeholder = 'mm/dd/yyyy',
  className = ERP_DATE_INPUT_CLASS,
  variant = 'default',
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}) {
  const generatedId = useId();
  const inputId = idProp || generatedId;
  const panelId = `${inputId}-calendar`;
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState({ left: 0, top: 0, width: 280 });

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  const updatePanelPos = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPanelStyle(computePanelPosition(rect));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPos();
    window.addEventListener('resize', updatePanelPos);
    window.addEventListener('scroll', updatePanelPos, true);
    return () => {
      window.removeEventListener('resize', updatePanelPos);
      window.removeEventListener('scroll', updatePanelPos, true);
    };
  }, [open, updatePanelPos]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (rootRef.current?.contains(t)) return;
      const panel = document.getElementById(panelId);
      if (panel?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, panelId]);

  const displayValue = formatYmdDisplay(value);
  const widthClass =
    variant === 'inline'
      ? ERP_DATE_INPUT_INLINE_CLASS
      : className.includes('w-')
        ? className
        : ERP_DATE_INPUT_CLASS;
  const shellClass = `${FIELD_SHELL_BASE} ${widthClass} ${open ? 'ring-2 ring-slate-200/80 dark:ring-slate-700/50' : ''}`;

  return (
    <div className={`relative min-w-0 ${widthClass}`} ref={rootRef}>
      <div ref={triggerRef} className={shellClass}>
        <input
          id={inputId}
          name={name}
          type="text"
          readOnly
          required={required && !value}
          disabled={disabled}
          value={displayValue}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          className={FIELD_INNER}
          onClick={() => !disabled && setOpen(true)}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen(true);
            }
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => !disabled && setOpen((o) => !o)}
          className={CALENDAR_BTN}
          aria-label="Open calendar"
        >
          <CalendarIcon />
        </button>
      </div>

      {mounted && open && !disabled
        ? createPortal(
            <ErpMiniCalendarPanel
              panelId={panelId}
              panelStyle={panelStyle}
              value={value}
              min={min}
              max={max}
              onSelect={(ymd) => emitValue(onChange, ymd)}
              onClose={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * Date + time field with mini-calendar (replaces native `type="datetime-local"`).
 * Value format: `YYYY-MM-DDTHH:mm`.
 */
export function ErpDateTimeInput({
  value = '',
  onChange,
  min,
  max,
  disabled = false,
  required = false,
  id: idProp,
  name,
  className,
  'aria-label': ariaLabel,
}) {
  const { date, time } = splitDatetimeLocalValue(value);
  const minDate = min ? String(min).slice(0, 10) : undefined;
  const maxDate = max ? String(max).slice(0, 10) : undefined;

  const setDate = (nextDate) => {
    emitValue(onChange, joinDatetimeLocalValue(nextDate, time || '00:00'));
  };

  const setTime = (nextTime) => {
    const baseDate = date || todayDateInputValue();
    emitValue(onChange, joinDatetimeLocalValue(baseDate, nextTime));
  };

  return (
    <div className={`inline-flex max-w-full items-center gap-2 ${className || ''}`.trim()}>
      <ErpDateInput
        id={idProp}
        name={name ? `${name}-date` : undefined}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        min={minDate}
        max={maxDate}
        disabled={disabled}
        required={required}
        variant="inline"
        aria-label={ariaLabel ? `${ariaLabel} date` : 'Date'}
      />
      <input
        type="time"
        value={time}
        disabled={disabled}
        required={required && Boolean(date)}
        onChange={(e) => setTime(e.target.value)}
        className={TIME_INPUT_CLASS}
        aria-label={ariaLabel ? `${ariaLabel} time` : 'Time'}
      />
    </div>
  );
}
