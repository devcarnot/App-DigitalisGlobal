import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { erpInviteGlobalRoleToProjectRole } from '../../../../../lib/erp-invite-server';
import { erpInviteWorkspaceRoleRank } from '../../../../../lib/erp-invite-role-rank';

function isAuthEmailTakenError(err) {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes('already been registered') ||
    msg.includes('already registered') ||
    msg.includes('user already registered') ||
    err.status === 422
  );
}

function isUniqueViolation(err) {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('duplicate key') || err.code === '23505';
}

function createAnonSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizePhone(v) {
  if (typeof v !== 'string') return '';
  return v.trim();
}

function isValidPhone(v) {
  const t = normalizePhone(v);
  return t.length >= 7 && t.length <= 40;
}

function clientInviteRequiresPhone(inv) {
  return String(inv?.global_role || '').trim().toLowerCase() === 'client';
}

async function ensureProfileAndMembership(admin, inv, userId, fullName, phoneRaw) {
  const name = fullName.trim();
  const phoneNeeded = clientInviteRequiresPhone(inv);
  const phoneTrim = normalizePhone(phoneRaw);
  const contactEmail = String(inv.email || '')
    .trim()
    .toLowerCase();

  if (phoneNeeded && !isValidPhone(phoneTrim)) {
    return { error: 'Enter a valid phone number (7–40 characters).' };
  }
  const storedPhone = phoneNeeded ? phoneTrim : null;

  const { data: prof } = await admin.from('erp_profiles').select('id, full_name, role').eq('id', userId).maybeSingle();

  const baseProfileRow = {
    full_name: name,
    contact_email: contactEmail || null,
    updated_at: new Date().toISOString(),
  };

  if (!prof) {
    const { error: insErr } = await admin.from('erp_profiles').insert({
      id: userId,
      role: inv.global_role,
      ...baseProfileRow,
      phone: storedPhone,
    });
    if (insErr) return { error: insErr.message };
  } else {
    // Apply the invite's role to the existing profile. This handles two real
    // scenarios that previously left the wrong role on disk:
    //   1. A Postgres `handle_new_user` trigger (or other auto-row) inserted a
    //      default profile (often role='client') the moment auth.users got the
    //      new row, so by the time we run we see an existing profile and the
    //      old `upgrade-only-if-higher-rank` logic would silently keep the
    //      default — invitees ended up as 'client' even when invited as
    //      team_member/team_lead.
    //   2. A returning user (e.g. a previous client) re-accepts an invite as a
    //      team member; their stored role should follow the most recent
    //      invite intent.
    // Existing admins and team leads are protected: an invite-accept never
    // demotes them to a lower-privileged role. Non-recognised roles fall back
    // to "always honour the invite".
    const updatePayload = { ...baseProfileRow };
    if (phoneNeeded) {
      updatePayload.phone = phoneTrim;
    }
    if (inv.global_role) {
      const isProtected = prof.role === 'admin' || prof.role === 'team_lead';
      const wouldDemote =
        isProtected && erpInviteWorkspaceRoleRank(inv.global_role) < erpInviteWorkspaceRoleRank(prof.role);
      if (!wouldDemote && inv.global_role !== prof.role) {
        updatePayload.role = inv.global_role;
      }
    }
    const { error: upErr } = await admin.from('erp_profiles').update(updatePayload).eq('id', userId);
    if (upErr) return { error: upErr.message };
  }

  // Belt-and-suspenders force-write of the workspace role: re-fetch the row we
  // just touched and, if a downstream trigger / extension reverted it back to
  // anything other than the invite's `global_role`, slam it again. We exclude
  // existing `admin` rows so this can never demote an admin who legitimately
  // matches an invite for some other role. Logged so production traces show
  // exactly what happened during accept-invite for debugging stuck users.
  if (inv.global_role) {
    const { data: postProf } = await admin
      .from('erp_profiles')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle();
    const currentRole = postProf?.role ?? null;
    if (postProf && currentRole !== 'admin' && currentRole !== inv.global_role) {
      const { error: forceErr } = await admin
        .from('erp_profiles')
        .update({ role: inv.global_role, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .neq('role', 'admin');
      if (forceErr) {
        console.warn(
          'erp accept-invite force role update failed',
          { userId, target: inv.global_role, currentRole, error: forceErr.message || forceErr },
        );
      } else {
        console.info(
          'erp accept-invite role normalised',
          { userId, from: currentRole, to: inv.global_role, inviteId: inv.id },
        );
      }
    }
  }

  if (inv.project_id) {
    const { error: mErr } = await admin.from('erp_project_members').insert({
      project_id: inv.project_id,
      user_id: userId,
      role: erpInviteGlobalRoleToProjectRole(inv.global_role),
    });
    if (mErr && !isUniqueViolation(mErr)) {
      console.error('erp_project_members insert', mErr);
      return { error: mErr.message };
    }
    if (!mErr) {
      await admin.from('erp_activity_log').insert({
        project_id: inv.project_id,
        user_id: userId,
        action: 'member_joined',
        meta: { via: 'invite' },
      });
    }
  }

  await admin.from('erp_invitations').update({ accepted_at: new Date().toISOString() }).eq('id', inv.id);

  return { error: null };
}

export async function POST(request) {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured (Supabase service role)' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { token, password, fullName, phone } = body;
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const { data: inv, error: invErr } = await admin
    .from('erp_invitations')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (invErr || !inv) {
    return NextResponse.json({ error: 'Invalid invitation' }, { status: 400 });
  }
  if (inv.accepted_at) {
    return NextResponse.json({ error: 'Invitation already used' }, { status: 400 });
  }
  if (new Date(inv.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invitation expired' }, { status: 400 });
  }

  const invitation = {
    ...inv,
    global_role: typeof inv.global_role === 'string' ? inv.global_role.trim() || null : null,
  };

  const phoneTrim = normalizePhone(typeof phone === 'string' ? phone : '');
  if (clientInviteRequiresPhone(invitation) && !isValidPhone(phoneTrim)) {
    return NextResponse.json({ error: 'Phone number is required (7–40 characters).' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization');
  const hasBearer = authHeader?.startsWith('Bearer ') && authHeader.length > 20;

  if (hasBearer) {
    const { user, error: authErr } = await getErpUserFromRequest(request);
    if (authErr || !user) {
      return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
    }
    const inviteEmail = String(inv.email || '').trim().toLowerCase();
    const sessionEmail = String(user.email || '').trim().toLowerCase();
    if (!sessionEmail || sessionEmail !== inviteEmail) {
      return NextResponse.json(
        {
          error:
            'You are signed in with a different email than this invitation. Sign out and sign in with the invited address, or use the password form below.',
        },
        { status: 403 },
      );
    }
    if (typeof fullName !== 'string' || fullName.trim().length < 2) {
      return NextResponse.json({ error: 'Full name required' }, { status: 400 });
    }
    const nameRaw = fullName.trim();
    const rest = await ensureProfileAndMembership(admin, invitation, user.id, nameRaw, phoneTrim);
    if (rest.error) {
      return NextResponse.json({ error: rest.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      userId: user.id,
      email: inv.email,
      existingAccount: true,
      linkedWithSession: true,
    });
  }

  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }
  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    return NextResponse.json({ error: 'Full name required' }, { status: 400 });
  }

  const userMetadata = { full_name: fullName.trim() };
  if (clientInviteRequiresPhone(invitation) && phoneTrim) {
    userMetadata.phone = phoneTrim;
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: inv.email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  });

  if (!createErr && created?.user?.id) {
    const userId = created.user.id;
    const rest = await ensureProfileAndMembership(admin, invitation, userId, fullName, phoneTrim);
    if (rest.error) {
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: rest.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, userId, email: inv.email, existingAccount: false });
  }

  if (!isAuthEmailTakenError(createErr)) {
    return NextResponse.json({ error: createErr?.message || 'Could not create account' }, { status: 400 });
  }

  const anon = createAnonSupabase();
  if (!anon) {
    return NextResponse.json({ error: 'Server misconfigured (Supabase anon client)' }, { status: 500 });
  }

  const { data: signData, error: signErr } = await anon.auth.signInWithPassword({
    email: inv.email,
    password,
  });

  if (signErr || !signData?.user?.id) {
    return NextResponse.json(
      {
        error:
          'This email already has an account. Enter your existing workspace password to join this project. If you forgot it, use Sign in and reset your password.',
      },
      { status: 400 }
    );
  }

  const userId = signData.user.id;
  await anon.auth.signOut();

  const rest = await ensureProfileAndMembership(admin, invitation, userId, fullName, phoneTrim);
  if (rest.error) {
    return NextResponse.json({ error: rest.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, userId, email: inv.email, existingAccount: true });
}
