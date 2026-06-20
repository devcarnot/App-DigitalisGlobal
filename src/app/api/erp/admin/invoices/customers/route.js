import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../lib/erp-auth-server';
import { assertAdmin, getAdminClient } from '../../../../../../lib/erp-invoice-server';
import { validateEmailList } from '../../../../../../lib/erp-invoices';

export const runtime = 'nodejs';

export async function GET(request) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  try {
    assertAdmin(profile);
  } catch (ex) {
    return NextResponse.json({ error: ex.message }, { status: ex.status || 403 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();

  try {
    const admin = getAdminClient();
    let query = admin
      .from('erp_invoice_customers')
      .select('*')
      .order('display_name', { ascending: true })
      .limit(200);
    const { data, error: dbErr } = await query;
    if (dbErr) throw new Error(dbErr.message);
    let rows = data || [];
    if (q) {
      rows = rows.filter((c) => {
        const hay = [c.display_name, c.email, c.company_name, c.phone, c.abn]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return NextResponse.json({ ok: true, customers: rows });
  } catch (ex) {
    return NextResponse.json({ error: ex?.message || 'Load failed' }, { status: 400 });
  }
}

export async function POST(request) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  try {
    assertAdmin(profile);
  } catch (ex) {
    return NextResponse.json({ error: ex.message }, { status: ex.status || 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const display_name = typeof body?.display_name === 'string' ? body.display_name.trim() : '';
  if (!display_name) return NextResponse.json({ error: 'Customer name is required.' }, { status: 400 });

  const emailRaw = typeof body?.email === 'string' ? body.email.trim() : '';
  if (emailRaw) {
    const emailCheck = validateEmailList(emailRaw, { label: 'Email', required: false });
    if (!emailCheck.ok) return NextResponse.json({ error: emailCheck.error }, { status: 400 });
  }

  const row = {
    display_name: display_name.slice(0, 200),
    email: emailRaw ? emailRaw.slice(0, 320) : null,
    phone: typeof body?.phone === 'string' ? body.phone.trim().slice(0, 80) : null,
    company_name: typeof body?.company_name === 'string' ? body.company_name.trim().slice(0, 200) : null,
    abn: typeof body?.abn === 'string' ? body.abn.replace(/\s/g, '').slice(0, 20) || null : null,
    billing_address: typeof body?.billing_address === 'string' ? body.billing_address.trim().slice(0, 500) : null,
    city: typeof body?.city === 'string' ? body.city.trim().slice(0, 120) : null,
    state: typeof body?.state === 'string' ? body.state.trim().slice(0, 120) : null,
    postal_code: typeof body?.postal_code === 'string' ? body.postal_code.trim().slice(0, 40) : null,
    country: typeof body?.country === 'string' ? body.country.trim().slice(0, 120) : 'Australia',
    notes: typeof body?.notes === 'string' ? body.notes.trim().slice(0, 2000) : null,
    updated_at: new Date().toISOString(),
  };

  try {
    const admin = getAdminClient();
    const { data, error: insErr } = await admin.from('erp_invoice_customers').insert(row).select('*').single();
    if (insErr) throw new Error(insErr.message);
    return NextResponse.json({ ok: true, customer: data });
  } catch (ex) {
    return NextResponse.json({ error: ex?.message || 'Create failed' }, { status: 400 });
  }
}
