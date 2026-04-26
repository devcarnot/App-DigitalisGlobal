'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { isErpAdminEquivalent } from '../../lib/erp-roles';
import { parseEmailLines } from '../../lib/erp-team-directory';
import { useErpSession } from '../erp/useErpSession';
import ErpNativeSelect, { ERP_FILTER_SELECT_CLASS } from '../erp/ErpNativeSelect';

const inputClass =
  'w-full rounded-xl border border-cyan-200/70 bg-white/95 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inner shadow-cyan-900/[0.04] transition-all duration-200 focus:border-[#103D4D]/45 focus:bg-white focus:outline-none focus:ring-4 focus:ring-cyan-400/20';

const labelClass =
  'flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-teal-900/75 mb-2';

/**
 * Add someone to the team directory with optional invitation email (same behavior as Invites → directory form).
 * @param {{ open: boolean, onClose: () => void, onSuccess?: () => void }} props
 */
export default function ErpAddMemberModal({ open, onClose, onSuccess }) {
  const { session, profile } = useErpSession();
  const userId = session?.user?.id;

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('team_member');
  const [sendInvite, setSendInvite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localMsg, setLocalMsg] = useState('');
  const [localErr, setLocalErr] = useState('');

  const canSendInvites = isErpAdminEquivalent(profile?.role);

  const persistTeamEmailsToDirectory = useCallback(
    async (payloadString) => {
      const emails = parseEmailLines(payloadString).filter((e) => e.includes('@'));
      if (emails.length === 0 || !userId || !supabase) return;
      for (const em of emails) {
        const { error } = await supabase.from('erp_team_directory_emails').insert({ email: em, created_by: userId });
        if (error && error.code !== '23505' && !String(error.message || '').toLowerCase().includes('does not exist')) {
          console.warn('erp_team_directory_emails', error);
        }
      }
    },
    [userId],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLocalErr('');
    setLocalMsg('');
    setFullName('');
    setEmail('');
    setInviteRole('team_member');
    setSendInvite(false);
    (async () => {
      const { data } = await supabase.from('erp_projects').select('id, name').is('deleted_at', null).order('name');
      if (cancelled) return;
      const list = data || [];
      setProjects(list);
      setProjectId('');
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLocalErr('');
    setLocalMsg('');
    const name = fullName.trim();
    const em = email.trim().toLowerCase();
    if (!name) {
      setLocalErr('Enter a name.');
      return;
    }
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setLocalErr('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      const directoryRole = inviteRole === 'team_lead' ? 'team_lead' : 'team_member';
      const { error: upErr } = await supabase.from('erp_team_directory_emails').upsert(
        {
          email: em,
          full_name: name,
          directory_role: directoryRole,
          created_by: userId,
        },
        { onConflict: 'email' },
      );

      if (upErr) {
        const msg = String(upErr.message || '');
        if (msg.toLowerCase().includes('column') && msg.toLowerCase().includes('full_name')) {
          setLocalErr(
            'Database migration missing: run migration 016_erp_team_directory_names_roles.sql (full_name and directory_role).',
          );
          return;
        }
        setLocalErr(upErr.message || 'Could not save directory entry.');
        return;
      }

      if (sendInvite && canSendInvites) {
        const body =
          inviteRole === 'team_lead'
            ? { projectId: projectId || null, teamMemberEmails: '', managerEmails: em, clientEmails: '' }
            : { projectId: projectId || null, teamMemberEmails: em, managerEmails: '', clientEmails: '' };
        const res = await erpAuthorizedFetch('/api/erp/invitations/batch', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setLocalErr(data.error || 'Could not send invitation.');
          return;
        }
        await persistTeamEmailsToDirectory(em);
        setLocalMsg('Saved to directory and invitation email sent.');
      } else {
        setLocalMsg(sendInvite && !canSendInvites ? 'Saved to directory. (Only admins and leads can send invite emails.)' : 'Saved to directory.');
      }

      setFullName('');
      setEmail('');
      setSendInvite(false);
      onSuccess?.();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="erp-add-member-title"
        className="relative z-10 w-full max-w-md rounded-2xl border border-cyan-200/50 bg-gradient-to-br from-white via-white to-cyan-50/30 p-6 shadow-[0_24px_64px_-16px_rgba(16,61,77,0.35)] ring-1 ring-cyan-900/[0.06]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="erp-add-member-title" className="text-lg font-bold tracking-tight text-slate-900">
              Add member
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Save to the team directory and optionally send an invitation email.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
          <div>
            <label className={labelClass} htmlFor="add-member-full-name">
              Full name
            </label>
            <input
              id="add-member-full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
              placeholder="e.g. Jane Doe"
              autoComplete="name"
              disabled={submitting}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="add-member-email">
              Email
            </label>
            <input
              id="add-member-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="name@company.com"
              autoComplete="email"
              disabled={submitting}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="add-member-role">
              Workspace role
            </label>
            <ErpNativeSelect
              id="add-member-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              disabled={submitting}
              className={ERP_FILTER_SELECT_CLASS}
            >
              <option value="team_member">Team member</option>
              <option value="team_lead">Team lead</option>
            </ErpNativeSelect>
          </div>

          <div>
            <label className={labelClass} htmlFor="add-member-project">
              Project for invitation (optional)
            </label>
            <ErpNativeSelect
              id="add-member-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={submitting || projects.length === 0}
              className={ERP_FILTER_SELECT_CLASS}
            >
              {projects.length === 0 ? (
                <option value="">No projects yet</option>
              ) : (
                <>
                  <option value="">Workspace only — no project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </>
              )}
            </ErpNativeSelect>
            <p className="mt-1.5 text-[11px] text-slate-500">
              When sending an invite, they can be attached to this project after they accept (same as the Invites page).
            </p>
          </div>

          {canSendInvites ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#103D4D] focus:ring-cyan-400"
                checked={sendInvite}
                onChange={(e) => setSendInvite(e.target.checked)}
                disabled={submitting}
              />
              <span>
                <span className="font-semibold text-slate-800">Send invitation email</span>
                <span className="mt-0.5 block text-xs font-normal text-slate-500">
                  They receive a link to join the workspace with the role above. Uses the project selected above when set.
                </span>
              </span>
            </label>
          ) : (
            <p className="text-xs text-slate-500">Only workspace admins and team leads can send invitation emails.</p>
          )}

          {(localErr || localMsg) && (
            <p className={`text-sm ${localErr ? 'text-red-700' : 'text-emerald-800'}`}>{localErr || localMsg}</p>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 min-w-[7rem] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 min-w-[7rem] rounded-xl bg-gradient-to-r from-[#103D4D] to-teal-700 px-4 py-2.5 text-sm font-bold text-white shadow-md hover:shadow-lg disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Add member'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
