/**
 * Server-only Supabase client with service role (bypasses RLS).
 * Never import in client components.
 */
import { createClient } from '@supabase/supabase-js';

let adminSingleton = null;

export function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return null;
  }
  if (!adminSingleton) {
    adminSingleton = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminSingleton;
}
