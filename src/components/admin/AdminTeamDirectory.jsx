'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import ErpUserAvatar from '../erp/ErpUserAvatar';
import ErpConfirmDialog from '../erp/ErpConfirmDialog';
import { erpAuthorizedFetch, fetchErpWorkspaceRoleTypeOptions, resolveDefaultWorkspaceRoleInviteId } from '../../lib/erp-client-api';

const inputClass =
  'w-full rounded-xl border border-slate-200/90 bg-slate-50/40 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inner shadow-slate-900/[0.02] transition-all duration-200 focus:border-sky-400/70 focus:bg-white focus:outline-none focus:ring-4 focus:ring-sky-500/12 dark:border-teal-800/55 dark:bg-[#0c141a] dark:text-slate-100 dark:placeholder:text-slate-500 dark:shadow-black/30 dark:focus:border-teal-500/45 dark:focus:bg-[#101a22] dark:focus:ring-teal-500/20';

const labelClass =
  'flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 mb-2 dark:text-teal-200/75';

function filterEntries(entries, query) {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((row) => {
    const name = (row.fullName || '').toLowerCase();
    const em = (row.email || '').toLowerCase();
    return name.includes(q) || em.includes(q);
  });
}

/**
 * @param {{
 *   mergedEntries: { email: string, fullName: string, role: string }[],
 *   teamPresetSelected: Record<string, boolean>,
 *   onTogglePreset: (email: string) => void,
 *   onSelectAllShown: (emails: string[]) => void,
 *   onClearPresets: () => void,
 *   canSendInvites: boolean,
 *   projectId: string,
 *   onAddMember: (p: { fullName: string, email: string, sendInvite: boolean, workspaceRole?: string }) => Promise<{ error?: string, message?: string }>,
 *   embedded?: boolean,
 * }} props
 */
