'use client';

/**
 * Shared hero header for ERP admin pages (clients, members, attendance, etc.).
 * @param {{ eyebrow: string, title: string, description?: import('react').ReactNode, accent?: 'teal' | 'amber' | 'violet' | 'amber2' | 'emerald', compact?: boolean }}
 */
export default function ErpAdminPageHero({ eyebrow, title, description, accent = 'teal', compact = false }) {
  const blob1 =
    accent === 'amber'
      ? 'from-amber-400/25 to-orange-500/20'
      : accent === 'violet'
        ? 'from-violet-400/25 to-fuchsia-500/15'
        : accent === 'amber2'
          ? 'from-amber-300/20 to-rose-400/15'
          : accent === 'emerald'
            ? 'from-emerald-400/25 to-teal-500/20'
            : 'from-cyan-400/25 to-teal-500/20';

  const blob2 =
    accent === 'amber'
      ? 'from-orange-300/15 to-amber-500/10'
      : accent === 'violet'
        ? 'from-indigo-400/15 to-violet-500/10'
        : accent === 'amber2'
          ? 'from-rose-300/15 to-amber-400/10'
          : accent === 'emerald'
            ? 'from-teal-400/15 to-emerald-500/10'
            : 'from-teal-400/15 to-cyan-500/10';

  const eyebrowClass =
    accent === 'amber'
      ? 'text-amber-800/90'
      : accent === 'violet'
        ? 'text-violet-800/90'
        : accent === 'amber2'
          ? 'text-rose-800/85'
          : accent === 'emerald'
            ? 'text-emerald-900/85'
            : 'text-[#103D4D]';

  const titleClass =
    accent === 'amber'
      ? 'from-slate-900 via-amber-700 to-orange-500'
      : accent === 'violet'
        ? 'from-slate-900 via-violet-800 to-fuchsia-600'
        : accent === 'amber2'
          ? 'from-slate-900 via-rose-800 to-amber-600'
          : accent === 'emerald'
            ? 'from-slate-900 via-emerald-800 to-teal-500'
            : 'from-slate-900 via-[#103D4D] to-teal-500';

  return (
    <header
      className={`relative overflow-hidden border border-cyan-200/40 bg-gradient-to-br from-white via-slate-50/80 to-cyan-50/30 shadow-[0_12px_32px_-16px_rgba(15,61,77,0.2)] ring-1 ring-cyan-900/[0.06] dark:border-teal-900/45 dark:bg-gradient-to-br dark:from-[#0f2230] dark:via-[#0a1722] dark:to-[#050a0f] dark:shadow-[0_28px_64px_-24px_rgba(0,0,0,0.55)] dark:ring-teal-900/35 ${
        compact
          ? 'rounded-xl shadow-sm max-lg:shadow-sm'
          : 'rounded-2xl max-lg:shadow-sm sm:rounded-3xl sm:shadow-[0_20px_50px_-20px_rgba(15,61,77,0.25)]'
      }`}
    >
      <div
        className={`pointer-events-none absolute -right-16 -top-24 rounded-full bg-gradient-to-br ${blob1} blur-3xl dark:from-teal-500/15 dark:to-cyan-600/12 ${
          compact ? 'h-32 w-32 opacity-50' : 'h-56 w-56 max-lg:h-32 max-lg:w-32 max-lg:opacity-60'
        }`}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute -bottom-20 -left-12 rounded-full bg-gradient-to-tr ${blob2} blur-3xl dark:from-violet-600/12 dark:to-indigo-900/25 ${
          compact ? 'hidden' : 'h-48 w-48 max-lg:hidden'
        }`}
        aria-hidden
      />
      <div
        className={
          compact
            ? 'relative px-3 py-2 sm:px-4 sm:py-2.5'
            : 'relative px-3 py-3 sm:px-8 sm:py-7 max-lg:px-3.5 max-lg:py-3'
        }
      >
        <p
          className={`font-bold uppercase ${eyebrowClass} dark:!text-teal-300/95 ${
            compact ? 'text-[8px] tracking-[0.14em]' : 'text-[9px] tracking-[0.18em] sm:text-[10px] sm:tracking-[0.22em]'
          }`}
        >
          {eyebrow}
        </p>
        <h1
          className={`font-bold tracking-tight bg-gradient-to-r bg-clip-text text-transparent dark:!from-white dark:!via-teal-100 dark:!to-cyan-200 ${titleClass} ${
            compact
              ? 'mt-0.5 text-base sm:text-lg'
              : 'mt-1 text-lg max-lg:text-xl sm:mt-2 sm:text-3xl'
          }`}
        >
          {title}
        </h1>
        {description ? (
          <div
            className={`max-w-3xl font-medium text-slate-600 dark:text-slate-300 ${
              compact
                ? 'mt-0.5 text-[10px] leading-snug sm:text-[11px]'
                : 'mt-1.5 text-xs leading-snug sm:mt-3 sm:text-sm sm:leading-relaxed'
            }`}
          >
            {description}
          </div>
        ) : null}
      </div>
    </header>
  );
}
