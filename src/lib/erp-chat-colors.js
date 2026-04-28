/** Light pastel bubble styles per user id (stable hash); `dark:` keeps body text readable on dark UI. */
const PALETTES = [
  {
    bubble:
      'border border-cyan-200/70 bg-cyan-50 dark:border-cyan-900/55 dark:bg-cyan-950/45',
    label: 'text-cyan-900/80 dark:text-cyan-100',
    avatar: 'border-cyan-200 bg-cyan-100 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-100',
  },
  {
    bubble:
      'border border-violet-200/70 bg-violet-50 dark:border-violet-900/50 dark:bg-violet-950/40',
    label: 'text-violet-900/80 dark:text-violet-100',
    avatar: 'border-violet-200 bg-violet-100 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100',
  },
  {
    bubble:
      'border border-amber-200/70 bg-amber-50 dark:border-amber-900/45 dark:bg-amber-950/35',
    label: 'text-amber-900/80 dark:text-amber-100',
    avatar: 'border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
  },
  {
    bubble:
      'border border-rose-200/70 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/40',
    label: 'text-rose-900/80 dark:text-rose-100',
    avatar: 'border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100',
  },
  {
    bubble:
      'border border-emerald-200/70 bg-emerald-50 dark:border-emerald-900/45 dark:bg-emerald-950/35',
    label: 'text-emerald-900/80 dark:text-emerald-100',
    avatar: 'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
  },
  {
    bubble:
      'border border-sky-200/70 bg-sky-50 dark:border-sky-900/50 dark:bg-sky-950/40',
    label: 'text-sky-900/80 dark:text-sky-100',
    avatar: 'border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100',
  },
  {
    bubble:
      'border border-orange-200/70 bg-orange-50 dark:border-orange-900/45 dark:bg-orange-950/35',
    label: 'text-orange-900/80 dark:text-orange-100',
    avatar: 'border-orange-200 bg-orange-100 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-100',
  },
  {
    bubble:
      'border border-indigo-200/70 bg-indigo-50 dark:border-indigo-900/50 dark:bg-indigo-950/40',
    label: 'text-indigo-900/80 dark:text-indigo-100',
    avatar: 'border-indigo-200 bg-indigo-100 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-100',
  },
  {
    bubble:
      'border border-teal-200/70 bg-teal-50 dark:border-teal-900/50 dark:bg-teal-950/40',
    label: 'text-teal-900/80 dark:text-teal-100',
    avatar: 'border-teal-200 bg-teal-100 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-100',
  },
  {
    bubble:
      'border border-fuchsia-200/70 bg-fuchsia-50 dark:border-fuchsia-900/50 dark:bg-fuchsia-950/40',
    label: 'text-fuchsia-900/80 dark:text-fuchsia-100',
    avatar: 'border-fuchsia-200 bg-fuchsia-100 text-fuchsia-800 dark:border-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-100',
  },
];

const MINE = {
  bubble: 'border border-[#103D4D]/25 bg-[#103D4D]/10 dark:border-teal-700/45 dark:bg-[#0d3444]/70',
  label: 'text-[#103D4D] dark:text-teal-100',
  avatar: 'border-[#103D4D] bg-[#103D4D] text-white dark:border-teal-600',
};

export function chatPaletteForUser(userId, isMine) {
  if (isMine) return MINE;
  if (!userId || typeof userId !== 'string') return PALETTES[0];
  let h = 0;
  for (let i = 0; i < userId.length; i += 1) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return PALETTES[h % PALETTES.length];
}
