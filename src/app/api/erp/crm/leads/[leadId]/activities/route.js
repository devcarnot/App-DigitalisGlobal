import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../../../lib/supabase-admin';
import { erpRbacCan } from '../../../../../../../lib/erp-rbac-modules';
import { fetchMergedRbacGrantsForUser } from '../../../../../../../lib/erp-rbac-server';
import { CRM_ACTIVITY_TYPES } from '../../../../../../../lib/erp-crm-activities';
import { insertLeadActivity, isCrmActivitiesSchemaMissing } from '../../../../../../../lib/erp-crm-activities-server';

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

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 40), 1), 200);

  try {
    const { data, error } = await admin
      .from('erp_crm_lead_activities')
      .select('id, lead_id, activity_type, title, body, meta, created_by, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (isCrmActivitiesSchemaMissing(error)) {
        return NextResponse.json({ ok: true, activities: [], schemaReady: false });
      }
      throw error;
    }

    return NextResponse.json({ ok: true, activities: data || [], schemaReady: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not load activities';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request, { params }) {
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

  const activityType = String(body.activityType || body.activity_type || 'other').trim();
  const title = String(body.title || '').trim();
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (!CRM_ACTIVITY_TYPES.includes(activityType)) {
    return NextResponse.json({ error: 'Invalid activity type' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { data: lead, error: leadErr } = await admin.from('erp_crm_leads').select('id').eq('id', leadId).maybeSingle();
  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  try {
    const row = await insertLeadActivity({
      leadId,
      activityType,
      title: title.slice(0, 240),
      body: body.body != null ? String(body.body).slice(0, 5000) : null,
      meta: body.meta && typeof body.meta === 'object' ? body.meta : {},
      createdBy: user.id,
    });
    return NextResponse.json({ ok: true, activity: row });
  } catch (e) {
    if (isCrmActivitiesSchemaMissing(e)) {
      return NextResponse.json(
        { error: 'CRM activities are not set up yet. Run the latest Supabase migration.' },
        { status: 503 },
      );
    }
    const msg = e instanceof Error ? e.message : 'Could not save activity';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
