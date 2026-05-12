/**
 * Shared constants and helpers for the personal Notes Kanban board
 * (`/erp/notes`).
 *
 * The board is fully user-customisable: each user can rename, recolor, reorder
 * and add or remove columns. Column definitions are persisted **per user in
 * localStorage** (key = `ERP_NOTES_COLUMNS_STORAGE_KEY`), so they survive
 * reloads but are scoped to the current browser. Notes themselves still live
 * in the `erp_notes` table; a note references its column via `column_key`. If
 * a note references a column that no longer exists locally, it falls back to
 * the first column so nothing is ever lost.
 *
 * The legacy per-note `color` column in the DB is no longer surfaced in the
 * editor (the column drives the visual color now), but it stays on existing
 * rows for backwards compatibility.
 */

/**
 * @typedef {{
 *   id: 'slate'|'teal'|'sky'|'violet'|'amber'|'rose'|'emerald',
 *   label: string,
 *   stripe: string,     // for the small vertical stripe on each card
 *   accent: string,     // for the column container border+bg
 *   dot: string,        // for the small color swatch in pickers/legends
 *   chipActive: string, // for the column header "active" tag styling
 * }} ErpNoteColorToken
 *
 * @typedef {{ key: string, title: string, color: ErpNoteColorToken['id'] }} ErpNoteColumn
 */

/**
 * The seven supported color tokens — used for both columns and (legacy) per-note
 * coloring. The CHECK constraint on `erp_notes.color` only accepts these ids.
 *
 * Tailwind needs full class names at build time, so don't try to template the
 * shade — keep each variant spelled out.
 */
export const ERP_NOTE_COLORS = /** @type {ErpNoteColorToken[]} */ ([
  {
    id: 'slate',
    label: 'Slate',
    stripe: 'bg-slate-400 dark:bg-slate-500',
    accent:
      'border-slate-300/80 bg-slate-50/80 dark:border-slate-700/55 dark:bg-slate-900/45',
    dot: 'bg-slate-400 dark:bg-slate-500',
    chipActive:
      'bg-slate-100 text-slate-800 ring-slate-300/70 dark:bg-slate-800/70 dark:text-slate-100 dark:ring-slate-700/60',
  },
  {
    id: 'sky',
    label: 'Sky (To do)',
    stripe: 'bg-sky-500 dark:bg-sky-400',
    accent:
      'border-sky-300/80 bg-sky-50/70 dark:border-sky-800/55 dark:bg-sky-950/35',
    dot: 'bg-sky-500 dark:bg-sky-400',
    chipActive:
      'bg-sky-100 text-sky-800 ring-sky-300/70 dark:bg-sky-950/55 dark:text-sky-200 dark:ring-sky-800/60',
  },
  {
    id: 'amber',
    label: 'Amber (In progress)',
    stripe: 'bg-amber-500 dark:bg-amber-400',
    accent:
      'border-amber-300/80 bg-amber-50/70 dark:border-amber-800/55 dark:bg-amber-950/35',
    dot: 'bg-amber-500 dark:bg-amber-400',
    chipActive:
      'bg-amber-100 text-amber-800 ring-amber-300/70 dark:bg-amber-950/55 dark:text-amber-200 dark:ring-amber-800/60',
  },
  {
    id: 'violet',
    label: 'Violet (Waiting)',
    stripe: 'bg-violet-500 dark:bg-violet-400',
    accent:
      'border-violet-300/80 bg-violet-50/70 dark:border-violet-800/55 dark:bg-violet-950/30',
    dot: 'bg-violet-500 dark:bg-violet-400',
    chipActive:
      'bg-violet-100 text-violet-800 ring-violet-300/70 dark:bg-violet-950/55 dark:text-violet-200 dark:ring-violet-800/60',
  },
  {
    id: 'emerald',
    label: 'Emerald (Done)',
    stripe: 'bg-emerald-500 dark:bg-emerald-400',
    accent:
      'border-emerald-300/80 bg-emerald-50/70 dark:border-emerald-800/55 dark:bg-emerald-950/30',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    chipActive:
      'bg-emerald-100 text-emerald-800 ring-emerald-300/70 dark:bg-emerald-950/55 dark:text-emerald-200 dark:ring-emerald-800/60',
  },
  {
    id: 'teal',
    label: 'Teal',
    stripe: 'bg-teal-500 dark:bg-teal-400',
    accent:
      'border-teal-300/80 bg-teal-50/70 dark:border-teal-800/55 dark:bg-teal-950/30',
    dot: 'bg-teal-500 dark:bg-teal-400',
    chipActive:
      'bg-teal-100 text-teal-800 ring-teal-300/70 dark:bg-teal-950/55 dark:text-teal-200 dark:ring-teal-800/60',
  },
  {
    id: 'rose',
    label: 'Rose (Urgent)',
    stripe: 'bg-rose-500 dark:bg-rose-400',
    accent:
      'border-rose-300/80 bg-rose-50/70 dark:border-rose-800/55 dark:bg-rose-950/35',
    dot: 'bg-rose-500 dark:bg-rose-400',
    chipActive:
      'bg-rose-100 text-rose-800 ring-rose-300/70 dark:bg-rose-950/55 dark:text-rose-200 dark:ring-rose-800/60',
  },
]);

