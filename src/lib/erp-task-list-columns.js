/**
 * Explicit columns for project workspace task lists: avoids `select('*')` payload bloat.
 * Keep in sync with mutations / modals that read task rows from Supabase.
 */
export const ERP_TASK_LIST_COLUMNS =
  'id,project_id,title,status,priority,parent_task_id,assignee_id,assignee_ids,created_by,due_date,start_date,description,tagged_user_ids,attachments,created_at,updated_at';

/** Project chat messages loaded into workspace state. */
export const ERP_PROJECT_MESSAGE_LIST_COLUMNS =
  'id,project_id,channel_id,user_id,body,body_format,attachments,created_at,reply_to_id,edited_at,deleted_at';

/** Same as above when `body_format` migration is not applied yet. */
export const ERP_PROJECT_MESSAGE_LIST_COLUMNS_LEGACY =
  'id,project_id,channel_id,user_id,body,attachments,created_at,reply_to_id,edited_at,deleted_at';

function isMissingBodyFormatColumnError(err) {
  const msg = String(err?.message || err?.details || '').toLowerCase();
  return (
    err?.code === '42703' ||
    (msg.includes('body_format') && (msg.includes('does not exist') || msg.includes('schema cache')))
  );
}

/**
 * Load project channel messages; falls back when `body_format` column is missing.
 * @returns {Promise<{ data: object[] | null, error: object | null }>}
 */
export async function fetchErpProjectMessages(supabase, { projectId, channelId, limit, ascending = false }) {
  const buildQuery = (columns) =>
    supabase
      .from('erp_messages')
      .select(columns)
      .eq('project_id', projectId)
      .eq('channel_id', channelId)
      .order('created_at', { ascending })
      .limit(limit);

  const withFormat = await buildQuery(ERP_PROJECT_MESSAGE_LIST_COLUMNS);
  if (!withFormat.error) return withFormat;

  if (!isMissingBodyFormatColumnError(withFormat.error)) return withFormat;

  const legacy = await buildQuery(ERP_PROJECT_MESSAGE_LIST_COLUMNS_LEGACY);
  if (legacy.error) return legacy;

  return {
    data: (legacy.data || []).map((row) => ({ ...row, body_format: 'markdown' })),
    error: null,
  };
}
