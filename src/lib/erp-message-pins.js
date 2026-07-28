import { supabase } from './supabase';
import { isSupabaseSchemaMissingError } from './supabase-errors';

export const ERP_CHAT_MESSAGE_PINS_TABLE = 'erp_chat_message_pins';
export const MAX_PINNED_CHAT_MESSAGES = 3;

/** @param {string} userIdA @param {string} userIdB */
export function dmThreadKey(userIdA, userIdB) {
  if (!userIdA || !userIdB) return null;
  return [userIdA, userIdB].sort().join(':');
}

/** @param {{ project_message_id?: string, dm_message_id?: string, group_message_id?: string } | null | undefined} row */
export function pinRowMessageId(row) {
  if (!row) return null;
  return row.project_message_id || row.dm_message_id || row.group_message_id || null;
}

async function listPins(query) {
  const { data, error } = await query.order('pinned_at', { ascending: false });
  if (error) {
    if (isSupabaseSchemaMissingError(error)) return { rows: [], schemaMissing: true };
    return { rows: [], error: error.message };
  }
  return { rows: data || [] };
}

export async function loadProjectMessagePins({ projectId, channelId }) {
  if (!projectId || !channelId) return { rows: [] };
  return listPins(
    supabase
      .from(ERP_CHAT_MESSAGE_PINS_TABLE)
      .select(
        'id, project_message_id, dm_message_id, group_message_id, project_id, channel_id, dm_thread_key, group_id, pinned_by, pinned_at',
      )
      .eq('project_id', projectId)
      .eq('channel_id', channelId),
  );
}

export async function loadDmMessagePins({ dmThreadKey: key }) {
  if (!key) return { rows: [] };
  return listPins(
    supabase
      .from(ERP_CHAT_MESSAGE_PINS_TABLE)
      .select(
        'id, project_message_id, dm_message_id, group_message_id, project_id, channel_id, dm_thread_key, group_id, pinned_by, pinned_at',
      )
      .eq('dm_thread_key', key),
  );
}

export async function loadGroupMessagePins({ groupId }) {
  if (!groupId) return { rows: [] };
  return listPins(
    supabase
      .from(ERP_CHAT_MESSAGE_PINS_TABLE)
      .select(
        'id, project_message_id, dm_message_id, group_message_id, project_id, channel_id, dm_thread_key, group_id, pinned_by, pinned_at',
      )
      .eq('group_id', groupId),
  );
}

async function countThreadPins(filter) {
  const { count, error } = await supabase
    .from(ERP_CHAT_MESSAGE_PINS_TABLE)
    .select('id', { count: 'exact', head: true })
    .match(filter);
  if (error) {
    if (isSupabaseSchemaMissingError(error)) return { count: 0, schemaMissing: true };
    return { count: 0, error: error.message };
  }
  return { count: count || 0 };
}

export async function pinProjectMessage({ messageId, projectId, channelId, pinnedBy }) {
  if (!messageId || !projectId || !channelId || !pinnedBy) {
    return { error: 'Missing arguments' };
  }
  const { count, error: countErr, schemaMissing } = await countThreadPins({
    project_id: projectId,
    channel_id: channelId,
  });
  if (schemaMissing) return { schemaMissing: true };
  if (countErr) return { error: countErr };
  if (count >= MAX_PINNED_CHAT_MESSAGES) {
    return { error: `You can pin up to ${MAX_PINNED_CHAT_MESSAGES} messages in this chat.` };
  }
  const { data, error } = await supabase
    .from(ERP_CHAT_MESSAGE_PINS_TABLE)
    .insert({
      project_message_id: messageId,
      project_id: projectId,
      channel_id: channelId,
      pinned_by: pinnedBy,
    })
    .select(
      'id, project_message_id, dm_message_id, group_message_id, project_id, channel_id, dm_thread_key, group_id, pinned_by, pinned_at',
    )
    .single();
  if (error) {
    if (isSupabaseSchemaMissingError(error)) return { schemaMissing: true };
    return { error: error.message };
  }
  return { row: data };
}

export async function pinDmMessage({ messageId, dmThreadKey: key, pinnedBy }) {
  if (!messageId || !key || !pinnedBy) return { error: 'Missing arguments' };
  const { count, error: countErr, schemaMissing } = await countThreadPins({ dm_thread_key: key });
  if (schemaMissing) return { schemaMissing: true };
  if (countErr) return { error: countErr };
  if (count >= MAX_PINNED_CHAT_MESSAGES) {
    return { error: `You can pin up to ${MAX_PINNED_CHAT_MESSAGES} messages in this chat.` };
  }
  const { data, error } = await supabase
    .from(ERP_CHAT_MESSAGE_PINS_TABLE)
    .insert({
      dm_message_id: messageId,
      dm_thread_key: key,
      pinned_by: pinnedBy,
    })
    .select(
      'id, project_message_id, dm_message_id, group_message_id, project_id, channel_id, dm_thread_key, group_id, pinned_by, pinned_at',
    )
    .single();
  if (error) {
    if (isSupabaseSchemaMissingError(error)) return { schemaMissing: true };
    return { error: error.message };
  }
  return { row: data };
}

export async function pinGroupMessage({ messageId, groupId, pinnedBy }) {
  if (!messageId || !groupId || !pinnedBy) return { error: 'Missing arguments' };
  const { count, error: countErr, schemaMissing } = await countThreadPins({ group_id: groupId });
  if (schemaMissing) return { schemaMissing: true };
  if (countErr) return { error: countErr };
  if (count >= MAX_PINNED_CHAT_MESSAGES) {
    return { error: `You can pin up to ${MAX_PINNED_CHAT_MESSAGES} messages in this chat.` };
  }
  const { data, error } = await supabase
    .from(ERP_CHAT_MESSAGE_PINS_TABLE)
    .insert({
      group_message_id: messageId,
      group_id: groupId,
      pinned_by: pinnedBy,
    })
    .select(
      'id, project_message_id, dm_message_id, group_message_id, project_id, channel_id, dm_thread_key, group_id, pinned_by, pinned_at',
    )
    .single();
  if (error) {
    if (isSupabaseSchemaMissingError(error)) return { schemaMissing: true };
    return { error: error.message };
  }
  return { row: data };
}

export async function unpinChatMessage(pinId) {
  if (!pinId) return { error: 'Missing pin id' };
  const { error } = await supabase.from(ERP_CHAT_MESSAGE_PINS_TABLE).delete().eq('id', pinId);
  if (error) {
    if (isSupabaseSchemaMissingError(error)) return { schemaMissing: true };
    return { error: error.message };
  }
  return { ok: true };
}
