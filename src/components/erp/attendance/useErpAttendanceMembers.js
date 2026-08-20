'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { isErpGlobalAdmin, erpTeamLeadManagedTeamIds } from '../../../lib/erp-roles';
import {
  beginErpCachedLoad,
  erpCacheInitialLoading,
  hasErpDataCache,
  writeErpDataCache,
} from '../../../lib/erp-data-cache';

const INTERNAL_ROLES = ['admin', 'team_lead', 'team_member'];

/**
 * Load attendance scope members.
 * @param {{ uid?: string, profile?: { role?: string } | null, scope?: 'all'|'team', cacheKey?: string | null }} options
 */
export function useErpAttendanceMembers({ uid, profile, scope = 'team', cacheKey = null }) {
  const CACHE_KEY = cacheKey || (uid ? `attendance:members:${scope}:${uid}` : null);
  const [members, setMembers] = useState(() => []);
  const [loading, setLoading] = useState(() => erpCacheInitialLoading(CACHE_KEY));

  const loadMembers = useCallback(async () => {
    if (!uid || !profile) {
      setMembers([]);
      setLoading(false);
      return;
    }
    beginErpCachedLoad(CACHE_KEY, (cached) => {
      setMembers(Array.isArray(cached?.members) ? cached.members : []);
    }, setLoading);
    try {
      let profileRows = [];
      const loadAll = scope === 'all' && isErpGlobalAdmin(profile.role);
      if (loadAll) {
        const { data, error: pErr } = await supabase
          .from('erp_profiles')
          .select('id, full_name, role, avatar_path, member_team')
          .in('role', INTERNAL_ROLES)
          .order('full_name', { ascending: true });
        if (pErr) throw new Error(pErr.message);
        profileRows = data || [];
      } else {
        const managedTeams = erpTeamLeadManagedTeamIds(profile);
        if (profile.role === 'team_lead' && managedTeams.length > 0) {
          const { data, error: pErr } = await supabase
            .from('erp_profiles')
            .select('id, full_name, role, avatar_path, member_team, last_active_at')
            .eq('role', 'team_member')
            .in('member_team', managedTeams)
            .order('full_name', { ascending: true });
          if (pErr) throw new Error(pErr.message);
          profileRows = data || [];
        } else {
        const { data: myM, error: mErr } = await supabase
          .from('erp_project_members')
          .select('project_id')
          .eq('user_id', uid);
        if (mErr) throw new Error(mErr.message);
        const pids = [...new Set((myM || []).map((r) => r.project_id).filter(Boolean))];
        if (pids.length === 0) {
          setMembers([]);
          setLoading(false);
          return;
        }
        const { data: peers, error: p2Err } = await supabase
          .from('erp_project_members')
          .select('user_id')
          .in('project_id', pids);
        if (p2Err) throw new Error(p2Err.message);
        const uids = [...new Set((peers || []).map((r) => r.user_id).filter(Boolean))];
        if (uids.length === 0) {
          setMembers([]);
          setLoading(false);
          return;
        }
        const { data, error: pErr } = await supabase
          .from('erp_profiles')
          .select('id, full_name, role, avatar_path, member_team')
          .in('id', uids)
          .in('role', INTERNAL_ROLES)
          .order('full_name', { ascending: true });
        if (pErr) throw new Error(pErr.message);
        profileRows = data || [];
        }
      }
      writeErpDataCache(CACHE_KEY, { members: profileRows });
      setMembers(profileRows);
    } catch {
      if (!hasErpDataCache(CACHE_KEY)) setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [CACHE_KEY, uid, profile, scope]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  return { members, loading, reloadMembers: loadMembers };
}
