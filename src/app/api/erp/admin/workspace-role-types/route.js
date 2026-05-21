import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import {
  isErpGlobalAdmin,
  isErpWorkspaceRosterEditor,
  ERP_WORKSPACE_ROLE_LABELS,
} from '../../../../../lib/erp-roles';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';

export const runtime = 'nodejs';

const BUILTIN = /** @type {const} */ ([
  'team_member',
  'team_lead',
  'client',
  'client_team_member',
  'admin',
  'hr',
  'bd',
]);

function builtinOptions(viewerIsGlobalAdmin) {
  const opts = BUILTIN.filter((id) => id !== 'admin' || viewerIsGlobalAdmin).map((id) => ({
    id,
    label: ERP_WORKSPACE_ROLE_LABELS[id] || id,
    builtin: true,
  }));
  return opts;
}

/** GET — assignable workspace roles (built-in + custom). Roster editors may read; only needed for dropdowns. */
export async function GET(request) {
  const { profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !isErpWorkspaceRosterEditor(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  const viewerIsGlobalAdmin = isErpGlobalAdmin(profile?.role);
  const base = builtinOptions(viewerIsGlobalAdmin);

  if (!admin) {
    return NextResponse.json({ ok: true, options: base.sort((a, b) => a.label.localeCompare(b.label)) });
  }

  const { data: customRows, error } = await admin.from('erp_workspace_custom_roles').select('role_key, label').order('label');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const custom = (customRows || []).map((r) => ({
    id: r.role_key,
    label: r.label,
    builtin: false,
  }));

  const options = [...base, ...custom].sort((a, b) => a.label.localeCompare(b.label));
  return NextResponse.json({ ok: true, options });
}

/**
 * POST — add a custom role type (Super Admin only). Body: { roleKey, label }
 * Seeds empty RBAC row in `erp_workspace_role_permissions`.
 */
export async function POST(request) {
  const { profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !isErpGlobalAdmin(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rawKey = String(body?.roleKey || body?.role_key || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  const label = String(body?.label || '').trim();
  if (!rawKey || !label) {
    return NextResponse.json({ error: 'roleKey and label are required' }, { status: 400 });
  }
  if (!/^[a-z][a-z0-9_]*$/.test(rawKey) || rawKey.length > 48) {
    return NextResponse.json(
      { error: 'roleKey must be lowercase letters, numbers, underscores; max 48 chars.' },
      { status: 400 },
    );
  }
  if (BUILTIN.includes(rawKey)) {
    return NextResponse.json({ error: 'That key is reserved for a built-in role.' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { error: insErr } = await admin.from('erp_workspace_custom_roles').insert({
    role_key: rawKey,
    label,
  });
  if (insErr) {
    if (insErr.code === '23505') {
      return NextResponse.json({ error: 'A role with that key already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  await admin.from('erp_workspace_role_permissions').upsert(
    {
      role_key: rawKey,
      grants: {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'role_key' },
  );

  return NextResponse.json({ ok: true, roleKey: rawKey, label });
}

/**
 * DELETE — remove a custom role (Super Admin only). Query: ?roleKey=
 * Blocked if any profile still uses this role.
 */
export async function DELETE(request) {
  const { profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !isErpGlobalAdmin(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const roleKey = String(request.nextUrl.searchParams.get('roleKey') || '').trim().toLowerCase();
  if (!roleKey) {
    return NextResponse.json({ error: 'roleKey query required' }, { status: 400 });
  }
  if (BUILTIN.includes(roleKey)) {
    return NextResponse.json({ error: 'Cannot delete built-in roles.' }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const { count, error: cErr } = await admin
    .from('erp_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', roleKey);
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  if (count && count > 0) {
    return NextResponse.json(
      { error: `Reassign or remove ${count} user(s) with this role before deleting it.` },
      { status: 409 },
    );
  }

  const { error: dErr } = await admin.from('erp_workspace_custom_roles').delete().eq('role_key', roleKey);
  if (dErr) {
    return NextResponse.json({ error: dErr.message }, { status: 500 });
  }

  await admin.from('erp_workspace_role_permissions').delete().eq('role_key', roleKey);

  return NextResponse.json({ ok: true, roleKey });
}
