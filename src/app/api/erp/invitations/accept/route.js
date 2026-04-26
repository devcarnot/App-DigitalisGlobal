import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';

function projectRoleFromGlobal(globalRole) {
  if (globalRole === 'team_lead') return 'project_lead';
  if (globalRole === 'client') return 'client';
  return 'member';
}

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

async function ensureProfileAndMembership(admin, inv, userId, fullName, phone) {
  const name = fullName.trim();
  const phoneTrim = normalizePhone(phone);
  const contactEmail = String(inv.email || '')
    .trim()
    .toLowerCase();

  if (!isValidPhone(phoneTrim)) {
    return { error: 'Enter a valid phone number (7–40 characters).' };
  }

  const { data: prof } = await admin.from('erp_profiles').select('id, full_name').eq('id', userId).maybeSingle();

  const profileRow = {
    full_name: name,
    phone: phoneTrim,
    contact_email: contactEmail || null,
    updated_at: new Date().toISOString(),
  };

  if (!prof) {
    const { error: insErr } = await admin.from('erp_profiles').insert({
      id: userId,
      role: inv.global_role,
      ...profileRow,
    });
    if (insErr) return { error: insErr.message };
  } else {
    const { error: upErr } = await admin.from('erp_profiles').update(profileRow).eq('id', userId);
    if (upErr) return { error: upErr.message };
  }

  if (inv.project_id) {
    const { error: mErr } = await admin.from('erp_project_members').insert({
      project_id: inv.project_id,
      user_id: userId,
      role: projectRoleFromGlobal(inv.global_role),
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

  const phoneTrim = normalizePhone(phone);
  if (!isValidPhone(phoneTrim)) {
    return NextResponse.json({ error: 'Phone number is required (7–40 characters).' }, { status: 400 });
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
    const rest = await ensureProfileAndMembership(admin, inv, user.id, nameRaw, phoneTrim);
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

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: inv.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName.trim(), phone: phoneTrim },
  });

  if (!createErr && created?.user?.id) {
    const userId = created.user.id;
    const rest = await ensureProfileAndMembership(admin, inv, userId, fullName, phoneTrim);
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

  const rest = await ensureProfileAndMembership(admin, inv, userId, fullName, phoneTrim);
  if (rest.error) {
    return NextResponse.json({ error: rest.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, userId, email: inv.email, existingAccount: true });
}
