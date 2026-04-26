/**
 * Map `erp_activity_log` rows into inbox-style items (merged with erp_notifications in ErpInbox).
 */

/** Hide project-chat and DM / group messaging from Recent Activity (notifications + activity). */
export function isErpMessagingNotification(row) {
  if (!row) return false;
  const t = String(row.title || '');
  const l = String(row.link || '');
  if (t.startsWith('New message in ')) return true;
  if (t.startsWith('Mention in ')) return true;
  if (t.startsWith('Direct message from ')) return true;
  if (t.startsWith('Message from ')) return true;
  // Group DMs use: "<Group> — <Sender>"
  if (/\s—\s/.test(t) && l.includes('/erp/messages?group=')) return true;
  if (l.includes('/erp/messages')) return true;
  // Project chat channels deep-link: /erp/projects/<id>?channel=<id> (may be absolute)
  if (l.includes('/erp/projects/') && l.includes('channel=')) return true;
  return false;
}

/**
 * Live "incoming call" notifications. Title is set by /api/erp/calls/ring and the
 * link points to the messages page with `?join=1` so answering auto-joins the room.
 */
export function isErpIncomingCallNotification(row) {
  if (!row) return false;
  const t = String(row.title || '');
  if (!t.startsWith('Incoming call from ') && !t.startsWith('Incoming group call from ')) return false;
  const l = String(row.link || '');
  return l.includes('/erp/messages') && l.includes('join=1');
}

/** Caller-side feedback (decline / missed / busy). Sent by /api/erp/calls/signal. */
export function isErpCallSignalNotification(row) {
  if (!row) return false;
  const t = String(row.title || '');
  return (
    t.startsWith('Call declined by ') ||
    t.startsWith('No answer from ') ||
    t.startsWith('Missed call from ') ||
    t.startsWith('Busy: ')
  );
}

/** Persistent "you missed it" record we patch onto the original ringing row when no one answers. */
export const ERP_CALL_MISSED_PREFIX = 'Missed call from ';
export const ERP_CALL_MISSED_GROUP_PREFIX = 'Missed group call from ';

function actorLabel(userId, profileById) {
  const p = userId && profileById ? profileById[userId] : null;
  const n = p?.full_name && String(p.full_name).trim();
  return n || 'Someone';
}

/**
 * @param {object} row - erp_activity_log row
 * @param {Record<string, { full_name?: string }>} profileById
 * @param {Record<string, string>} projectNameById
 */