export default function AdminTeamDirectory({
  mergedEntries,
  teamPresetSelected,
  onTogglePreset,
  onSelectAllShown,
  onClearPresets,
  canSendInvites,
  projectId,
  onAddMember,
  embedded = false,
}) {
  const [search, setSearch] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [sendInvite, setSendInvite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localMsg, setLocalMsg] = useState('');
  const [localErr, setLocalErr] = useState('');
  const [workspaceRoleOptions, setWorkspaceRoleOptions] = useState([]);
  const [addWorkspaceRole, setAddWorkspaceRole] = useState('team_member');
  const [confirmNoProjectInviteOpen, setConfirmNoProjectInviteOpen] = useState(false);
  /** email (lower) -> { avatar_path, full_name, role } from /api/erp/admin/users */
  const [avatarByEmail, setAvatarByEmail] = useState({});

  useEffect(() => {
    let cancelled = false;
    fetchErpWorkspaceRoleTypeOptions().then(({ ok, options }) => {
      if (cancelled || !ok || !Array.isArray(options) || options.length === 0) return;
      setWorkspaceRoleOptions(options);
      setAddWorkspaceRole((prev) => resolveDefaultWorkspaceRoleInviteId(options, prev));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await erpAuthorizedFetch('/api/erp/admin/users');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const m = {};
        for (const u of data.users || []) {
          const e = (u.email || '').trim().toLowerCase();
          if (!e) continue;
          m[e] = {
            avatar_path: u.avatar_path ?? null,
            full_name: u.full_name,
            role: u.role,
          };
        }
        if (!cancelled) setAvatarByEmail(m);
      } catch {
        /* not authorized or offline */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => filterEntries(mergedEntries, search), [mergedEntries, search]);

  const { leads, others } = useMemo(() => {
    const l = filtered.filter((r) => r.role === 'team_lead');
    const o = filtered.filter((r) => r.role !== 'team_lead');
    const byName = (a, b) =>
      (a.fullName || a.email).localeCompare(b.fullName || b.email, undefined, { sensitivity: 'base' });
    l.sort(byName);
    o.sort(byName);
    return { leads: l, others: o };
  }, [filtered]);

  function parseAddMemberFields() {
    const name = fullName.trim();
    const em = email.trim().toLowerCase();
    if (!name) return { ok: false, error: 'Enter a name.' };
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      return { ok: false, error: 'Enter a valid Gmail / email address.' };
    }
    return { ok: true, name, em };
  }

  async function submitAddMember() {
    const parsed = parseAddMemberFields();
    if (!parsed.ok) {
      setLocalErr(parsed.error);
      return;
    }
    setSubmitting(true);
    try {
      const result = await onAddMember({
        fullName: parsed.name,
        email: parsed.em,
        sendInvite: sendInvite && canSendInvites,
        workspaceRole: addWorkspaceRole,
      });
      if (result.error) {
        setLocalErr(result.error);
        return;
      }
      setLocalMsg(result.message || 'Saved.');
      setFullName('');
      setEmail('');
      setSendInvite(false);
      setAddWorkspaceRole((prev) =>
        workspaceRoleOptions.length
          ? resolveDefaultWorkspaceRoleInviteId(workspaceRoleOptions, prev)
          : prev,
      );
    } finally {
      setSubmitting(false);
    }
  }

  function runAddMember() {
    setLocalErr('');
    setLocalMsg('');
    const parsed = parseAddMemberFields();
    if (!parsed.ok) {
      setLocalErr(parsed.error);
      return;
    }
    if (sendInvite && canSendInvites && !projectId) {
      setConfirmNoProjectInviteOpen(true);
      return;
    }
    void submitAddMember();
  }

  function row(entry) {
    const label = entry.fullName || entry.email;
    const sub = entry.fullName ? entry.email : '';
    const em = entry.email.trim().toLowerCase();
    const av = avatarByEmail[em];
    const profileForAvatar = av
      ? { full_name: av.full_name || entry.fullName, role: av.role, avatar_path: av.avatar_path }
      : { full_name: entry.fullName, role: entry.role, avatar_path: null };
    return (
      <li key={entry.email}>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-2 py-2 transition-colors hover:border-slate-200 hover:bg-white dark:hover:border-teal-800/45 dark:hover:bg-teal-950/30">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500 dark:border-teal-700 dark:bg-[#0c141a] dark:focus:ring-teal-500/40"
            checked={!!teamPresetSelected[entry.email]}
            onChange={() => onTogglePreset(entry.email)}
          />
          <ErpUserAvatar
            profile={profileForAvatar}
            email={entry.email}
            size="md"
            className="!h-10 !w-10 !text-sm ring-1 ring-slate-200/80 dark:ring-teal-800/55"
            imgClassName="ring-1 ring-slate-200/80 dark:ring-teal-800/55"
            alt={label || ''}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</span>
            {sub ? <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{sub}</span> : null}
          </span>
        </label>
      </li>
    );
  }

  const noProjectInviteDialog = (
    <ErpConfirmDialog
      open={confirmNoProjectInviteOpen}
      title="Send workspace-only invite?"
      confirmLabel="Continue"
      tone="teal"
      busy={submitting}
      onCancel={() => setConfirmNoProjectInviteOpen(false)}
      onConfirm={() => {
        setConfirmNoProjectInviteOpen(false);
        void submitAddMember();
      }}
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">
        No project is selected below. Invites will be sent as workspace-only (no project).
      </p>
    </ErpConfirmDialog>
  );

  const body = (
      <div className={`flex flex-col gap-6 ${embedded ? '' : 'p-5 sm:p-6'}`}>
        <div className="min-w-0 w-full space-y-4">
          <div>
            <label className={labelClass} htmlFor="team-dir-search">
              Search
            </label>
            <input
              id="team-dir-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={inputClass}
              placeholder="Name or email"
              autoComplete="off"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectAllShown(filtered.map((e) => e.email))}
              className="rounded-lg border border-sky-200/80 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-sky-800 shadow-sm hover:bg-sky-50 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-teal-200 dark:hover:bg-[#1a2836]"
            >
              Select all shown
            </button>
            <button
              type="button"
              onClick={onClearPresets}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-300 dark:hover:bg-[#1a2836]"
            >
              Clear selection
            </button>
          </div>

          <div className="max-h-[min(420px,55vh)] overflow-y-auto pr-1 [scrollbar-width:thin]">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:items-start md:gap-4 lg:gap-5">
              <div className="min-w-0">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">Team leads</p>
                <ul className="space-y-0.5 rounded-xl border border-violet-100/80 bg-violet-50/20 p-2 dark:border-violet-900/40 dark:bg-violet-950/25">
                  {leads.length === 0 ? (
                    <li className="px-2 py-6 text-center text-xs text-slate-400 dark:text-slate-500">No matches</li>
                  ) : (
                    leads.map(row)
                  )}
                </ul>
              </div>
              <div className="min-w-0">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">Other roles</p>
                <ul className="space-y-0.5 rounded-xl border border-sky-100/80 bg-sky-50/15 p-2 dark:border-teal-900/40 dark:bg-teal-950/20">
                  {others.length === 0 ? (
                    <li className="px-2 py-6 text-center text-xs text-slate-400 dark:text-slate-500">No matches</li>
                  ) : (
                    others.map(row)
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 w-full rounded-2xl border border-slate-200/80 bg-slate-50/40 p-4 sm:p-5 dark:border-teal-800/45 dark:bg-[#0a1218]/90">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Add person to this list</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Saves with the workspace role you pick below — they appear in the directory under Team leads or Other roles by
            how they&apos;re categorized.
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <label className={labelClass} htmlFor="new-member-name">
                Full name
              </label>
              <input
                id="new-member-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
                placeholder="e.g. Jane Doe"
                autoComplete="name"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="new-member-email">
                Email
              </label>
              <input
                id="new-member-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="name@gmail.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="new-member-role">
                Workspace role
              </label>
              <select
                id="new-member-role"
                value={addWorkspaceRole}
                onChange={(e) => setAddWorkspaceRole(e.target.value)}
                className={`${inputClass} cursor-pointer !pr-9`}
              >
                {workspaceRoleOptions.length === 0 ? (
                  <option value="team_member">Team member</option>
                ) : (
                  workspaceRoleOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))
                )}
              </select>
            </div>
            {canSendInvites && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 dark:border-teal-700 dark:bg-[#0c141a]"
                  checked={sendInvite}
                  onChange={(e) => setSendInvite(e.target.checked)}
                />
                Also send invitation email (uses project selected below, if any)
              </label>
            )}
            {!canSendInvites && (
              <p className="text-xs text-slate-500 dark:text-slate-400">Only workspace admins and team leads can send invitation emails from here.</p>
            )}
            {(localErr || localMsg) && (
              <p className={`text-sm ${localErr ? 'text-red-700 dark:text-red-400' : 'text-emerald-800 dark:text-emerald-300'}`}>{localErr || localMsg}</p>
            )}
            <button
              type="button"
              disabled={submitting}
              onClick={() => void runAddMember()}
              className="w-full rounded-xl erp-brand-fill px-5 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/25 transition-all hover:shadow-xl disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Add to directory'}
            </button>
          </div>
        </div>
      </div>
  );

  if (embedded) {
    return (
      <>
        {body}
        {noProjectInviteDialog}
      </>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_32px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/[0.04] dark:border-teal-800/45 dark:bg-[#0e1824] dark:shadow-[0_16px_48px_-20px_rgba(0,0,0,0.5)] dark:ring-teal-900/25"
    >
      <div className="border-b border-slate-100/90 bg-gradient-to-br from-sky-50/50 via-white to-indigo-50/30 px-5 py-5 sm:px-6 dark:border-teal-900/45 dark:from-[#0c1824] dark:via-[#0a1520] dark:to-[#081018]">
        <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">Team directory</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Search by name or email (like Gmail). Check people for bulk invites below, or add someone new — they are saved for next time.
        </p>
      </div>
      {body}
      {noProjectInviteDialog}
    </motion.div>
  );
}
