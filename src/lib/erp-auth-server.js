/**
 * Verify Supabase JWT from Authorization: Bearer <token> and load ERP profile.
 */
import { createClient } from '@supabase/supabase-js';
import {
  ERP_PROFILE_AUTH_SELECT_VARIANTS,
  isErpMissingProfileColumnError,
  selectErpProfileRow,
} from './erp-profile-session-columns';

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
  let profile = null;
  try {
    profile = await selectErpProfileRow(supabase, user.id, ERP_PROFILE_AUTH_SELECT_VARIANTS);
  } catch (e) {
    if (!isErpMissingProfileColumnError(e)) {
      return { user, profile: null, error: e?.message || 'Could not load profile' };
    }
  }

  if (!profile) {
    const { data, error } = await supabase
      .from('erp_profiles')
      .select(ERP_PROFILE_AUTH_SELECT_VARIANTS[ERP_PROFILE_AUTH_SELECT_VARIANTS.length - 1])
      .eq('id', user.id)
      .single();
    profile = data || null;
    if (error && error.code !== 'PGRST116') {
      return { user, profile: null, error: error.message };
    }
  }

  return { user, profile, error: null };
}
