import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';
import { isErpPortalAdminEmail } from '../../../../lib/erp-portal-admin-emails';

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
  if (!email || !isErpPortalAdminEmail(email)) {
    return NextResponse.json(
      {
        error:
          'This sign-in email is not on the workspace admin allow list. Add it to ERP_PORTAL_ADMIN_EMAILS or NEXT_PUBLIC_ADMIN_DASHBOARD_EMAILS on the server.',
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
