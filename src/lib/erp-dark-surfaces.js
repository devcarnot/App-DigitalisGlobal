/**
 * Shared Tailwind class fragments for ERP UI when `.dark` is active.
 * Compose with existing light-mode classes on each surface.
 */

/** Large hero / title panel (matches ErpAdminPageHero dark treatment). */
export const ERP_DARK_HERO_SHELL =
  'dark:border-teal-900/45 dark:bg-gradient-to-br dark:from-[#0f2230] dark:via-[#0a1722] dark:to-[#050a0f] dark:shadow-[0_28px_64px_-24px_rgba(0,0,0,0.55)] dark:ring-teal-900/35';

/** Stat / KPI mini cards — cyan / quota */
export const ERP_DARK_STAT_CYAN =
  'dark:border-teal-800/40 dark:bg-gradient-to-br dark:from-[#0f1e2a] dark:via-[#0c1822] dark:to-[#060b10] dark:shadow-black/35 dark:ring-teal-900/25';

export const ERP_DARK_STAT_EMERALD =
  'dark:border-emerald-900/35 dark:bg-gradient-to-br dark:from-[#0a2218] dark:via-[#0c1c18] dark:to-[#050c0c] dark:ring-emerald-900/25';

export const ERP_DARK_STAT_SKY =
  'dark:border-sky-900/35 dark:bg-gradient-to-br dark:from-[#0c1826] dark:via-[#0a1620] dark:to-[#050a10] dark:ring-sky-900/25';

/** Medical / secondary accent (violet) */
export const ERP_DARK_STAT_VIOLET =
  'dark:border-violet-900/35 dark:bg-gradient-to-br dark:from-[#1a1428] dark:via-[#14101c] dark:to-[#0a080e] dark:ring-violet-900/25';

/** “Awaiting you” amber emphasis */
export const ERP_DARK_STAT_AMBER_HOT =
  'dark:border-amber-800/40 dark:bg-gradient-to-br dark:from-[#2a1808] dark:via-[#1a1408] dark:to-[#0c0a06] dark:ring-amber-900/30';

/** Inactive / zero-pending amber card */
export const ERP_DARK_STAT_SLATE_SOFT =
  'dark:border-slate-700/50 dark:bg-gradient-to-br dark:from-[#141a22] dark:via-[#0f141c] dark:to-[#080a10] dark:ring-slate-800/40';

/** Wide section: approved timeline, emerald accent */
export const ERP_DARK_SECTION_EMERALD_PANEL =
  'dark:border-emerald-900/40 dark:bg-gradient-to-br dark:from-[#0c1e22] dark:via-[#0a1820] dark:to-[#050a0f] dark:ring-emerald-900/20';

/** Small chips on dark emerald sections */
export const ERP_DARK_CHIP_EMERALD =
  'dark:bg-emerald-950/60 dark:text-emerald-200 dark:ring-emerald-800/45';

/** Main table / directory panel */
export const ERP_DARK_SECTION_MAIN_PANEL =
  'dark:border-teal-800/45 dark:bg-gradient-to-b dark:from-[#0e1824] dark:to-[#05080c] dark:shadow-[0_16px_48px_-20px_rgba(0,0,0,0.5)] dark:ring-transparent';

/**
 * Account / settings matte panels — use when layering with `dark:[background-image:none]`,
 * avoids gradient “grey band” clashes with `{ERP_DARK_SECTION_MAIN_PANEL}`.
 */
export const ERP_DARK_ACCOUNT_CARD =
  'dark:border-teal-800/45 dark:bg-[#0e1824] dark:shadow-[0_16px_48px_-20px_rgba(0,0,0,0.5)] dark:ring-transparent dark:[background-image:none] dark:backdrop-blur-none';

/** Account page hero stripe — flat dark (no glossy gradient wash). */
export const ERP_DARK_ACCOUNT_HERO =
  'dark:border-teal-900/45 dark:bg-[#0d1a23] dark:shadow-[0_28px_64px_-24px_rgba(0,0,0,0.55)] dark:ring-teal-900/35 dark:[background-image:none] dark:backdrop-blur-none';

