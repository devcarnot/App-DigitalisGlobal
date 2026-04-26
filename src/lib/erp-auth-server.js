/**
 * Verify Supabase JWT from Authorization: Bearer <token> and load ERP profile.
 */
import { createClient } from '@supabase/supabase-js';

/** RLS-aware client for the signed-in user (pass access_token from browser session). */
export function createSupabaseUserClient(accessToken) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

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

  const supabaseAuth = createClient(url, anonKey);
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
    .select('*')
    .eq('id', user.id)
    .single();

  if (pErr && pErr.code !== 'PGRST116') {
    return { user, profile: null, error: pErr.message };
  }

  return { user, profile, error: null };
}
