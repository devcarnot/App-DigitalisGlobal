'use client';

/**
 * Shared hero header for ERP admin pages (clients, members, attendance, etc.).
 * @param {{ eyebrow: string, title: string, description?: import('react').ReactNode, accent?: 'teal' | 'amber' | 'violet' | 'amber2' | 'emerald' }}
 */
export default function ErpAdminPageHero({ eyebrow, title, description, accent = 'teal' }) {
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
    <header className="relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-white via-white to-slate-50/90 shadow-[0_20px_50px_-20px_rgba(15,61,77,0.25)] ring-1 ring-cyan-900/[0.06]">
      <div
        className={`pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-gradient-to-br ${blob1} blur-3xl`}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-gradient-to-tr ${blob2} blur-3xl`}
        aria-hidden
      />
      <div className="relative px-5 py-6 sm:px-8 sm:py-7">
        <p className={`text-[10px] font-bold uppercase tracking-[0.22em] ${eyebrowClass}`}>{eyebrow}</p>
        <h1
          className={`mt-2 text-2xl font-bold tracking-tight bg-gradient-to-r ${titleClass} bg-clip-text text-transparent sm:text-3xl`}
        >
          {title}
        </h1>
        {description ? (
          <div className="mt-3 max-w-3xl text-sm font-medium leading-relaxed text-slate-600">{description}</div>
        ) : null}
      </div>
    </header>
  );
}
