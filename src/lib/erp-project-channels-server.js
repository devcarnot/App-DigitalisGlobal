import { isErpGlobalAdmin, isErpManagerRole } from './erp-roles';

/**
 * Who may create/rename/delete side channels and set channel membership.
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{ userId: string, profileRole?: string | null, projectId: string }} args
 */
export async function userCanManageProjectChannels(admin, { userId, profileRole, projectId }) {
  const role = String(profileRole || '').trim();
  if (isErpGlobalAdmin(role) || isErpManagerRole(role)) return true;

  const { data: membership, error } = await admin
    .from('erp_project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return false;
  if (membership?.role === 'project_lead') return true;
  if (role === 'team_member' && membership) return true;
  return false;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{
 *   projectId: string,
 *   createdBy: string,
 *   name: string,
 *   sortOrder?: number,
 *   memberUserIds: string[],
 * }} args
 */
export async function createProjectSideChannel(admin, args) {
  const { projectId, createdBy, name, sortOrder = 0, memberUserIds } = args;
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed.length > 80) {
    return { channel: null, error: new Error('Channel name must be 1–80 characters.') };
  }

  const uniqueMembers = [...new Set((memberUserIds || []).filter(Boolean))];
  const withCreator = createdBy && !uniqueMembers.includes(createdBy) ? [...uniqueMembers, createdBy] : uniqueMembers;
  if (withCreator.length === 0) {
    return { channel: null, error: new Error('Add at least one project member to this channel.') };
  }

  const { data: projectMembers, error: pmErr } = await admin
    .from('erp_project_members')
    .select('user_id')
    .eq('project_id', projectId)
    .in('user_id', withCreator);
  if (pmErr) return { channel: null, error: pmErr };
  const allowed = new Set((projectMembers || []).map((r) => r.user_id));
  const finalMembers = withCreator.filter((id) => allowed.has(id));
  if (finalMembers.length === 0) {
    return { channel: null, error: new Error('Selected members must belong to this project.') };
  }

  const { data: channel, error: chErr } = await admin
    .from('erp_project_channels')
    .insert({
      project_id: projectId,
      name: trimmed,
      sort_order: sortOrder,
      is_general: false,
      created_by: createdBy,
    })
    .select('id, name, sort_order, is_general')
    .single();
  if (chErr) return { channel: null, error: chErr };

  const { error: memErr } = await admin.from('erp_project_channel_members').insert(
    finalMembers.map((uid) => ({ channel_id: channel.id, user_id: uid })),
  );
  if (memErr) {
    await admin.from('erp_project_channels').delete().eq('id', channel.id);
    return { channel: null, error: memErr };
  }

  return { channel, memberUserIds: finalMembers, error: null };
}
