import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';

export const runtime = 'nodejs';

async function enrichProfilesWithEmail(admin, profiles) {
  if (!profiles?.length) return [];
  const CONC = 8;
  const out = [];
  for (let i = 0; i < profiles.length; i += CONC) {
    const batch = profiles.slice(i, i + CONC);
    const chunk = await Promise.all(
      batch.map(async (p) => {
        let email = (p.contact_email && String(p.contact_email).trim()) || null;
        if (!email && admin.auth?.admin?.getUserById) {
          try {
            const { data, error } = await admin.auth.admin.getUserById(p.id);
            if (!error && data?.user?.email) email = data.user.email;
          } catch {
            /* ignore */
          }
        }
        return {
          id: p.id,
          role: p.role,
          full_name: p.full_name,
          avatar_path: p.avatar_path,
          member_team: p.member_team ?? null,
          email,
        };
      }),
    );
    out.push(...chunk);
  }
  return out;
}

/**
 * GET ?groupId= — members of a message group (for avatars / names in group chat).
 * Caller must be a member of the group.
 */
export async function GET(request) {
  const { user, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const groupId = request.nextUrl.searchParams.get('groupId');
  if (!groupId || typeof groupId !== 'string') {
    return NextResponse.json({ error: 'groupId required' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { data: mems, error: mErr } = await admin
    .from('erp_message_group_members')
    .select('user_id')
    .eq('group_id', groupId);

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  const ids = [...new Set((mems || []).map((m) => m.user_id).filter(Boolean))];
  if (!ids.includes(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (ids.length === 0) {
    return NextResponse.json({ members: [] });
  }

  const baseSelect = 'id, role, full_name, avatar_path, contact_email, member_team';
  const fallbackSelect = 'id, role, full_name, avatar_path, contact_email';

  let { data: profiles, error: pErr } = await admin.from('erp_profiles').select(baseSelect).in('id', ids);
  if (pErr && String(pErr.message || '').toLowerCase().includes('member_team')) {
    ({ data: profiles, error: pErr } = await admin.from('erp_profiles').select(fallbackSelect).in('id', ids));
  }

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const members = await enrichProfilesWithEmail(admin, profiles || []);

  members.sort((a, b) => displayNameSort(a) - displayNameSort(b));

  return NextResponse.json({ members });
}

/**
 * POST — add workspace users to a group (invite). Caller must already be a member.
 * Body: { groupId: string, inviteUserIds: string[] }
 */
export async function POST(request) {
  const { user, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const groupId = body?.groupId;
  const inviteUserIds = body?.inviteUserIds;
  if (!groupId || typeof groupId !== 'string') {
    return NextResponse.json({ error: 'groupId required' }, { status: 400 });
  }
  if (!Array.isArray(inviteUserIds)) {
    return NextResponse.json({ error: 'inviteUserIds must be an array' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { data: mems, error: mErr } = await admin
    .from('erp_message_group_members')
    .select('user_id')
    .eq('group_id', groupId);

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  const memberSet = new Set((mems || []).map((m) => m.user_id).filter(Boolean));
  if (!memberSet.has(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rawIds = [...new Set(inviteUserIds.filter((id) => typeof id === 'string' && id.length > 0))];
  const toAdd = rawIds.filter((id) => id !== user.id && !memberSet.has(id));
  if (toAdd.length === 0) {
    return NextResponse.json({ error: 'No new members to add', added: 0 }, { status: 400 });
  }

  const { data: profs, error: pErr } = await admin.from('erp_profiles').select('id').in('id', toAdd);
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const valid = new Set((profs || []).map((p) => p.id));
  const rows = toAdd.filter((id) => valid.has(id)).map((uid) => ({ group_id: groupId, user_id: uid }));

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid workspace members to add' }, { status: 400 });
  }

  const { error: insErr } = await admin.from('erp_message_group_members').insert(rows);
  if (insErr) {
    const msg = String(insErr.message || '');
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return NextResponse.json({ error: 'One or more users are already in this group' }, { status: 409 });
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  await admin.from('erp_message_groups').update({ updated_at: new Date().toISOString() }).eq('id', groupId);

  return NextResponse.json({ added: rows.length });
}

function displayNameSort(u) {
  const n = (u?.full_name && String(u.full_name).trim()) || u?.email || '';
  return n.toLowerCase();
}
