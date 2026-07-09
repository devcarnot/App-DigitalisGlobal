const PROJECT_ID_CHUNK = 80;

/**
 * Keep only project ids that still exist and are not soft-deleted.
 * Membership rows can outlive trash/restore, so callers must not render stubs for missing rows.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string[]} projectIds
 */
export async function filterActiveErpProjectIds(supabaseClient, projectIds) {
  const ids = [...new Set((projectIds || []).filter(Boolean))];
  if (ids.length === 0) return [];

  const active = new Set();
  const slices = [];
  for (let i = 0; i < ids.length; i += PROJECT_ID_CHUNK) slices.push(ids.slice(i, i + PROJECT_ID_CHUNK));

  const results = await Promise.all(
    slices.map((slice) =>
      supabaseClient.from('erp_projects').select('id').in('id', slice).is('deleted_at', null),
    ),
  );

  for (const { data, error } of results) {
    if (error) throw error;
    for (const row of data || []) {
      if (row?.id) active.add(row.id);
    }
  }

  return ids.filter((id) => active.has(id));
}
