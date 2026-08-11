'use client';

import { useCallback, useEffect, useState } from 'react';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { isErpManagerRole } from '../../lib/erp-roles';
import { useErpSession } from './useErpSession';
import { supabase } from '../../lib/supabase';
import ErpCreatableSelect from './ErpCreatableSelect';
import { ERP_DARK_SECTION_MAIN_PANEL } from '../../lib/erp-dark-surfaces';
import {
  beginErpCachedLoad,
  ensureErpCacheArray,
  erpCacheInitialLoading,
  hasErpDataCache,
  pickErpCacheArray,
  writeErpDataCache,
} from '../../lib/erp-data-cache';

/**
 * Assign Developer / Graphic designer / Marketing per workspace member or team lead (sidebar designation).
 * Used on Members, Invites, and Users admin pages.
 * @param {{ className?: string, variant?: 'card' | 'embedded' }} props
 */
export default function ErpFunctionalTeamSection({ className = '', variant = 'card' }) {
  const { profile } = useErpSession();
  const CACHE_KEY = 'admin:functional-team';
  const [users, setUsers] = useState(() => pickErpCacheArray(CACHE_KEY, 'users', []));
  const [loading, setLoading] = useState(() => erpCacheInitialLoading(CACHE_KEY));
  const [savingId, setSavingId] = useState(null);
  const [teamErr, setTeamErr] = useState('');
  const [teamOptions, setTeamOptions] = useState([
    { id: 'developer', label: 'Developer' },
    { id: 'graphic_designer', label: 'Graphic designer' },
    { id: 'marketing', label: 'Marketing team' },
  ]);

  const canEdit = isErpManagerRole(profile?.role);

  const load = useCallback(() => {
    beginErpCachedLoad(CACHE_KEY, (cached) => {
      setUsers(ensureErpCacheArray(cached?.users));
    }, setLoading);
    setTeamErr('');
    return erpAuthorizedFetch('/api/erp/dm/directory?workspaceRoster=1')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not load team');
        const nextUsers = Array.isArray(data.users) ? data.users : [];
        writeErpDataCache(CACHE_KEY, { users: nextUsers });
        setUsers(nextUsers);
      })
      .catch((e) => {
        setTeamErr(e?.message || 'Could not load team');
        if (!hasErpDataCache(CACHE_KEY)) setUsers([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Load dynamic designation options (fallback to defaults if table isn't deployed yet).
    let cancelled = false;
    supabase
      .from('erp_member_team_options')
      .select('id, label')
      .order('label', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !Array.isArray(data) || data.length === 0) return;
        const mapped = data
          .filter((r) => r?.id && r?.label)
          .map((r) => ({ id: String(r.id), label: String(r.label) }));
        if (mapped.length) setTeamOptions(mapped);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function onTeamChange(userId, value) {
    const memberTeam = value === '' ? null : value;
    setTeamErr('');
    setSavingId(userId);
    try {
      const res = await erpAuthorizedFetch('/api/erp/admin/member-team', {
        method: 'PATCH',
        body: JSON.stringify({ userId, memberTeam }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save');
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, member_team: memberTeam } : u)));
    } catch (e) {
      setTeamErr(e?.message || 'Could not save team');
    } finally {
      setSavingId(null);
    }
  }

  const assignable = ensureErpCacheArray(users).filter((u) => u.role === 'team_member' || u.role === 'team_lead');

  if (!canEdit) {
    return null;
  }

  const shellClass =
    variant === 'embedded'
      ? `mt-4 border-t border-cyan-100/80 pt-4 dark:border-teal-900/35 ${className}`.trim()
      : `overflow-hidden rounded-2xl border border-cyan-200/50 bg-white/90 p-3 shadow-sm ring-1 ring-cyan-900/[0.04] sm:p-4 dark:border-teal-800/45 ${ERP_DARK_SECTION_MAIN_PANEL} ${className}`.trim();

  return (
    <section className={shellClass}>
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#103D4D]/85 dark:text-teal-200/90">Functional team</h2>
      <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
        Assign each workspace member to Developers, Graphic designers, or Marketing. This appears under their name in the sidebar.
      </p>
      {teamErr ? <p className="mt-2 text-[11px] font-medium text-rose-700">{teamErr}</p> : null}
      {loading && users.length === 0 ? (
        <div className="mt-4 flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
        </div>
      ) : assignable.length === 0 ? (
        <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-500">No members or team leads to assign yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {assignable.map((u) => {
            const name = u.full_name?.trim() || u.email?.split('@')[0] || 'Member';
            const val = u.member_team || '';
            return (
              <li
                key={u.id}
                className="flex flex-col gap-1.5 rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2.5 dark:border-teal-800/45 dark:bg-[#121f28]/95 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-slate-900 dark:text-slate-100">{name}</p>
                  <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{u.email?.trim() || 'n/a'}</p>
                </div>
                <label className="flex shrink-0 items-center gap-2 sm:min-w-[14rem]">
                  <span className="sr-only">Team</span>
                  <ErpCreatableSelect
                    valueId={val}
                    options={[{ id: '', label: 'Not set' }, ...teamOptions]}
                    disabled={savingId === u.id}
                    onChange={(next) => onTeamChange(u.id, next)}
                    placeholder="Not set"
                    canCreate={Boolean(profile && ['admin', 'team_lead'].includes(profile.role))}
                    createLabel="+ Add designation"
                    onCreate={async ({ id, label }) => {
                      const { error: insErr } = await supabase.from('erp_member_team_options').insert({ id, label });
                      if (insErr) throw new Error(insErr.message);
                      setTeamOptions((prev) => [...prev, { id, label }].sort((a, b) => a.label.localeCompare(b.label)));
                    }}
                    className="w-full"
                  />
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
