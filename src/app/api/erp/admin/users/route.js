import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { isErpAdminEquivalent } from '../../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';
import { ERP_ADMIN_USERS_MAX } from '../../../../../lib/erp-query-limits';

export const runtime = 'nodejs';

/**
 * List workspace users (erp_profiles + Auth email). Admin or team lead.
 */
export async function GET(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }
  if (!isErpAdminEquivalent(profile?.role)) {
    return NextResponse.json({ error: 'Only workspace admins or team leads can list users.' }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured (service role)' }, { status: 500 });
  }

  const { data: profiles, error: listErr } = await admin
    .from('erp_profiles')
    .select('id, role, full_name, created_at, avatar_path, contact_email')
    .order('created_at', { ascending: true })
    .limit(ERP_ADMIN_USERS_MAX);

  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const rows = profiles || [];
  const needAuthEmail = rows.filter((p) => !(p.contact_email && String(p.contact_email).trim()));
  const authById = new Map();
  const CONC = 8;
  for (let i = 0; i < needAuthEmail.length; i += CONC) {
    const batch = needAuthEmail.slice(i, i + CONC);
    const chunk = await Promise.all(
      batch.map(async (p) => {
        try {
          const { data } = await admin.auth.admin.getUserById(p.id);
          return [p.id, data?.user ?? null];
        } catch {
          return [p.id, null];
        }
      }),
    );
    for (const [id, u] of chunk) authById.set(id, u);
  }

  const enriched = rows.map((p) => {
    const u = authById.get(p.id);
    const email =
      (p.contact_email && String(p.contact_email).trim()) || u?.email || null;
    return {
      id: p.id,
      email,
      full_name: p.full_name,
      role: p.role,
      created_at: p.created_at,
      avatar_path: p.avatar_path ?? null,
      last_sign_in_at: u?.last_sign_in_at ?? null,
    };
  });

  const rank = (r) => (r === 'admin' ? 0 : r === 'team_lead' ? 1 : 2);
  enriched.sort((a, b) => {
    const ra = rank(a.role);
    const rb = rank(b.role);
    if (ra !== rb) return ra - rb;
    const ea = (a.email || '').toLowerCase();
    const eb = (b.email || '').toLowerCase();
    return ea.localeCompare(eb);
  });

  return NextResponse.json({ users: enriched, currentUserId: user.id });
}
