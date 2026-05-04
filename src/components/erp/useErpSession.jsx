'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ERP_PROFILE_SESSION_COLUMNS, ERP_PROFILE_SESSION_COLUMN_KEYS } from '../../lib/erp-profile-session-columns';

const ErpSessionContext = createContext(null);

function erpProfilesRowEqual(prev, next) {
  if (prev === next) return true;
  if (prev == null && next == null) return true;
  if (prev == null || next == null) return false;
  for (const key of ERP_PROFILE_SESSION_COLUMN_KEYS) {
    if ((prev[key] ?? null) !== (next[key] ?? null)) return false;
  }
  return true;
}

/**
 * Single session + profile for the whole ERP tree (layout, shell, pages).
 * Avoids duplicate getSession / profile queries from multiple useErpSession() instances.
 */
export function ErpSessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  /** Only `true` during first `getSession()` bootstrap. Never toggled on later auth events — that used to blank the ERP UI and wipe modals. */
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId) => {
    if (!userId || !supabase?.from) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from('erp_profiles')
      .select(ERP_PROFILE_SESSION_COLUMNS)
      .eq('id', userId)
      .maybeSingle();
    const next = data || null;
    setProfile((prev) => (erpProfilesRowEqual(prev, next) ? prev : next));

    // If a DB trigger left profile.role as `client` while the latest accepted
    // invitation was `team_member` / `team_lead`, promote once so the sidebar
    // matches the invite the user actually completed.
    if (next) {
      try {
        const {
          data: { session: s },
        } = await supabase.auth.getSession();
        const token = s?.access_token;
        if (!token) return;
        const res = await fetch('/api/erp/me/sync-invite-role', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const j = await res.json().catch(() => ({}));
        if (j.updated) {
          const { data: data2 } = await supabase
            .from('erp_profiles')
            .select(ERP_PROFILE_SESSION_COLUMNS)
            .eq('id', userId)
            .maybeSingle();
          const next2 = data2 || null;
          setProfile((prev) => (erpProfilesRowEqual(prev, next2) ? prev : next2));
        }
      } catch {
        /* non-fatal */
      }
    }
  }, []);

  useEffect(() => {
    if (!supabase?.auth) {
      setLoading(false);
      return;
    }
    let alive = true;
    supabase.auth
      .getSession()
      .then(async ({ data: { session: s } }) => {
        if (!alive) return;
        setSession(s);
        if (s?.user?.id) {
          await loadProfile(s.user.id);
        } else {
          setProfile(null);
        }
        if (alive) setLoading(false);
      })
      .catch((err) => {
        console.error('ERP session load failed', err);
        if (alive) {
          setSession(null);
          setProfile(null);
          setLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'INITIAL_SESSION') {
        return;
      }
      // Do not notify login emails here — SIGNED_IN also fires on token refresh / multi-tab sync,
      // which spammed users; login/invite flows call notifyLoginAfterSignIn after password sign-in.
      // Never call setLoading here: ErpLayoutClient replaces the entire tree with a spinner when
      // loading=true, which destroys every modal’s React state (tab return, token refresh, etc.).
      void (async () => {
        try {
          setSession(s);
          if (s?.user?.id) {
            await loadProfile(s.user.id);
          } else {
            setProfile(null);
          }
        } catch (e) {
          console.error('ERP auth state handler failed', e);
        }
      })();
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  useEffect(() => {
    if (!session?.user?.id || !supabase?.from) return;
    const uid = session.user.id;
    const ping = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      supabase
        .from('erp_profiles')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', uid)
        .then(() => {});
    };
    ping();
    const t = setInterval(ping, 90000);
    return () => clearInterval(t);
  }, [session?.user?.id]);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    const reload = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadProfile(uid);
      }
    };
    document.addEventListener('visibilitychange', reload);
    return () => document.removeEventListener('visibilitychange', reload);
  }, [session?.user?.id, loadProfile]);

  const refreshProfile = useCallback(() => {
    if (session?.user?.id) return loadProfile(session.user.id);
    return undefined;
  }, [session?.user?.id, loadProfile]);

  const value = useMemo(
    () => ({ session, profile, loading, refreshProfile }),
    [session, profile, loading, refreshProfile],
  );

  return <ErpSessionContext.Provider value={value}>{children}</ErpSessionContext.Provider>;
}

export function useErpSession() {
  const ctx = useContext(ErpSessionContext);
  if (!ctx) {
    throw new Error('useErpSession must be used within ErpSessionProvider');
  }
  return ctx;
}
