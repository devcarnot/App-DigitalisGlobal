import { CRM_PIPELINE_STAGES } from './erp-crm-pipeline';

export const CRM_ACTIVITY_TYPES = ['call', 'email', 'note', 'task', 'meeting', 'stage_change', 'sms', 'other'];

const STAGE_LABEL = Object.fromEntries(CRM_PIPELINE_STAGES.map((s) => [s.id, s.label]));

export function crmActivityTypeLabel(type) {
  switch (type) {
    case 'call':
      return 'Call';
    case 'email':
      return 'Email';
    case 'note':
      return 'Note';
    case 'task':
      return 'Task';
    case 'meeting':
      return 'Meeting';
    case 'stage_change':
      return 'Stage change';
    case 'sms':
      return 'SMS';
    default:
      return 'Activity';
  }
}

export function formatCrmActivityWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

export function formatStageChangeLabel(fromStage, toStage) {
  const from = STAGE_LABEL[fromStage] || fromStage || 'Unknown';
  const to = STAGE_LABEL[toStage] || toStage || 'Unknown';
  return `Moved from ${from} to ${to}`;
}

export function emptyLeadActivitySummary() {
  return {
    total: 0,
    notes: 0,
    tasks: 0,
    calls: 0,
    emails: 0,
    meetings: 0,
    last_at: null,
    last_title: null,
    last_type: null,
  };
}

export function summarizeLeadActivities(rows = []) {
  const summary = emptyLeadActivitySummary();
  for (const row of rows) {
    summary.total += 1;
    if (row.activity_type === 'note') summary.notes += 1;
    if (row.activity_type === 'task') summary.tasks += 1;
    if (row.activity_type === 'call') summary.calls += 1;
    if (row.activity_type === 'email') summary.emails += 1;
    if (row.activity_type === 'meeting') summary.meetings += 1;
    if (!summary.last_at || new Date(row.created_at) > new Date(summary.last_at)) {
      summary.last_at = row.created_at;
      summary.last_title = row.title;
      summary.last_type = row.activity_type;
    }
  }
  return summary;
}
