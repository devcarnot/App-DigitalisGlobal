/**
 * True when PostgREST reports a missing RPC, table, or stale schema cache
 * (e.g. migration not applied on this Supabase project yet).
 */
export function isSupabaseSchemaMissingError(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  const details = String(err.details || '').toLowerCase();
  const hint = String(err.hint || '').toLowerCase();
  const combined = `${msg} ${details} ${hint}`;
  if (code === '42P01' || code === 'PGRST116') return true;
  if (combined.includes('could not find the function')) return true;
  if (combined.includes('schema cache') && (combined.includes('function') || combined.includes('relation'))) return true;
  if (combined.includes('relation') && combined.includes('does not exist')) return true;
  if (combined.includes('does not exist') && combined.includes('public.')) return true;
  return false;
}

const MIGRATION_HINTS = [
  {
    test: (m) => m.includes('erp_trashed_users'),
    hint: 'Run migration supabase/migrations/20260531150000_erp_trashed_users_ensure_and_backfill.sql in Supabase SQL Editor, then refresh.',
  },
  {
    test: (m) => m.includes('erp_project_channels'),
    hint: 'Run migration supabase/migrations/20260531120000_erp_project_channels_manage_fix.sql in Supabase SQL Editor, then refresh.',
  },
  {
    test: (m) => m.includes('priority') && m.includes('erp_projects'),
    hint: 'Run migration supabase/migrations/20260529120000_erp_projects_priority.sql in Supabase SQL Editor, then refresh.',
  },
];

/**
 * Turn raw API / Supabase errors into actionable copy for ERP UI.
 * @param {string} message
 * @returns {string}
 */
export function formatErpFetchError(message) {
  const raw = String(message || '').trim();
  if (!raw) return 'Something went wrong. Try again.';
  const m = raw.toLowerCase();
  if (m.includes('schema cache') || (m.includes('does not exist') && m.includes('public.'))) {
    for (const row of MIGRATION_HINTS) {
      if (row.test(m)) return row.hint;
    }
    return 'A database update is required on this workspace. Ask an admin to apply pending Supabase migrations, then refresh.';
  }
  return raw;
}
