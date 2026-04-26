/** Light pastel bubble styles per user id (stable hash). */
const PALETTES = [
  { bubble: 'bg-cyan-50 border-cyan-200/70', label: 'text-cyan-900/80', avatar: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  { bubble: 'bg-violet-50 border-violet-200/70', label: 'text-violet-900/80', avatar: 'bg-violet-100 text-violet-800 border-violet-200' },
  { bubble: 'bg-amber-50 border-amber-200/70', label: 'text-amber-900/80', avatar: 'bg-amber-100 text-amber-900 border-amber-200' },
  { bubble: 'bg-rose-50 border-rose-200/70', label: 'text-rose-900/80', avatar: 'bg-rose-100 text-rose-800 border-rose-200' },
  { bubble: 'bg-emerald-50 border-emerald-200/70', label: 'text-emerald-900/80', avatar: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { bubble: 'bg-sky-50 border-sky-200/70', label: 'text-sky-900/80', avatar: 'bg-sky-100 text-sky-800 border-sky-200' },
  { bubble: 'bg-orange-50 border-orange-200/70', label: 'text-orange-900/80', avatar: 'bg-orange-100 text-orange-900 border-orange-200' },
  { bubble: 'bg-indigo-50 border-indigo-200/70', label: 'text-indigo-900/80', avatar: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { bubble: 'bg-teal-50 border-teal-200/70', label: 'text-teal-900/80', avatar: 'bg-teal-100 text-teal-800 border-teal-200' },
  { bubble: 'bg-fuchsia-50 border-fuchsia-200/70', label: 'text-fuchsia-900/80', avatar: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200' },
];

const MINE = {
  bubble: 'bg-[#103D4D]/10 border-[#103D4D]/25',
  label: 'text-[#103D4D]',
  avatar: 'bg-[#103D4D] text-white border-[#103D4D]',
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
