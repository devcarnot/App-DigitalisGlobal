/**
 * Client helpers for the `erp_dm_reactions` table.
 *
 * Reactions are written directly from the browser via the supabase JS client;
 * RLS enforces that the row's `user_id` is the caller and that the caller can
 * see the underlying message (DM peer or group member).
 *
 * Note: project-channel reactions live in a separate `erp_message_reactions`
 * table managed by `ErpProjectWorkspace`. The two tables intentionally don't
 * share rows so each feature can evolve independently.
 */

import { supabase } from './supabase';

export const ERP_DM_REACTIONS_TABLE = 'erp_dm_reactions';

/**
 * Reload all reactions for a list of DM message ids. Returns rows
 * `{ id, dm_message_id, user_id, emoji, created_at }`.
 */
export async function loadDmReactionsForMessages(messageIds) {
  if (!Array.isArray(messageIds) || messageIds.length === 0) return [];
  const { data, error } = await supabase
    .from(ERP_DM_REACTIONS_TABLE)
    .select('id, dm_message_id, user_id, emoji, created_at')
    .in('dm_message_id', messageIds);
  if (error) {
    console.warn('[reactions] load DM failed:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Same as above for group messages.
 */
export async function loadGroupReactionsForMessages(messageIds) {
  if (!Array.isArray(messageIds) || messageIds.length === 0) return [];
  const { data, error } = await supabase
    .from(ERP_DM_REACTIONS_TABLE)
    .select('id, group_message_id, user_id, emoji, created_at')
    .in('group_message_id', messageIds);
  if (error) {
    console.warn('[reactions] load group failed:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Toggle a reaction for the current viewer. If they already reacted with that
 * emoji, the row is deleted; otherwise a new row is inserted. Returns the
 * outcome `{ added, removed, error }`.
 *
 * `scope` is 'dm' or 'group'; `messageId` is the foreign-key target.
 */
export async function toggleMessageReaction({ scope, messageId, emoji, viewerId }) {
  if (!scope || !messageId || !emoji || !viewerId) {
    return { error: 'Missing arguments' };
  }
  const column = scope === 'group' ? 'group_message_id' : 'dm_message_id';
  const { data: existing, error: selErr } = await supabase
    .from(ERP_DM_REACTIONS_TABLE)
    .select('id')
    .eq(column, messageId)
    .eq('user_id', viewerId)
    .eq('emoji', emoji)
    .maybeSingle();
  if (selErr) return { error: selErr.message };

  if (existing?.id) {
    const { error: delErr } = await supabase
      .from(ERP_DM_REACTIONS_TABLE)
      .delete()
      .eq('id', existing.id);
    if (delErr) return { error: delErr.message };
    return { removed: true };
  }

  const insertRow = {
    user_id: viewerId,
    emoji,
    [column]: messageId,
  };
  const { data: inserted, error: insErr } = await supabase
    .from(ERP_DM_REACTIONS_TABLE)
    .insert(insertRow)
    .select('id, user_id, emoji, created_at, dm_message_id, group_message_id')
    .maybeSingle();
  if (insErr) return { error: insErr.message };
  return { added: inserted };
}
