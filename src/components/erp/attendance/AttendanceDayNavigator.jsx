'use client';

import ErpDateInput from '../ErpDateInput';
import { dateStringAddDays } from '../../../lib/erp-attendance';

function shortNavLabel(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function AttendanceDayNavigator({ value, todayStr, minDate, onChange, className = '' }) {
  const canGoPrev = !minDate || value > minDate;
  const canGoNext = value < todayStr;
  const isToday = value === todayStr;

  const btnClass =
    'inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11.5px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-teal-900/45 dark:bg-[#0c121a] dark:text-slate-300 dark:hover:bg-[#131b24]';

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`.trim()}>
      <button
        type="button"
        disabled={!canGoPrev}
        onClick={() => onChange(dateStringAddDays(value, -1))}
        className={btnClass}
        aria-label="Previous day"
      >
        <span className="text-slate-400">‹</span>
        {shortNavLabel(dateStringAddDays(value, -1))}
      </button>
      <ErpDateInput
        value={value}
        min={minDate}
        max={todayStr}
        onChange={(e) => {
          const next = String(e.target.value || '').slice(0, 10);
          if (next && next <= todayStr && (!minDate || next >= minDate)) onChange(next);
        }}
        variant="inline"
        aria-label="View date"
      />
      <button
        type="button"
        disabled={!canGoNext}
        onClick={() => onChange(dateStringAddDays(value, 1))}
        className={btnClass}
        aria-label="Next day"
      >
        {shortNavLabel(dateStringAddDays(value, 1))}
        <span className="text-slate-400">›</span>
      </button>
      {!isToday ? (
        <button
          type="button"
          onClick={() => onChange(todayStr)}
          className="inline-flex h-[30px] items-center rounded-lg px-2 text-[11px] font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/30"
        >
          Today
        </button>
      ) : null}
    </div>
  );
}
