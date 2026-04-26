import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../../lib/erp-auth-server';
import { ensureProjectTaskAnchor } from '../../../../../lib/erp-project-task-anchor';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Creates or returns the single anchor root row for a project (same title as project when new). */
export async function POST(request) {
  const { user, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : '';
  if (!UUID_RE.test(projectId)) {
    return NextResponse.json({ error: 'Invalid project' }, { status: 400 });
  }

  const supabase = createSupabaseUserClient(token);
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { data: proj, error: pErr } = await supabase.from('erp_projects').select('name').eq('id', projectId).maybeSingle();
  if (pErr || !proj) {
    return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 });
  }

  try {
    const anchorId = await ensureProjectTaskAnchor(supabase, {
      projectId,
      userId: user.id,
      projectName: proj.name,
    });
    return NextResponse.json({ ok: true, anchorId });
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Could not prepare project tasks' }, { status: 400 });
  }
}
