/**
 * Verify Supabase JWT from Authorization: Bearer <token> and load ERP profile.
 */
import { createClient } from '@supabase/supabase-js';

let anonAuthSingleton = null;

function getAnonAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!anonAuthSingleton) {
    anonAuthSingleton = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return anonAuthSingleton;
}

/** RLS-aware client for the signed-in user (pass access_token from browser session). */
export function createSupabaseUserClient(accessToken) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const ERP_PROFILE_AUTH_COLUMNS =
  'id,role,full_name,avatar_path,contact_email,member_team,last_active_at,created_at';

export async function getErpUserFromRequest(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { user: null, profile: null, error: 'Supabase not configured' };
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return { user: null, profile: null, error: 'Missing bearer token' };
  }

  const supabaseAuth = getAnonAuthClient();
  if (!supabaseAuth) {
    return { user: null, profile: null, error: 'Supabase not configured' };
  }
  const {
    data: { user },
    error: userErr,
  } = await supabaseAuth.auth.getUser(token);
  if (userErr || !user) {
    return { user: null, profile: null, error: userErr?.message || 'Invalid session' };
  }

  const supabase = createSupabaseUserClient(token);
  const { data: profile, error: pErr } = await supabase
    .from('erp_profiles')
    .select(ERP_PROFILE_AUTH_COLUMNS)
    .eq('id', user.id)
    .single();

  if (pErr && pErr.code !== 'PGRST116') {
    return { user, profile: null, error: pErr.message };
  }

  return { user, profile, error: null };
}
