import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { isErpGlobalAdmin } from '../../../../../lib/erp-roles';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * PATCH body: { userId, fullName?, contactEmail?, phone? }
 * Super admin only. Target must be an internal workspace profile.
 */
export async function PATCH(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  if (!isErpGlobalAdmin(profile.role)) {
    return NextResponse.json({ error: 'Only workspace super admins can edit member profiles.' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'Valid userId required' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { data: target, error: fetchErr } = await admin
    .from('erp_profiles')
    .select('id, role, full_name, contact_email, phone')
    .eq('id', userId)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if (target.role === 'client') {
    return NextResponse.json({ error: 'Use the clients admin flow for client accounts.' }, { status: 400 });
  }

  const patch = { updated_at: new Date().toISOString() };

  if (body.fullName !== undefined) {
    const fullName = String(body.fullName || '').trim();
    if (!fullName) {
      return NextResponse.json({ error: 'Full name is required.' }, { status: 400 });
    }
    if (fullName.length > 200) {
      return NextResponse.json({ error: 'Full name must be 200 characters or fewer.' }, { status: 400 });
    }
    patch.full_name = fullName;
  }

  if (body.contactEmail !== undefined) {
    const contactEmail = String(body.contactEmail || '').trim();
    if (contactEmail && !EMAIL_RE.test(contactEmail)) {
      return NextResponse.json({ error: 'Enter a valid contact email.' }, { status: 400 });
    }
    patch.contact_email = contactEmail || null;
  }

  if (body.phone !== undefined) {
    const phone = String(body.phone || '').trim();
    if (phone.length > 40) {
      return NextResponse.json({ error: 'Phone must be 40 characters or fewer.' }, { status: 400 });
    }
    patch.phone = phone || null;
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const { error: upErr } = await admin.from('erp_profiles').update(patch).eq('id', userId);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  if (patch.full_name) {
    try {
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          full_name: patch.full_name,
          display_name: patch.full_name,
        },
      });
    } catch {
      /* metadata sync optional */
    }
  }

  return NextResponse.json({
    ok: true,
    profile: {
      id: userId,
      full_name: patch.full_name ?? target.full_name,
      contact_email: patch.contact_email !== undefined ? patch.contact_email : target.contact_email,
      phone: patch.phone !== undefined ? patch.phone : target.phone,
    },
  });
}
