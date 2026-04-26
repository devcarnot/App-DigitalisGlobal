import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';

/** Comma-separated emails allowed to set their own erp_profiles.role to admin (Vercel / .env.local). */
function allowedClaimEmails() {
  const raw = process.env.ERP_PORTAL_ADMIN_EMAILS || process.env.ERP_ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Lets a signed-in user upgrade their ERP profile to admin if their Auth email is in ERP_PORTAL_ADMIN_EMAILS.
 * Fixes cases where the profile was created as team_member but the same person runs the public /admin site.
 */
export async function POST(request) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }

  const email = user.email?.toLowerCase();
  const allow = allowedClaimEmails();
  if (!email || allow.length === 0 || !allow.includes(email)) {
    return NextResponse.json(
      {
        error:
          'This sign-in email is not on the portal admin allow list, or ERP_PORTAL_ADMIN_EMAILS is not set on the server.',
      },
      { status: 403 }
    );
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const fullName =
    profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Admin';

  const { error: upErr } = await admin.from('erp_profiles').upsert(
    {
      id: user.id,
      role: 'admin',
      full_name: fullName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, role: 'admin' });
}
