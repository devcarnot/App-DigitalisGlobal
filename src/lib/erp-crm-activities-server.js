import { createSupabaseAdmin } from './supabase-admin';
import { CRM_ACTIVITY_TYPES, formatStageChangeLabel } from './erp-crm-activities';

export function isCrmActivitiesSchemaMissing(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return msg.includes('erp_crm_lead_activities') && (msg.includes('does not exist') || msg.includes('relation'));
}

export async function insertLeadActivity({
  leadId,
  activityType,
  title,
  body = null,
  meta = {},
  createdBy = null,
}) {
  const admin = createSupabaseAdmin();
  if (!admin) throw new Error('Server misconfigured');

  const type = CRM_ACTIVITY_TYPES.includes(activityType) ? activityType : 'other';
  const row = {
    lead_id: leadId,
    activity_type: type,
    title: String(title || 'Activity').trim().slice(0, 240) || 'Activity',
    body: body != null && String(body).trim() ? String(body).slice(0, 5000) : null,
    meta: meta && typeof meta === 'object' ? meta : {},
    created_by: createdBy || null,
  };

  const { data, error } = await admin.from('erp_crm_lead_activities').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

export async function fetchLeadActivitySummaries(leadIds = []) {
  if (!leadIds.length) return {};
  const admin = createSupabaseAdmin();
  if (!admin) return {};

  const { data, error } = await admin
    .from('erp_crm_lead_activities')
    .select('lead_id, activity_type, title, created_at')
    .in('lead_id', leadIds)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (error) {
    if (isCrmActivitiesSchemaMissing(error)) return {};
    throw error;
  }

  const byLead = {};
  for (const row of data || []) {
    if (!byLead[row.lead_id]) byLead[row.lead_id] = [];
    byLead[row.lead_id].push(row);
  }

  const { summarizeLeadActivities } = await import('./erp-crm-activities');
  const out = {};
  for (const id of leadIds) {
    out[id] = summarizeLeadActivities(byLead[id] || []);
  }
  return out;
}

export async function logLeadStageChange({ leadId, fromStage, toStage, userId }) {
  if (!leadId || !toStage || fromStage === toStage) return null;
  try {
    return await insertLeadActivity({
      leadId,
      activityType: 'stage_change',
      title: formatStageChangeLabel(fromStage, toStage),
      body: null,
      meta: { from_stage: fromStage || null, to_stage: toStage },
      createdBy: userId,
    });
  } catch (error) {
    if (isCrmActivitiesSchemaMissing(error)) return null;
    throw error;
  }
}
