import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';

/**
 * Public-ish: check an invite token.
 *
 * Anyone with the token can hit this endpoint, so we only return the
 * **masked** email by default to limit PII leakage if a token leaks
 * (logs, browser history, screenshots, …).
 *
 * The unmasked `email` is only included when the caller is already signed in
 * AND their session email matches the invited email — the accept-invite UI
 * uses this to decide whether to show a "continue as you" path or a fresh
 * sign-up form. Anonymous callers never see the full address.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  if (!token) {
    return NextResponse.json({ valid: false, error: 'Missing token' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ valid: false, error: 'Server misconfigured' }, { status: 500 });
  }

  const { data: inv, error } = await admin
    .from('erp_invitations')
    .select('email, expires_at, accepted_at, project_id, global_role')
    .eq('token', token)
    .maybeSingle();

  if (error || !inv) {
    return NextResponse.json({ valid: false, error: 'Invalid token' });
  }
  if (inv.accepted_at) {
    return NextResponse.json({ valid: false, error: 'Already accepted' });
  }
  if (new Date(inv.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, error: 'Expired' });
  }

  const masked = inv.email.replace(/(^.).*(@.*$)/, '$1***$2');

  // Only echo back the unmasked email when the caller's session matches the
  // invitee — needed by the accept-invite "continue as <you>" UX.
  let unmasked = null;
  try {
    const { user } = await getErpUserFromRequest(request);
    const sessionEmail = user?.email?.trim().toLowerCase() || '';
    if (sessionEmail && sessionEmail === inv.email.trim().toLowerCase()) {
      unmasked = inv.email;
    }
  } catch {
    /* anonymous caller — keep email masked */
  }

  let projectName = null;
  if (inv.project_id) {
    const { data: proj } = await admin.from('erp_projects').select('name').eq('id', inv.project_id).maybeSingle();
    projectName = proj?.name ?? null;
  }

  return NextResponse.json({
    valid: true,
    ...(unmasked ? { email: unmasked } : {}),
    emailMask: masked,
    hasProject: Boolean(inv.project_id),
    projectName,
    /** So the accept form can require phone only for client invites. */
    globalRole: inv.global_role || null,
  });
}