export const ERP_NOTE_DEFAULT_COLOR = 'slate';

/** Lookup a color token by id (with safe fallback). */
export function resolveNoteColor(colorId) {
  const found = ERP_NOTE_COLORS.find((c) => c.id === colorId);
  return found || ERP_NOTE_COLORS[0];
}

/** Stripe Tailwind class for a card, given a column color id. */
export function noteColorStripeClass(colorId) {
  return resolveNoteColor(colorId).stripe;
}

/** Accent border+bg classes for a column, given a column color id. */
export function noteColumnAccentClass(colorId) {
  return resolveNoteColor(colorId).accent;
}

/** Small color swatch class (used in the column manager and editor). */
export function noteColorDotClass(colorId) {
  return resolveNoteColor(colorId).dot;
}

/**
 * Default board lanes shown to every user on first visit. The keys stay the
 * same as the previous hardcoded list so notes that were created BEFORE
 * customisation existed still land in the right lane after upgrade.
 */
export const ERP_NOTE_DEFAULT_COLUMNS = /** @type {ErpNoteColumn[]} */ ([
  { key: 'todo', title: 'To do', color: 'sky' },
  { key: 'doing', title: 'In progress', color: 'amber' },
  { key: 'review', title: 'Waiting / review', color: 'violet' },
  { key: 'done', title: 'Done', color: 'emerald' },
]);

export const ERP_NOTE_DEFAULT_COLUMN = ERP_NOTE_DEFAULT_COLUMNS[0].key;

/** Schema version baked into the storage key; bump if the shape changes. */
const COLUMNS_STORAGE_VERSION = 'v1';

/** localStorage key for a given user's column config. */
export function notesColumnsStorageKey(userId) {
  return `erp:notes-columns:${COLUMNS_STORAGE_VERSION}:${userId || 'anon'}`;
}

const COLUMN_KEY_RE = /^[a-z0-9_-]{1,40}$/;

/**
 * Normalize a column to the persisted shape. Drops invalid entries.
 * Returns null when the entry can't be salvaged.
 */
function normaliseColumn(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const keyCandidate = typeof raw.key === 'string' ? raw.key.trim() : '';
  const titleCandidate = typeof raw.title === 'string' ? raw.title.trim() : '';
  const colorCandidate = typeof raw.color === 'string' ? raw.color.trim() : '';
  if (!keyCandidate || !titleCandidate) return null;
  if (!COLUMN_KEY_RE.test(keyCandidate)) return null;
  const color = ERP_NOTE_COLORS.find((c) => c.id === colorCandidate)?.id || ERP_NOTE_DEFAULT_COLOR;
  return { key: keyCandidate, title: titleCandidate.slice(0, 60), color };
}

/** Load the user's columns from localStorage, falling back to defaults. */
export function loadNotesColumns(userId) {
  if (typeof window === 'undefined') return [...ERP_NOTE_DEFAULT_COLUMNS];
  try {
    const raw = window.localStorage.getItem(notesColumnsStorageKey(userId));
    if (!raw) return [...ERP_NOTE_DEFAULT_COLUMNS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...ERP_NOTE_DEFAULT_COLUMNS];
    const cleaned = parsed.map(normaliseColumn).filter(Boolean);
    if (!cleaned.length) return [...ERP_NOTE_DEFAULT_COLUMNS];
    // De-dupe by key — keep the first occurrence.
    const seen = new Set();
    const out = [];
    for (const c of cleaned) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      out.push(c);
    }
    return out;
  } catch {
    return [...ERP_NOTE_DEFAULT_COLUMNS];
  }
}

