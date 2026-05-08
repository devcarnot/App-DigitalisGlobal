/**
 * Explicit columns for project workspace task lists — avoids `select('*')` payload bloat.
 * Keep in sync with mutations / modals that read task rows from Supabase.
 */
export const ERP_TASK_LIST_COLUMNS =
  'id,project_id,title,status,priority,parent_task_id,assignee_id,assignee_ids,created_by,due_date,start_date,description,tagged_user_ids,attachments,created_at,updated_at';

/** Project chat messages loaded into workspace state. */
export const ERP_PROJECT_MESSAGE_LIST_COLUMNS =
  'id,project_id,channel_id,user_id,body,attachments,created_at,reply_to_id,edited_at';
