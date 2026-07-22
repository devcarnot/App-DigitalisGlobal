'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supabase } from '../../lib/supabase';
import { usePathname } from 'next/navigation';
import { isDigitalisDesktop } from '../../lib/digitalis-desktop';
import { hasLikelySupabaseAuthInLocalStorage } from '../../lib/supabase-auth-storage-hint';
import {
  withSupabaseAuthLock,
} from '../../lib/supabase-auth-lock';
import { ERP_PROFILE_SESSION_COLUMNS, ERP_PROFILE_SESSION_COLUMN_KEYS } from '../../lib/erp-profile-session-columns';
import { erpRbacCan, erpRbacMergeDefaults } from '../../lib/erp-rbac-modules';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';

const ErpSessionContext = createContext(null);

const SESSION_RECOVERY_DELAYS_MS = [220, 400, 500, 700, 1000, 1500];
const SIGNED_OUT_CONFIRM_MS = 450;

function erpProfilesRowEqual(prev, next) {
  if (prev === next) return true;
  if (prev == null && next == null) return true;
  if (prev == null || next == null) return false;
  for (const key of ERP_PROFILE_SESSION_COLUMN_KEYS) {
    if ((prev[key] ?? null) !== (next[key] ?? null)) return false;
  }
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single session + profile for the whole ERP tree (layout, shell, pages).
 * Avoids duplicate getSession / profile queries from multiple useErpSession() instances.
 */
export function ErpSessionProvider({ children }) {
  const pathname = usePathname();
  const isPublicAuthRoute =
    pathname === '/erp/login' ||
    pathname === '/erp/reset-password' ||
    pathname === '/erp/accept-invite' ||
    pathname === '/erp/auth/callback';

  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  /** Only `true` during first `getSession()` bootstrap. Never toggled on later auth events — that used to blank the ERP UI and wipe modals. */
  const [loading, setLoading] = useState(true);
  /** True while retrying session recovery from storage (prevents premature redirect to /erp/login). */
  const [authRecovering, setAuthRecovering] = useState(false);
  /** Merged grant map from `/api/erp/me/rbac`; null until first successful fetch. */
  const [rbacGrants, setRbacGrants] = useState(null);
  /** When signed in but no erp_profiles row — pending invite link or admin message. */
  const [profileProvision, setProfileProvision] = useState(null);
  /** Run invite→role sync at most once per signed-in user; reset on sign-out. */
  const inviteSyncRanForUserRef = useRef(null);

  /** Race guard: Supabase emits INITIAL_SESSION from storage before some `getSession()` calls resolve null (desktop). */
  const initialAuthSessionRef = useRef(null);
  /** Ignore spurious SIGNED_OUT immediately after a successful sign-in / refresh. */
  const lastSignedInAtRef = useRef(0);

  const loadProfile = useCallback(async (userId, opts = {}) => {
    if (!userId || !supabase?.from) {
      setProfile(null);
      return;
    }
    const skipInviteSync = opts.skipInviteSync === true;
    const { data } = await supabase
      .from('erp_profiles')
      .select(ERP_PROFILE_SESSION_COLUMNS)
      .eq('id', userId)
      .maybeSingle();
    const next = data || null;

    if (!next && opts.tryEnsureProfile !== false) {
      try {
        const res = await erpAuthorizedFetch('/api/erp/me/ensure-profile', {
          method: 'POST',
          body: '{}',
        });
        const j = await res.json().catch(() => ({}));
        if (j.ok && j.created) {
          const { data: createdProf } = await supabase
            .from('erp_profiles')
            .select(ERP_PROFILE_SESSION_COLUMNS)
            .eq('id', userId)
            .maybeSingle();
          if (createdProf) {
            setProfileProvision(null);
            setProfile((prev) => (erpProfilesRowEqual(prev, createdProf) ? prev : createdProf));
            return;
          }
        }
        if (j.reason === 'pending_invitation' && j.acceptUrl) {
          setProfileProvision({ type: 'pending_invite', acceptUrl: j.acceptUrl });
        } else if (j.reason === 'no_invitation') {
          setProfileProvision({
            type: 'no_invitation',
            message: j.message || 'No workspace profile for this email.',
          });
        }
      } catch {
        /* non-fatal */
      }
    } else if (next) {
      setProfileProvision(null);
    }

    setProfile((prev) => (erpProfilesRowEqual(prev, next) ? prev : next));

    // If a DB trigger left profile.role as `client` while the latest accepted
    // invitation was `team_member` / `team_lead`, promote once so the sidebar
    // matches the invite the user actually completed.
    const shouldInviteSync =
      next &&
      !skipInviteSync &&
      inviteSyncRanForUserRef.current !== userId;
    if (shouldInviteSync) {
      inviteSyncRanForUserRef.current = userId;
      try {
        const token =
          opts.accessToken ??
          (await withSupabaseAuthLock(async () => {
            const {
              data: { session: s },
            } = await supabase.auth.getSession();
            return s?.access_token ?? null;
          }));
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
      setAuthRecovering(false);
      return;
    }
    let alive = true;
    const PROFILE_BOOTSTRAP_MS = 20000;
    initialAuthSessionRef.current = null;

    function mergeStoredSession(candidate) {
      if (candidate?.user) return candidate;
      const fromInitial = initialAuthSessionRef.current;
      return fromInitial?.user ? fromInitial : candidate;
    }

    async function readSessionFromClient() {
      const { data } = await supabase.auth.getSession();
      return mergeStoredSession(data?.session ?? null);
    }

    async function recoverSessionFromStorage() {
      const delays =
        isDigitalisDesktop() || hasLikelySupabaseAuthInLocalStorage()
          ? SESSION_RECOVERY_DELAYS_MS
          : SESSION_RECOVERY_DELAYS_MS.slice(0, 3);
      let s = null;
      for (const delayMs of delays) {
        await sleep(delayMs);
        if (!alive) return null;
        s = await readSessionFromClient();
        if (s?.user) return s;
      }
      return mergeStoredSession(s);
    }

    async function confirmSignedOut() {
      if (!hasLikelySupabaseAuthInLocalStorage()) return true;
      await sleep(SIGNED_OUT_CONFIRM_MS);
      if (!alive) return false;
      const recovered = await readSessionFromClient();
      return !recovered?.user;
    }

    async function applyAuthSession(nextSession, opts = {}) {
      if (!alive) return;
      if (nextSession?.user?.id) {
        setSession(nextSession);
        setAuthRecovering(false);
        try {
          await loadProfile(nextSession.user.id, {
            accessToken: nextSession.access_token,
            skipInviteSync: opts.skipInviteSync === true,
          });
        } catch (e) {
          console.error('ERP profile load failed', e);
        }
        return;
      }

      inviteSyncRanForUserRef.current = null;
      setProfile(null);
      setProfileProvision(null);
      setSession(null);
      setAuthRecovering(false);
    }

    async function handleAuthEvent(event, s) {
      if (!alive) return;
      try {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          lastSignedInAtRef.current = Date.now();
        }

        if (event === 'SIGNED_OUT') {
          if (Date.now() - lastSignedInAtRef.current < 8000) {
            const recovered = await readSessionFromClient();
            if (recovered?.user) {
              await applyAuthSession(recovered);
              return;
            }
          }
          const reallySignedOut = await confirmSignedOut();
          if (!alive) return;
          if (!reallySignedOut) {
            const recovered = await readSessionFromClient();
            if (recovered?.user) {
              await applyAuthSession(recovered);
              return;
            }
          }
          await applyAuthSession(null);
          return;
        }

        if (s?.user) {
          await applyAuthSession(s);
        }
      } catch (e) {
        console.error('ERP auth state handler failed', e);
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'INITIAL_SESSION') {
        initialAuthSessionRef.current = s ?? null;
        if (s?.user) {
          setSession((prev) => (prev?.user?.id === s.user.id ? prev : s));
        }
        return;
      }
      // Do not notify login emails here — SIGNED_IN also fires on token refresh / multi-tab sync,
      // which spammed users; login/invite flows call notifyLoginAfterSignIn after password sign-in.
      // Never call setLoading here: ErpLayoutClient replaces the entire tree with a spinner when
      // loading=true, which destroys every modal’s React state (tab return, token refresh, etc.).
      // Defer Supabase auth work to avoid deadlocks when this callback triggers storage reads.
      setTimeout(() => {
        void handleAuthEvent(event, s);
      }, 0);
    });

    (async () => {
      try {
        let s = await readSessionFromClient();
        const storageHint = hasLikelySupabaseAuthInLocalStorage();
        const shouldRecover =
          !isPublicAuthRoute &&
          !s?.user &&
          (storageHint || Boolean(initialAuthSessionRef.current?.user) || isDigitalisDesktop());
        if (shouldRecover) {
          if (alive) setAuthRecovering(true);
          s = await recoverSessionFromStorage();
        }

        if (!alive) return;
        setSession(s);
        if (s?.user?.id) {
          try {
            await Promise.race([
              loadProfile(s.user.id, { accessToken: s.access_token }),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('erp_profile_bootstrap_timeout')), PROFILE_BOOTSTRAP_MS),
              ),
            ]);
          } catch (e) {
            if (e?.message !== 'erp_profile_bootstrap_timeout') {
              console.error('ERP profile bootstrap failed', e);
            }
            /* Still leave the app usable; profile may fill in later (visibility refresh) or show no-profile. */
          }
        } else {
          inviteSyncRanForUserRef.current = null;
          setProfile(null);
        }
      } catch (err) {
        console.error('ERP session load failed', err);
        if (alive) {
          inviteSyncRanForUserRef.current = null;
          setSession(null);
          setProfile(null);
        }
      } finally {
        if (alive) {
          setAuthRecovering(false);
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [loadProfile, isPublicAuthRoute]);

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

  useEffect(() => {
    if (!session?.user?.id || !profile) {
      setRbacGrants(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await erpAuthorizedFetch('/api/erp/me/rbac');
        if (!res.ok) return;
        const j = await res.json().catch(() => ({}));
        if (!cancelled && j.grants && typeof j.grants === 'object') {
          setRbacGrants(j.grants);
        }
      } catch {
        /* merged map falls back to code defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, profile?.id, profile?.role]);

  const refreshProfile = useCallback(() => {
    if (session?.user?.id)
      return loadProfile(session.user.id, { skipInviteSync: true });
    return undefined;
  }, [session?.user?.id, loadProfile]);

  const rbacMerged = useMemo(
    () => rbacGrants ?? erpRbacMergeDefaults(profile?.role, null),
    [rbacGrants, profile?.role],
  );

  const erpCan = useCallback(
    (moduleKey, action = 'view') => erpRbacCan(rbacMerged, moduleKey, action),
    [rbacMerged],
  );

  const refreshRbac = useCallback(async () => {
    if (!session?.user?.id || !profile) return;
    try {
      const res = await erpAuthorizedFetch('/api/erp/me/rbac');
      if (!res.ok) return;
      const j = await res.json().catch(() => ({}));
      if (j.grants && typeof j.grants === 'object') {
        setRbacGrants(j.grants);
      }
    } catch {
      /* ignore */
    }
  }, [session?.user?.id, profile]);

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      authRecovering,
      profileProvision,
      refreshProfile,
      rbacGrants: rbacMerged,
      erpCan,
      refreshRbac,
    }),
    [session, profile, loading, authRecovering, profileProvision, refreshProfile, rbacMerged, erpCan, refreshRbac],
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
