/**
 * Idempotently ensure a project has exactly one General chat channel (server-side).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db — service-role or user client with insert rights
 * @param {string} projectId
 * @param {string | null | undefined} createdBy
 */
export async function ensureProjectGeneralChannel(db, projectId, createdBy = null) {
  if (!db || !projectId) {
    return { channel: null, error: new Error('Missing database client or project id') };
  }

  const { data: existing, error: selErr } = await db
    .from('erp_project_channels')
    .select('id, name, sort_order, is_general')
    .eq('project_id', projectId)
    .eq('is_general', true)
    .maybeSingle();

  if (selErr) {
    return { channel: null, error: selErr };
  }
  if (existing?.id) {
    return { channel: existing, error: null };
  }

  const { data: created, error: insErr } = await db
    .from('erp_project_channels')
    .insert({
      project_id: projectId,
      name: 'General',
      sort_order: 0,
      is_general: true,
      created_by: createdBy || null,
    })
    .select('id, name, sort_order, is_general')
    .single();

  return { channel: created, error: insErr };
}
