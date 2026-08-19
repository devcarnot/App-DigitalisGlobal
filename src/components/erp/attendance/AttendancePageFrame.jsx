'use client';

/** Shared page chrome for attendance redesign screens. */
export default function AttendancePageFrame({ title, subtitle, meta, children }) {
  return (
    <div className="w-full min-w-0 max-w-[1300px] mx-auto space-y-3.5 text-[13px] leading-snug text-slate-800 dark:text-slate-100">
      <header className="rounded-[10px] border border-slate-200/90 bg-white px-5 py-3.5 shadow-sm dark:border-teal-900/45 dark:bg-[#0c121a]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-[#103D4D] dark:text-white">{title}</h1>
            {subtitle ? (
              <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">{subtitle}</p>
            ) : null}
          </div>
          {meta ? <div className="ml-auto text-[11px] text-slate-500 dark:text-slate-400">{meta}</div> : null}
        </div>
      </header>
      {children}
    </div>
  );
}

export function AttendancePanel({ className = '', children }) {
  return (
    <section
      className={`rounded-[10px] border border-slate-200/90 bg-white p-4 shadow-sm dark:border-teal-900/45 dark:bg-[#0c121a] sm:p-[18px] ${className}`}
    >
      {children}
    </section>
  );
}

export function AttendanceMonoLabel({ children }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
      {children}
    </p>
  );
}

export function AttendanceLegendPill({ colorClass, label, count }) {
  return (
    <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-slate-200 px-2.5 text-[11.5px] font-medium dark:border-teal-900/45">
      <span className={`h-2 w-2 shrink-0 rounded-sm ${colorClass}`} />
      {label}
      {count != null ? <span className="font-mono text-slate-600 dark:text-slate-300">{count}</span> : null}
    </span>
  );
}
