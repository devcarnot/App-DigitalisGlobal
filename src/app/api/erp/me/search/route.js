import { NextResponse } from 'next/server';
import { createSupabaseUserClient, getErpUserFromRequest } from '../../../../../lib/erp-auth-server';

export const runtime = 'nodejs';

/** @param {string} q */
function ilikePattern(q) {
  const t = q.trim();
  if (t.length < 2) return null;
  const escaped = t.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return `%${escaped}%`;
}

/** Roman Urdu / voice aliases → erp_profiles.role */
const ROLE_QUERY_ALIASES = {
  'super admin': 'admin',
  superadmin: 'admin',
  admin: 'admin',
  'team manager': 'team_lead',
  'team lead': 'team_lead',
  hr: 'hr',
  bd: 'bd',
};

/**
 * Workspace-wide search (RLS-scoped): projects, tasks, people.
 */
export async function GET(request) {
  const { user, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const token = request.headers.get('authorization')?.startsWith('Bearer ')
    ? request.headers.get('authorization').slice(7)
    : null;
  if (!token) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get('q') || '';
  const pattern = ilikePattern(q);
  if (!pattern) {
    return NextResponse.json({ ok: true, projects: [], tasks: [], people: [] });
  }

  const sb = createSupabaseUserClient(token);
  if (!sb) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  try {
    const peopleMap = new Map();
    const qNorm = q.trim().toLowerCase();
    const roleFilter = ROLE_QUERY_ALIASES[qNorm];
    if (roleFilter) {
      const { data: roleRows, error: roleErr } = await sb
        .from('erp_profiles')
        .select('id, full_name, role, contact_email, member_team')
        .eq('role', roleFilter)
        .order('full_name', { ascending: true })
        .limit(12);
      if (roleErr) throw new Error(roleErr.message);
      for (const p of roleRows || []) {
        if (p?.id) peopleMap.set(p.id, p);
      }
    }

    const [{ data: projects, error: pErr }, { data: tasks, error: tErr }, { data: pName, error: pnErr }, { data: pEmail, error: peErr }] =
      await Promise.all([
        sb
          .from('erp_projects')
          .select('id, name, updated_at')
          .ilike('name', pattern)
          .is('deleted_at', null)
          .order('name', { ascending: true })
          .limit(15),
        sb
          .from('erp_tasks')
          .select('id, title, project_id, status, updated_at')
          .ilike('title', pattern)
          .order('updated_at', { ascending: false })
          .limit(25),
        sb.from('erp_profiles').select('id, full_name, role, contact_email, member_team').ilike('full_name', pattern).limit(12),
        sb.from('erp_profiles').select('id, full_name, role, contact_email, member_team').ilike('contact_email', pattern).limit(12),
      ]);

    if (pErr) throw new Error(pErr.message);
    if (tErr) throw new Error(tErr.message);
    if (pnErr) throw new Error(pnErr.message);
    if (peErr) throw new Error(peErr.message);

    for (const p of [...(pName || []), ...(pEmail || [])]) {
      if (p?.id && !peopleMap.has(p.id)) peopleMap.set(p.id, p);
    }
    const people = [...peopleMap.values()].slice(0, 12);

    return NextResponse.json({
      ok: true,
      projects: projects || [],
      tasks: tasks || [],
      people,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Search failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
