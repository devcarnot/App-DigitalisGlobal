'use client';

import ErpDateInput from '../ErpDateInput';
import { dateStringAddDays } from '../../../lib/erp-attendance';

function clampRange(fromStr, toStr, { minDate, maxDate }) {
  let from = String(fromStr || '').slice(0, 10);
  let to = String(toStr || '').slice(0, 10);
  if (!from || !to) return { from, to };
  if (minDate && from < minDate) from = minDate;
  if (maxDate && to > maxDate) to = maxDate;
  if (minDate && to < minDate) to = minDate;
  if (maxDate && from > maxDate) from = maxDate;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

const PRESETS = [
  { id: '7d', label: '7d', days: 6 },
  { id: '14d', label: '14d', days: 13 },
  { id: '30d', label: '30d', days: 29 },
];

export default function AttendanceDateRangePicker({
  fromStr,
  toStr,
  todayStr,
  minDate,
  onChange,
  className = '',
}) {
  const presetBtn =
    'inline-flex h-7 items-center rounded-md px-2 text-[10.5px] font-semibold transition';

  function applyRange(from, to) {
    onChange(clampRange(from, to, { minDate, maxDate: todayStr }));
  }

  function applyPreset(daysBack) {
    applyRange(dateStringAddDays(todayStr, -daysBack), todayStr);
  }

  const presetActive = (daysBack) => {
    const expectedFrom = dateStringAddDays(todayStr, -daysBack);
    return fromStr === expectedFrom && toStr === todayStr;
  };

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`.trim()}>
      <div className="flex items-center gap-1 rounded-lg border border-slate-200/90 bg-white p-0.5 shadow-sm dark:border-teal-900/45 dark:bg-[#131b24]">
        {PRESETS.map(({ id, label, days }) => (
          <button
            key={id}
            type="button"
            onClick={() => applyPreset(days)}
            className={`${presetBtn} ${
              presetActive(days)
                ? 'bg-[#103D4D] text-white shadow-sm dark:bg-teal-700'
                : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-[#0c121a]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <ErpDateInput
          value={fromStr}
          min={minDate}
          max={toStr || todayStr}
          onChange={(e) => {
            const next = String(e.target.value || '').slice(0, 10);
            if (next) applyRange(next, toStr);
          }}
          variant="inline"
          aria-label="From date"
        />
        <span className="text-[11px] font-medium text-slate-400">–</span>
        <ErpDateInput
          value={toStr}
          min={fromStr || minDate}
          max={todayStr}
          onChange={(e) => {
            const next = String(e.target.value || '').slice(0, 10);
            if (next) applyRange(fromStr, next);
          }}
          variant="inline"
          aria-label="To date"
        />
      </div>
      {toStr !== todayStr ? (
        <button
          type="button"
          onClick={() => applyRange(fromStr, todayStr)}
          className="inline-flex h-7 items-center rounded-lg px-2 text-[10.5px] font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/30"
        >
          To today
        </button>
      ) : null}
    </div>
  );
}
