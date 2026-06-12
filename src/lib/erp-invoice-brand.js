/** Public URL path (encoded space) for the color Digitalis logo. */
export const ERP_INVOICE_LOGO_PUBLIC_PATH = '/Digitalisglobal%20logo.png';

/** Filename on disk under `/public`. */
export const ERP_INVOICE_LOGO_FILENAME = 'Digitalisglobal logo.png';

/** Shared Tailwind class bundles — clean, minimal invoice UI. */
export const INV_UI = {
  field:
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-[#141c24] dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-700/50',
  fieldSm:
    'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200 dark:border-slate-700 dark:bg-[#141c24] dark:text-slate-100',
  label: 'text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400',
  card:
    'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#101820]',
  cardInner: 'rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-[#141c24]/50',
  btnPrimary:
    'inline-flex items-center justify-center gap-2 rounded-lg bg-[#103D4D] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0d3442] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#1a5568] dark:hover:bg-[#103D4D]',
  btnAccent:
    'inline-flex items-center justify-center gap-2 rounded-lg bg-[#103D4D] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0d3442] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#1a5568] dark:hover:bg-[#103D4D]',
  btnAccentSm:
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-[#141c24] dark:text-slate-200 dark:hover:bg-[#1a2430]',
  btnGhost:
    'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-[#141c24] dark:text-slate-200 dark:hover:bg-[#1a2430]',
  select:
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-[#141c24] dark:text-slate-100',
  /** For ErpNativeSelect — includes right padding for the chevron rail. */
  selectTrigger:
    'w-full cursor-pointer rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-10 text-left text-sm text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-[#141c24] dark:text-slate-100 dark:hover:border-slate-600 dark:focus:border-slate-500 dark:focus:ring-slate-700/50',
  /** Toolbar filters on the invoice list — fixed min width so labels aren’t cramped. */
  selectFilter:
    'min-w-[11.5rem] w-[11.5rem] sm:min-w-[13.5rem] sm:w-[13.5rem] cursor-pointer rounded-lg border border-slate-200 bg-white py-2 pl-3.5 pr-10 text-left text-sm text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-[#141c24] dark:text-slate-100 dark:hover:border-slate-600 dark:focus:border-slate-500 dark:focus:ring-slate-700/50',
  tabBar: 'inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-[#0a1018]',
  tab: (active) =>
    `rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
      active
        ? 'bg-white text-slate-900 shadow-sm dark:bg-[#141c24] dark:text-slate-100'
        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
    }`,
  tableHead:
    'border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-[#141c24] dark:text-slate-400',
  metaBand:
    'rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 shadow-sm dark:border-slate-700 dark:bg-[#141c24]/80',
  sectionBand: 'rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#101820]',
  customerPicker:
    'flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#101820]',
};

/** @deprecated Use INV_UI.btnAccent */
export const btnGreen = INV_UI.btnAccent;
