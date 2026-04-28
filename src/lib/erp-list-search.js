/**
 * Shared Tailwind classes for ERP list/search fields (filtering tables, cards, directories).
 */
export const ERP_LIST_SEARCH_INPUT_CLASS =
  'w-full max-w-md appearance-none rounded-2xl border border-cyan-200/55 bg-white/90 px-3 py-2.5 text-sm text-slate-900 shadow-inner shadow-slate-900/[0.04] placeholder:text-slate-400 backdrop-blur-sm transition-shadow focus:border-[#103D4D]/45 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden ' +
  'dark:border-teal-800/55 dark:bg-gradient-to-br dark:from-[#121f2a] dark:to-[#080f14] dark:text-white dark:placeholder:text-slate-500 dark:shadow-inner dark:shadow-black/40 dark:focus:border-teal-600/60 dark:focus:ring-teal-500/25';

/** Wrapper: place a search icon absolutely with `left-3` and add `pl-10` on the input via ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS */
export const ERP_SEARCH_ICON_WRAP_CLASS = 'relative isolate max-w-md w-full';

export const ERP_LIST_SEARCH_INPUT_WITH_ICON_CLASS = `${ERP_LIST_SEARCH_INPUT_CLASS} pl-10 max-w-none`;

/**
 * @template T
 * @param {T[]} items
 * @param {string} query
 * @param {(item: T) => (string | number | null | undefined)[]} getStrings
 * @returns {T[]}
 */
export function filterListBySearch(items, query, getStrings) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const parts = getStrings(item);
    return parts.some((p) => String(p ?? '').toLowerCase().includes(q));
  });
}
