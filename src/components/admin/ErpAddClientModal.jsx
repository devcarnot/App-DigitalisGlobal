'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { isErpAdminEquivalent } from '../../lib/erp-roles';
import { useErpSession } from '../erp/useErpSession';
import ErpNativeSelect, { ERP_FILTER_SELECT_CLASS } from '../erp/ErpNativeSelect';

const inputClass =
  'w-full rounded-xl border border-amber-200/80 bg-white/95 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inner shadow-amber-900/[0.04] transition-all duration-200 focus:border-amber-600/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-amber-500/18';

const labelClass =
  'flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-amber-950/75 mb-2';

/**
 * Invite a client by email (same batch API as Invites → client emails).
 * @param {{ open: boolean, onClose: () => void, onSuccess?: () => void }} props
 */
export default function ErpAddClientModal({ open, onClose, onSuccess }) {
  const { profile } = useErpSession();

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [email, setEmail] = useState('');
  const [sendInvite, setSendInvite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [localMsg, setLocalMsg] = useState('');
  const [localErr, setLocalErr] = useState('');

  const canSendInvites = isErpAdminEquivalent(profile?.role);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLocalErr('');
    setLocalMsg('');
    setEmail('');
    setSendInvite(true);
    (async () => {
      const { data } = await supabase.from('erp_projects').select('id, name').is('deleted_at', null).order('name');
      if (cancelled) return;
      const list = data || [];
      setProjects(list);
      // Optional field — default to no project (workspace-only invite).
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
    const em = email.trim().toLowerCase();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setLocalErr('Enter a valid email address.');
      return;
    }
    if (!canSendInvites) {
      setLocalErr('Only workspace admins and team leads can invite clients.');
      return;
    }
    if (!sendInvite) {
      setLocalErr('Turn on “Send invitation email” to add a client — they join via the invite link.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await erpAuthorizedFetch('/api/erp/invitations/batch', {
        method: 'POST',
        body: JSON.stringify({
          projectId: projectId || null,
          teamMemberEmails: '',
          managerEmails: '',
          clientEmails: em,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLocalErr(data.error || 'Could not send invitation.');
        return;
      }
      setLocalMsg('Invitation email sent. They’ll appear here after they join as a client.');
      setEmail('');
      setSendInvite(true);
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
        aria-labelledby="erp-add-client-title"
        className="relative z-10 w-full max-w-md rounded-2xl border border-amber-200/60 bg-gradient-to-br from-white via-white to-amber-50/40 p-6 shadow-[0_24px_64px_-16px_rgba(146,64,14,0.28)] ring-1 ring-amber-900/[0.07]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="erp-add-client-title" className="text-lg font-bold tracking-tight text-slate-900">
              Add client
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Send an invitation so they join the workspace as a client (optionally on a project).
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
            <label className={labelClass} htmlFor="add-client-email">
              Email
            </label>
            <input
              id="add-client-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="client@company.com"
              autoComplete="email"
              disabled={submitting}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="add-client-project">
              Project (optional)
            </label>
            <ErpNativeSelect
              id="add-client-project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={submitting || projects.length === 0}
              className={ERP_FILTER_SELECT_CLASS}
            >
              {projects.length === 0 ? (
                <option value="">No projects yet</option>
              ) : (
                <>
                  <option value="">Workspace only first</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </>
              )}
            </ErpNativeSelect>
            <p className="mt-1.5 text-[11px] text-slate-500">
              When set, the invite can attach them to this project after they accept.
            </p>
          </div>

          {canSendInvites ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200/70 bg-amber-50/50 px-3 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-300 text-amber-700 focus:ring-amber-400"
                checked={sendInvite}
                onChange={(e) => setSendInvite(e.target.checked)}
                disabled={submitting}
              />
              <span>
                <span className="font-semibold text-slate-800">Send invitation email</span>
                <span className="mt-0.5 block text-xs font-normal text-slate-500">
                  Required to add a new client — they use the link to sign up with the client role.
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
              className="flex-1 min-w-[7rem] rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2.5 text-sm font-bold text-white shadow-md hover:shadow-lg disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Add client'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
