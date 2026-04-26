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
