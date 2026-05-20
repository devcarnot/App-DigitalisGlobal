import { NextResponse } from 'next/server';
import { getErpUserFromRequest, createSupabaseUserClient } from '../../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../../lib/supabase-admin';
import { isValidErpProjectId } from '../../../../../../lib/erp-project-id';
import { isErpGlobalAdmin } from '../../../../../../lib/erp-roles';
import { ensureProjectGeneralChannel } from '../../../../../../lib/erp-ensure-general-channel';

export async function POST(request, { params }) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) {
    return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  }

  const projectId = typeof params?.projectId === 'string' ? params.projectId : null;
  if (!projectId || !isValidErpProjectId(projectId)) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const globalAdmin = isErpGlobalAdmin(profile?.role);
  if (!globalAdmin) {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const supabase = createSupabaseUserClient(accessToken);
    const { data: membership, error: memErr } = await supabase
      .from('erp_project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (memErr) {
      return NextResponse.json({ error: memErr.message }, { status: 400 });
    }
    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this project' }, { status: 403 });
    }
  }

  const { channel, error: ensureErr } = await ensureProjectGeneralChannel(admin, projectId, user.id);
  if (ensureErr) {
    const msg = String(ensureErr.message || ensureErr);
    const missingTable = /does not exist|schema cache|relation.*erp_project_channels/i.test(msg);
    return NextResponse.json(
      {
        error: missingTable
          ? 'Project chat is not set up in the database. Run migration 20260527120000_erp_project_channels.sql in Supabase.'
          : msg,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ channel });
}
