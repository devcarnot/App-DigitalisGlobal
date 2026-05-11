'use client';

/**
 * Native <select> with the OS dropdown arrow removed and a single chevron in a fixed right “rail”.
 * Always pass a className whose horizontal padding reserves space for the rail:
 *   md → pr-10 (default zone width w-10)
 *   sm → pr-8 / w-8
 *   xs → pr-6 / w-6
 */
const ZONE = {
  md: { rail: 'w-10', pr: 'pr-10', railRound: 'rounded-r-[11px]', icon: 'h-4 w-4', stroke: 2.25 },
  sm: { rail: 'w-8', pr: 'pr-8', railRound: 'rounded-r-lg', icon: 'h-3.5 w-3.5', stroke: 2.1 },
  xs: { rail: 'w-6', pr: 'pr-6', railRound: 'rounded-r-[5px]', icon: 'h-3 w-3', stroke: 2 },
};

/** Filter/toolbar selects (e.g. Projects grid) — padding matches `zoneSize="md"`. */
export const ERP_FILTER_SELECT_CLASS =
  `w-full cursor-pointer rounded-xl border border-slate-200 bg-white pl-3.5 ${ZONE.md.pr} py-2 text-sm font-medium ` +
  `text-slate-800 shadow-sm transition hover:border-slate-300/90 focus:border-[#103D4D]/40 focus:outline-none ` +
  `focus:ring-2 focus:ring-cyan-400/25 ` +
  `dark:border-teal-800/50 dark:bg-[#101a22] dark:text-slate-200 dark:shadow-black/35 dark:hover:border-teal-700/50 ` +
  `dark:focus:border-teal-600/55 dark:focus:ring-teal-500/20`;

/**
 * Native dropdown popups are rendered by the OS, not the browser, so Tailwind
 * classes on `<option>` are ignored by some platforms. Two safety nets:
 *
 *   1. `dark:[color-scheme:dark]` flips Chromium / Firefox to their dark
 *      form-control palette (dark menu background, light text). This is the
 *      single biggest win — no more blinding white menu on dark mode.
 *   2. Explicit `bg`/`text` on the options themselves so older browsers and
 *      Linux/Windows native widgets that still honour CSS render legibly.
 */
const ERP_NATIVE_SELECT_DARK_OPTIONS_CLASS =
  'dark:[color-scheme:dark] ' +
  '[&>option]:bg-white [&>option]:text-slate-900 ' +
  'dark:[&>option]:bg-[#0f1a23] dark:[&>option]:text-slate-100 ' +
  '[&>optgroup]:bg-white dark:[&>optgroup]:bg-[#0f1a23] ' +
  '[&>optgroup]:text-slate-700 dark:[&>optgroup]:text-slate-200';

export default function ErpNativeSelect({
  className = '',
  wrapperClassName = '',
  zoneClassName = '',
  zoneSize = 'md',
  ...rest
}) {
  const z = ZONE[zoneSize] || ZONE.md;
  return (
    <div className={`relative isolate min-w-0 ${wrapperClassName}`.trim()}>
      <select
        {...rest}
        className={`min-w-0 appearance-none ${ERP_NATIVE_SELECT_DARK_OPTIONS_CLASS} ${className}`.trim()}
      />
      <span
        className={
          `pointer-events-none absolute inset-y-px right-px z-[1] flex ${z.rail} items-center justify-center ` +
          `border-l border-slate-200/75 bg-gradient-to-b from-slate-50/98 to-slate-100/90 text-[#103D4D] ` +
          `dark:border-teal-900/55 dark:bg-gradient-to-b dark:from-[#141f2c] dark:to-[#0a1218] dark:text-teal-300 ` +
          `${z.railRound} ${zoneClassName}`
        }
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={z.stroke}
          className={`${z.icon} shrink-0 opacity-90`}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </div>
  );
}
