import { createClient } from '@supabase/supabase-js';
import { supabaseAuthMemoryLock } from './supabase-auth-memory-lock';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// When env vars are missing (e.g. during build), provide a no-op stub so code that
// accesses supabase.auth does not throw during SSR/SSG.
const noopSupabase = {
  auth: {
    initialize: () => Promise.resolve({ error: null }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: () => Promise.resolve({ data: null, error: { message: 'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local' } }),
    signInWithOAuth: () =>
      Promise.resolve({ data: { url: null, provider: null }, error: { message: 'Supabase is not configured.' } }),
    exchangeCodeForSession: () =>
      Promise.resolve({ data: { session: null }, error: { message: 'Supabase is not configured.' } }),
    signOut: () => Promise.resolve({ error: null }),
  },
  from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }) }), order: () => Promise.resolve({ data: [], error: null }) }) }),
};

const supabaseAuthOptions =
  typeof window !== 'undefined'
    ? {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        lock: supabaseAuthMemoryLock,
        storage: {
          getItem(key) {
            try {
              return window.localStorage.getItem(key);
            } catch {
              return null;
            }
          },
          setItem(key, value) {
            try {
              window.localStorage.setItem(key, value);
            } catch (err) {
              console.warn('[supabase] auth storage write failed', err);
            }
          },
          removeItem(key) {
            try {
              window.localStorage.removeItem(key);
            } catch {
              /* ignore */
            }
          },
        },
      }
    : {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      };

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: supabaseAuthOptions,
    })
  : noopSupabase;
