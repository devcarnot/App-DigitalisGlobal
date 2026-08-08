import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../../lib/supabase-admin';
import { erpRbacCan } from '../../../../../../lib/erp-rbac-modules';
import { fetchMergedRbacGrantsForUser } from '../../../../../../lib/erp-rbac-server';
import { CRM_PIPELINE_STAGE_SET } from '../../../../../../lib/erp-crm-pipeline';
import { emptyLeadActivitySummary } from '../../../../../../lib/erp-crm-activities';
import { fetchLeadActivitySummaries, logLeadStageChange } from '../../../../../../lib/erp-crm-activities-server';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const leadId = params?.leadId;
  if (!leadId || typeof leadId !== 'string') {
    return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });
  }

  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const grants = await fetchMergedRbacGrantsForUser(profile.role, user.id);
  if (!erpRbacCan(grants, 'clients', 'view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  try {
    const { data: row, error } = await admin.from('erp_crm_leads').select('*').eq('id', leadId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    let summary = emptyLeadActivitySummary();
    try {
      const map = await fetchLeadActivitySummaries([leadId]);
      summary = map[leadId] || summary;
    } catch {
      /* ignore */
    }

    return NextResponse.json({ ok: true, lead: { ...row, activity_summary: summary } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not load lead';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PATCH: update pipeline stage / fields on a CRM lead.
 * DELETE: remove a lead row.
 */
export async function PATCH(request, { params }) {
  const leadId = params?.leadId;
  if (!leadId || typeof leadId !== 'string') {
    return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });
  }

  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const grants = await fetchMergedRbacGrantsForUser(profile.role, user.id);
  if (!erpRbacCan(grants, 'clients', 'edit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch = {};
  if ('pipeline_stage' in body || 'pipelineStage' in body) {
    const s = String(body.pipeline_stage ?? body.pipelineStage ?? '').trim();
    if (!CRM_PIPELINE_STAGE_SET.has(s)) {
      return NextResponse.json({ error: 'Invalid pipeline stage' }, { status: 400 });
    }
    patch.pipeline_stage = s;
  }
  if ('company_name' in body || 'companyName' in body) {
    const c = String(body.company_name ?? body.companyName ?? '').trim().slice(0, 240);
    if (!c) {
      return NextResponse.json({ error: 'Company name cannot be empty' }, { status: 400 });
    }
    patch.company_name = c;
  }
  if ('contact_name' in body || 'contactName' in body) {
    const x = body.contact_name ?? body.contactName;
    patch.contact_name = x != null && String(x).trim() ? String(x).trim().slice(0, 200) : null;
  }
  if ('email' in body) {
    const em = body.email != null ? String(body.email).trim().slice(0, 320) : '';
    patch.email = em || null;
  }
  if ('phone' in body) {
    // Free-form to accommodate international formats; we just trim & cap.
    const ph = body.phone != null ? String(body.phone).trim().slice(0, 64) : '';
    patch.phone = ph || null;
  }
  if ('notes' in body) {
    // Multi-line scratchpad for "what was discussed / what's next". Preserve
    // newlines and whitespace inside; only clear the column when the trimmed
    // value is empty so an explicit "wipe notes" still works.
    const raw = body.notes != null ? String(body.notes).slice(0, 5000) : '';
    patch.notes = raw.trim() ? raw : null;
  }
  if ('platform_id' in body || 'platformId' in body) {
    const raw = body.platform_id ?? body.platformId;
    const pid = raw != null && String(raw).trim() ? String(raw).trim().slice(0, 48) : null;
    patch.platform_id = pid;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (patch.platform_id) {
    const { data: opt, error: oErr } = await admin
      .from('erp_client_platform_options')
      .select('id')
      .eq('id', patch.platform_id)
      .maybeSingle();
    if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });
    if (!opt) {
      return NextResponse.json({ error: 'Unknown platform' }, { status: 400 });
    }
  }

  try {
    let previousStage = null;
    if (patch.pipeline_stage) {
      const { data: prev, error: prevErr } = await admin
        .from('erp_crm_leads')
        .select('pipeline_stage')
        .eq('id', leadId)
        .maybeSingle();
      if (prevErr) throw new Error(prevErr.message);
      if (!prev) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
      previousStage = prev.pipeline_stage;
    }

    const { data: row, error: upErr } = await admin
      .from('erp_crm_leads')
      .update(patch)
      .eq('id', leadId)
      .select('*')
      .maybeSingle();
    if (upErr) throw new Error(upErr.message);
    if (!row) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (patch.pipeline_stage && previousStage !== patch.pipeline_stage) {
      await logLeadStageChange({
        leadId,
        fromStage: previousStage,
        toStage: patch.pipeline_stage,
        userId: user.id,
      });
    }

    let summary = emptyLeadActivitySummary();
    try {
      const map = await fetchLeadActivitySummaries([leadId]);
      summary = map[leadId] || summary;
    } catch {
      /* ignore */
    }

    return NextResponse.json({ ok: true, lead: { ...row, activity_summary: summary } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not update lead';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const leadId = params?.leadId;
  if (!leadId || typeof leadId !== 'string') {
    return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });
  }

  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const grants = await fetchMergedRbacGrantsForUser(profile.role, user.id);
  if (!erpRbacCan(grants, 'clients', 'delete')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  try {
    const { error: delErr } = await admin.from('erp_crm_leads').delete().eq('id', leadId);
    if (delErr) throw new Error(delErr.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not delete lead';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
