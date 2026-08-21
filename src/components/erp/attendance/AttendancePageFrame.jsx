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

export function AttendancePanel({ className = '', children, flush = false }) {
  return (
    <section
      className={`rounded-xl border border-slate-200/90 bg-white shadow-[0_4px_20px_-8px_rgba(16,61,77,0.12)] dark:border-teal-900/45 dark:bg-[#0c121a] dark:shadow-none ${
        flush ? 'overflow-hidden !p-0' : 'p-4 sm:p-[18px]'
      } ${className}`}
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

const FILTER_PILL_TONES = {
  working:
    'border-teal-200/80 bg-gradient-to-b from-teal-50 to-teal-100/50 text-teal-900 shadow-sm dark:border-teal-800/50 dark:from-teal-950/35 dark:to-teal-950/10 dark:text-teal-100',
  break:
    'border-violet-200/80 bg-gradient-to-b from-violet-50 to-violet-100/50 text-violet-900 shadow-sm dark:border-violet-900/45 dark:from-violet-950/30 dark:to-violet-950/10 dark:text-violet-100',
  leave:
    'border-slate-200/90 bg-gradient-to-b from-slate-50 to-white text-slate-600 shadow-sm dark:border-teal-900/45 dark:from-[#131b24] dark:to-[#0c121a] dark:text-slate-300',
  notIn:
    'border-orange-200/80 bg-gradient-to-b from-orange-50 to-orange-100/40 text-orange-900 shadow-sm dark:border-orange-900/40 dark:from-orange-950/25 dark:to-orange-950/10 dark:text-orange-100',
};

/** Clickable presence / summary pill — tap to highlight matching roster rows. */
export function AttendanceFilterPill({ label, count, tone = 'working', active = false, onClick }) {
  if (!count) return null;
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold transition ${
        FILTER_PILL_TONES[tone] || FILTER_PILL_TONES.working
      } ${onClick ? 'cursor-pointer hover:shadow-md' : ''} ${
        active ? 'ring-2 ring-teal-500/80 ring-offset-1 shadow-md dark:ring-offset-[#0c121a]' : ''
      }`}
    >
      <span className="font-mono text-[10px] tabular-nums opacity-80">{count}</span>
      {label}
    </Tag>
  );
}

/** Two-segment tab switcher for attendance admin views. */
export function AttendanceSegmentTabs({ value, onChange, tabs }) {
  return (
    <div
      className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-[#131b24]"
      role="tablist"
      aria-label="Attendance view"
    >
      {(tabs || []).map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[11px] font-semibold transition ${
              active
                ? 'bg-white text-[#103D4D] shadow-sm dark:bg-[#0c121a] dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 ? (
              <span className="rounded-full bg-slate-200/90 px-1.5 py-px font-mono text-[9px] tabular-nums text-slate-600 dark:bg-white/10 dark:text-slate-300">
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function AttendanceLegendPill({ colorClass, swatchClassName, label, count, active = false, onClick }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      className={`inline-flex h-[26px] items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-medium transition ${
        active
          ? 'border-teal-500 bg-teal-50 text-teal-900 shadow-sm dark:border-teal-400 dark:bg-teal-950/40 dark:text-teal-100'
          : 'border-slate-200 dark:border-teal-900/45'
      } ${onClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-[#131b24]' : ''}`}
    >
      <span className={swatchClassName || `h-2 w-2 shrink-0 rounded-sm ${colorClass}`} />
      {label}
      {count != null ? <span className="font-mono text-slate-600 dark:text-slate-300">{count}</span> : null}
    </Tag>
  );
}