/** ERP primary actions — solid teal, no gradients (compose with sizing / border classes). */
export const ERP_DARK_PRIMARY_BUTTON =
  'bg-[#103D4D] text-white shadow-md shadow-teal-900/20 hover:bg-[#0d3545] disabled:opacity-50 dark:[background-image:none]';

export const ERP_DARK_TABLE_HEADER_BAR =
  'dark:border-teal-900/45 dark:bg-gradient-to-r dark:from-[#0f2438] dark:via-[#0b1e2e] dark:to-[#061018]';

export const ERP_DARK_TABLE_SCROLL_AREA =
  'dark:bg-gradient-to-b dark:from-[#0a1218] dark:to-[#05070c]';

export const ERP_DARK_TABLE_HEAD_ROW =
  'dark:border-teal-900/50 dark:bg-[#0f161e] dark:text-slate-400';

/** Alternating rows */
export const ERP_DARK_ROW_EVEN = 'dark:bg-[#0c141c]';
export const ERP_DARK_ROW_ODD = 'dark:bg-[#080d12]';

/** Pending-requests mega section */
export const ERP_DARK_SECTION_AMBER_ALERT =
  'dark:border-amber-900/45 dark:bg-gradient-to-br dark:from-[#1c1408] dark:via-[#121008] dark:to-[#0a0806] dark:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)] dark:ring-amber-900/25';

export const ERP_DARK_INNER_FROSTED =
  'dark:bg-slate-900/65 dark:backdrop-blur-sm dark:ring-amber-900/20';

/** Card inside pending list row */
export const ERP_DARK_CARD_AMBER_BORDER =
  'dark:border-amber-900/35 dark:bg-gradient-to-br dark:from-[#1a1610] dark:to-[#0f0d0a] dark:shadow-black/35';

/** Standard inner “white card” replacement */
export const ERP_DARK_SOLID_CARD = 'dark:border-teal-800/35 dark:bg-[#121f28] dark:shadow-md';

/**
 * Portal / fixed context menus. Compose after light utilities:
 * `border … bg-white shadow-xl … ring-1 ring-black/5`.
 */
export const ERP_DARK_MENU_PORTAL =
  'dark:border-teal-800/50 dark:bg-[#121f28] dark:shadow-[0_18px_48px_-20px_rgba(0,0,0,0.72)] dark:ring-1 dark:ring-teal-950/40';

/** Loading placeholder panel */
export const ERP_DARK_LOADING_SHELL =
  'dark:border-teal-800/40 dark:bg-gradient-to-b dark:from-[#101a22] dark:to-[#080c10] dark:shadow-inner';

/** Pill badge on dark teal */
export const ERP_DARK_PILL_PRIMARY =
  'dark:border-teal-800/55 dark:bg-gradient-to-r dark:from-teal-900/65 dark:to-[#103d4d]/80 dark:text-teal-100 dark:shadow-black/40';

export const ERP_DARK_PILL_VIOLET =
  'dark:border-violet-800/55 dark:bg-gradient-to-r dark:from-violet-950/70 dark:to-indigo-950/60 dark:text-violet-200 dark:shadow-black/35';

/** Sky-accent hero (remote work, ocean headings) */
export const ERP_DARK_SKY_HERO_SHELL =
  'dark:border-sky-900/45 dark:bg-gradient-to-br dark:from-[#0f1a28] dark:via-[#0a1620] dark:to-[#050810] dark:shadow-[0_28px_64px_-24px_rgba(0,0,0,0.55)] dark:ring-sky-900/35';

/** Table footer / pagination strip */
export const ERP_DARK_TABLE_FOOTER_BAR =
  'dark:border-teal-900/35 dark:bg-gradient-to-r dark:from-[#0f1822] dark:via-[#0a1620] dark:to-[#080d14]';

/**
 * Strip `ring-white/*` glare in dark KPI tiles (combine with Pipeline theme cards).
 */
export const ERP_DARK_RING_SUBTLE_KPI = 'dark:ring-slate-700/45';

/** Violet tinted section wrapper */
export const ERP_DARK_SECTION_VIOLET_PANEL =
  'dark:border-violet-900/40 dark:bg-gradient-to-br dark:from-[#141022] dark:via-[#0f0c18] dark:to-[#080610] dark:ring-violet-900/25';
