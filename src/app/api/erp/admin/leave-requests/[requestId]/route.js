import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../../lib/erp-auth-server';
import { createSupabaseAdmin } from '../../../../../../lib/supabase-admin';
import { isValidErpProjectId } from '../../../../../../lib/erp-project-id';

const ALLOWED_STATUS = new Set(['pending', 'approved', 'rejected', 'cancelled']);

/**
 * Super Admin only: set leave request status regardless of current status
 * (e.g. correct a mistaken reject). Bypasses RLS via service role.
 */
export async function PATCH(request, { params }) {
  const { user, profile, error } = await getErpUserFromRequest(request);
  if (!user || error) return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Only Super Admins can override leave status.' }, { status: 403 });
  }

  const requestId = typeof params?.requestId === 'string' ? params.requestId : null;
  if (!requestId || !isValidErpProjectId(requestId)) {
    return NextResponse.json({ error: 'Invalid request id' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const status = typeof body?.status === 'string' ? body.status : null;
  if (!status || !ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const patch = {
    status,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  };
  if (body && Object.prototype.hasOwnProperty.call(body, 'reviewer_note')) {
    patch.reviewer_note =
      typeof body.reviewer_note === 'string' && body.reviewer_note.trim() ? body.reviewer_note.trim() : null;
  }

  const { data: row, error: upErr } = await admin
    .from('erp_leave_requests')
    .update(patch)
    .eq('id', requestId)
    .select(
      'id, user_id, leave_type, start_date, end_date, day_count, status, reason, attachment_path, created_at, reviewed_at, reviewer_note, reviewed_by',
    )
    .maybeSingle();

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  if (!row) return NextResponse.json({ error: 'Leave request not found' }, { status: 404 });

  return NextResponse.json({ ok: true, request: row });
}