/** Persist the user's columns to localStorage. */
export function saveNotesColumns(userId, columns) {
  if (typeof window === 'undefined') return;
  try {
    const cleaned = Array.isArray(columns)
      ? columns.map(normaliseColumn).filter(Boolean)
      : [];
    window.localStorage.setItem(notesColumnsStorageKey(userId), JSON.stringify(cleaned));
  } catch {
    /* localStorage quota / disabled — best-effort */
  }
}

/**
 * Normalise + de-dupe a column list. Used by the DB load/save helpers to keep
 * a single source of truth for what "valid columns" looks like and to absorb
 * any historic dirt from older clients.
 */
function sanitiseColumnList(raw) {
  if (!Array.isArray(raw)) return [];
  const cleaned = raw.map(normaliseColumn).filter(Boolean);
  if (!cleaned.length) return [];
  const seen = new Set();
  const out = [];
  for (const c of cleaned) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    out.push(c);
  }
  return out;
}

/**
 * Load the user's columns from the DB.
 *
 * Returns:
 *   - `{ columns: ErpNoteColumn[], source: 'db' }` when a row exists for this
 *     user and at least one valid column was found.
 *   - `{ columns: null, source: 'empty' }` when the row is missing — the caller
 *     should fall back to localStorage / defaults (and may want to seed the
 *     row with their current local copy).
 *   - `{ columns: null, source: 'unavailable' }` when the table doesn't exist
 *     yet (migration not applied) or the request errors. The caller should
 *     stay on localStorage and stop attempting DB sync for this session.
 *
 * Never throws — DB sync is best-effort and must not break the board.
 */
export async function loadNotesColumnsFromDb(supabaseClient, userId) {
  if (!supabaseClient || !userId) return { columns: null, source: 'empty' };
  try {
    const { data, error } = await supabaseClient
      .from('erp_note_columns')
      .select('columns')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      // Postgrest returns `42P01` (undefined_table) when the migration hasn't
      // been applied yet. Treat any error here as "fall back to local cache".
      return { columns: null, source: 'unavailable' };
    }
    if (!data) return { columns: null, source: 'empty' };
    const cleaned = sanitiseColumnList(data.columns);
    if (!cleaned.length) return { columns: null, source: 'empty' };
    return { columns: cleaned, source: 'db' };
  } catch {
    return { columns: null, source: 'unavailable' };
  }
}

/**
 * Upsert the user's columns into the DB. Returns true on success, false if
 * the DB is unavailable. Never throws.
 */
export async function saveNotesColumnsToDb(supabaseClient, userId, columns) {
  if (!supabaseClient || !userId) return false;
  const cleaned = sanitiseColumnList(columns);
  try {
    const { error } = await supabaseClient
      .from('erp_note_columns')
      .upsert({ user_id: userId, columns: cleaned }, { onConflict: 'user_id' });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Resolve a column reference (id or row) against a column list.
 * Falls back to the first column if the key isn't in the list.
 */
export function resolveNoteColumn(columnKey, columns = ERP_NOTE_DEFAULT_COLUMNS) {
  if (!columns?.length) return ERP_NOTE_DEFAULT_COLUMNS[0];
  return columns.find((c) => c.key === columnKey) || columns[0];
}

/** Generate a new, unique column key from a candidate title. */
export function makeColumnKey(title, existingKeys = []) {
  const base =
    String(title || 'lane')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'lane';
  const taken = new Set(existingKeys);
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

/** "Today / Tomorrow / 3d / Mon Jun 5" style chip for the due-date pill. */
export function formatNoteDueShort(dueIso) {
  if (!dueIso) return '';
  const d = new Date(dueIso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days < 7) return `In ${days}d`;
  if (days < -1 && days > -7) return `${Math.abs(days)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** A note is "overdue" if its due date is in the past AND it isn't on the
 *  last column of the user's board (typically "Done"). The caller passes the
 *  current column list so we can detect the terminal lane without hardcoding
 *  "done". */
export function isNoteOverdue(dueIso, columnKey, columns) {
  if (!dueIso) return false;
  const list = Array.isArray(columns) && columns.length ? columns : ERP_NOTE_DEFAULT_COLUMNS;
  const terminalKey = list[list.length - 1]?.key;
  if (columnKey && columnKey === terminalKey) return false;
  const t = new Date(dueIso).getTime();
  if (Number.isNaN(t)) return false;
  return t < Date.now();
}