export function mapActivityRowToFeedItem(row, profileById, projectNameById) {
  const m = row.meta && typeof row.meta === 'object' ? row.meta : {};
  const actor = actorLabel(row.user_id, profileById);
  const pname = row.project_id ? projectNameById[row.project_id] || 'Project' : 'Workspace';

  let title = '';
  let body = '';
  let link = '/erp/inbox';

  switch (row.action) {
    case 'session_login':
      title = `${actor} signed in`;
      body = m.context ? `Context: ${String(m.context)}` : 'Workspace session started';
      link = '/erp/dashboard';
      break;
    case 'session_logout':
      title = `${actor} signed out`;
      body = 'Workspace session ended';
      link = '/erp/dashboard';
      break;
    case 'user_removed': {
      const label = m.display_name ? String(m.display_name) : m.email ? String(m.email) : 'A user';
      title = 'User removed from workspace';
      body = `${label} was removed`;
      link = '/erp/admin/members';
      break;
    }
    case 'users_purged':
      title = 'Bulk user removal';
      body =
        typeof m.count === 'number'
          ? `${m.count} workspace account(s) were removed`
          : 'Multiple workspace accounts were removed';
      link = '/erp/admin/members';
      break;
    case 'task_status_changed': {
      const taskTitle = String(m.title || 'Task').slice(0, 120);
      const to = m.to != null ? String(m.to).replace(/_/g, ' ') : '';
      const from = m.from != null ? String(m.from).replace(/_/g, ' ') : '';
      if (String(m.to) === 'done') {
        title = `Task completed · ${taskTitle}`;
        body = `${actor} marked it done · ${pname}`;
      } else {
        title = `Task updated · ${taskTitle}`;
        body = `${actor} set status${from ? ` from ${from}` : ''} to ${to || 'updated'} · ${pname}`;
      }
      link = row.project_id ? `/erp/projects/${row.project_id}` : '/erp/my-tasks';
      break;
    }
    case 'project_created':
      title = `Project created · ${String(m.name || 'Project').slice(0, 120)}`;
      body = `${actor} created this project`;
      link = row.project_id ? `/erp/projects/${row.project_id}` : '/erp/projects';
      break;
    case 'project_deadline_changed': {
      const pn = String(m.name || pname).slice(0, 120);
      const fromStr = m.from != null && String(m.from).trim() !== '' ? String(m.from) : null;
      const toStr = m.to != null && String(m.to).trim() !== '' ? String(m.to) : null;
      title = `Project deadline updated · ${pn}`;
      if (!fromStr && !toStr) {
        body = `${actor} updated the due date`;
      } else if (!fromStr && toStr) {
        body = `${actor} set due date to ${toStr}`;
      } else if (fromStr && !toStr) {
        body = `${actor} cleared the due date (was ${fromStr})`;
      } else {
        body = `${actor} changed due date from ${fromStr} to ${toStr}`;
      }
      link = row.project_id ? `/erp/projects/${row.project_id}` : '/erp/my-tasks';
      break;
    }
    case 'member_joined':
      title = `${actor} joined ${pname}`;
      body = m.via === 'invite' ? 'Accepted an invitation' : 'Added to the project';
      link = row.project_id ? `/erp/projects/${row.project_id}` : '/erp/projects';
      break;
    case 'message_sent':
      title = 'Project chat message';
      body = m.preview ? String(m.preview).slice(0, 200) : `${actor} posted in ${pname}`;
      link = row.project_id ? `/erp/projects/${row.project_id}` : '/erp/dashboard';
      break;
    case 'project_column_changed': {
      const pn = String(m.name || pname).slice(0, 120);
      const fromL = String(m.from || '').replace(/_/g, ' ');
      const toL = String(m.to || '').replace(/_/g, ' ');
      title = `Project board updated · ${pn}`;
      body = `${actor} moved ${fromL || '—'} → ${toL || '—'}`;
      link = row.project_id ? `/erp/projects/${row.project_id}` : '/erp/my-tasks';
      break;
    }
    case 'task_priority_changed': {
      const tt = String(m.title || 'Task').slice(0, 120);
      const fromP = m.from != null ? String(m.from).replace(/_/g, ' ') : '';
      const toP = m.to != null ? String(m.to).replace(/_/g, ' ') : '';
      title = `Task priority · ${tt}`;
      body = fromP ? `${actor} changed ${fromP} → ${toP} · ${pname}` : `${actor} set priority to ${toP} · ${pname}`;
      link = row.project_id ? `/erp/projects/${row.project_id}` : '/erp/my-tasks';
      break;
    }
    case 'bulk_task_priority_set': {
      const pn = String(m.project_name || m.name || pname).slice(0, 120);
      const pr = String(m.priority || '').replace(/_/g, ' ');
      const n = typeof m.task_count === 'number' ? m.task_count : null;
      title = `Bulk priority · ${pn}`;
      body = n != null ? `${actor} set all ${n} task(s) to ${pr}` : `${actor} set all tasks to ${pr} · ${pn}`;
      link = row.project_id ? `/erp/projects/${row.project_id}` : '/erp/my-tasks';
      break;
    }
    case 'task_created':
    case 'subtask_created': {
      const t = String(m.title || 'Task').slice(0, 120);
      title = `Task created · ${t}`;
      body = `${actor} in ${pname}`;
      link = row.project_id ? `/erp/projects/${row.project_id}` : '/erp/my-tasks';
      break;
    }
    default:
      title = String(row.action || 'activity').replace(/_/g, ' ');
      body = `${actor} · ${pname}`;
      link = row.project_id ? `/erp/projects/${row.project_id}` : '/erp/inbox';
  }

  return {
    feedKey: `a-${row.id}`,
    kind: 'activity',
    notificationId: null,
    title,
    body,
    read: true,
    link,
    created_at: row.created_at,
    action: row.action,
  };
}

/** Visual classification for inbox chips (aligned with ErpInbox classifyNotification). */
export function classifyFeedItem(row) {
  const text = `${row.title || ''} ${row.body || ''}`.toLowerCase();
  const action = row.action ? String(row.action) : '';

  if (action === 'session_login' || action === 'session_logout') return 'default';
  if (action === 'user_removed' || action === 'users_purged' || action === 'member_joined') return 'invite';
  if (
    action === 'task_status_changed' ||
    action === 'task_created' ||
    action === 'subtask_created' ||
    action === 'project_deadline_changed' ||
    action === 'task_priority_changed' ||
    action === 'bulk_task_priority_set' ||
    action === 'project_column_changed' ||
    /task|assigned|subtask|deadline|priority|board/.test(text)
  )
    return 'task';
  if (action === 'message_sent' || /new message|message in|chat|dm/.test(text)) return 'message';
  if (/\bleave\b|time off|medical|pto|vacation/.test(text)) return 'leave';
  if (/invite|invitation|joined|member|removed/.test(text)) return 'invite';
  if (/project created|project/.test(text) && action === 'project_created') return 'invite';
  return 'default';
}
