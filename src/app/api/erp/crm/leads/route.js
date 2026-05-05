import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { erpRbacCan } from '../../../../../lib/erp-rbac-modules';
import { fetchMergedRbacGrantsForUser } from '../../../../../lib/erp-rbac-server';
import { CRM_PIPELINE_STAGE_SET } from '../../../../../lib/erp-crm-pipeline';

export const runtime = 'nodejs';

export async function GET(request) {
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
    const { data: leads, error: lErr } = await admin
      .from('erp_crm_leads')
      .select('id, company_name, contact_name, email, platform_id, pipeline_stage, created_at, updated_at')
      .order('updated_at', { ascending: false });
    if (lErr) throw new Error(lErr.message);

    const { data: platforms, error: pErr } = await admin
      .from('erp_client_platform_options')
      .select('id, label, sort_order')
      .order('sort_order', { ascending: true });
    if (pErr) throw new Error(pErr.message);

    return NextResponse.json({
      ok: true,
      leads: leads || [],
      platforms: platforms || [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load leads';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const grants = await fetchMergedRbacGrantsForUser(profile.role, user.id);
  if (!erpRbacCan(grants, 'clients', 'create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const companyName = String(body.companyName || body.company_name || '')
    .trim()
    .slice(0, 240);
  if (!companyName) {
    return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
  }

  const contactName = body.contactName != null ? String(body.contactName).trim().slice(0, 200) : '';
  const email = body.email != null ? String(body.email).trim().slice(0, 320) : '';
  const platformIdRaw = body.platformId != null ? String(body.platformId).trim().slice(0, 48) : '';
  const platformId = platformIdRaw || null;

  const stageRaw = String(body.pipelineStage || body.pipeline_stage || 'new_lead').trim();
  const pipeline_stage = CRM_PIPELINE_STAGE_SET.has(stageRaw) ? stageRaw : 'new_lead';

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (platformId) {
    const { data: opt, error: oErr } = await admin.from('erp_client_platform_options').select('id').eq('id', platformId).maybeSingle();
    if (oErr) {
      return NextResponse.json({ error: oErr.message }, { status: 500 });
    }
    if (!opt) {
      return NextResponse.json({ error: 'Unknown platform' }, { status: 400 });
    }
  }

  try {
    const insert = {
      company_name: companyName,
      contact_name: contactName || null,
      email: email || null,
      platform_id: platformId,
      pipeline_stage,
      updated_at: new Date().toISOString(),
    };
    const { data: row, error: insErr } = await admin.from('erp_crm_leads').insert(insert).select('*').single();
    if (insErr) throw new Error(insErr.message);
    return NextResponse.json({ ok: true, lead: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create lead';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
