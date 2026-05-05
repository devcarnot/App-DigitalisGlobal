'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { isErpAdminEquivalent } from '../../lib/erp-roles';
import { useErpSession } from '../erp/useErpSession';
import ErpNativeSelect, { ERP_FILTER_SELECT_CLASS } from '../erp/ErpNativeSelect';
import ErpCreatableSelect from '../erp/ErpCreatableSelect';
import { erpModalPanelMaxWidthClass } from '../erp/ErpModalFormPrimitives';

const inputClass =
  'w-full rounded-xl border border-amber-200/80 bg-white/95 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inner shadow-amber-900/[0.04] transition-all duration-200 focus:border-amber-600/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-amber-500/18 dark:border-amber-900/45 dark:bg-[#181a17] dark:text-slate-100 dark:placeholder:text-slate-500 dark:shadow-none dark:focus:border-amber-500/55 dark:focus:bg-[#181a17] dark:focus:ring-amber-500/[0.18]';

const labelClass =
  'flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-amber-950/75 mb-2 dark:text-amber-200/85';

const DEFAULT_PLATFORMS = [
  { id: 'direct', label: 'Direct' },
  { id: 'upwork', label: 'Upwork' },
  { id: 'airtasker', label: 'Airtasker' },
  { id: 'fiverr', label: 'Fiverr' },
  { id: 'referral', label: 'Referral' },
];

/**
 * Add workspace client (invite) or pipeline lead (CRM card).
 * @param {{ open: boolean, onClose: () => void, onSuccess?: () => void, defaultTab?: 'invite'|'lead' }} props
 */
export default function ErpAddClientModal({ open, onClose, onSuccess, defaultTab = 'invite' }) {
  const { profile } = useErpSession();

  const [modalTab, setModalTab] = useState(defaultTab === 'lead' ? 'lead' : 'invite');

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [email, setEmail] = useState('');
  const [sendInvite, setSendInvite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [localMsg, setLocalMsg] = useState('');
  const [localErr, setLocalErr] = useState('');

  const [platformOptions, setPlatformOptions] = useState(DEFAULT_PLATFORMS);
  const [leadCompany, setLeadCompany] = useState('');
  const [leadContact, setLeadContact] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadPlatformId, setLeadPlatformId] = useState('direct');

  const canSendInvites = isErpAdminEquivalent(profile?.role);
  const canAddPlatformOption = Boolean(profile && ['admin', 'team_lead'].includes(profile.role));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLocalErr('');
    setLocalMsg('');
    setModalTab(defaultTab === 'lead' ? 'lead' : 'invite');
    setEmail('');
    setSendInvite(true);
    setLeadCompany('');
    setLeadContact('');
    setLeadEmail('');
    setLeadPlatformId('direct');
    setPlatformOptions(DEFAULT_PLATFORMS);

    supabase
      .from('erp_client_platform_options')
      .select('id, label, sort_order')
      .order('sort_order', { ascending: true })
      .then(({ data, error: optErr }) => {
        if (cancelled) return;
        if (optErr || !Array.isArray(data) || data.length === 0) return;
        const mapped = data
          .filter((row) => row?.id && row?.label)
          .map((row) => ({ id: String(row.id), label: String(row.label) }));
        if (mapped.length) {
          setPlatformOptions(mapped);
          setLeadPlatformId((cur) => (mapped.some((m) => m.id === cur) ? cur : mapped[0].id));
        }
      })
      .catch(() => {});

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
  }, [open, defaultTab]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function handleInviteSubmit(e) {
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
          invites: [{ email: em, globalRole: 'client' }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLocalErr(data.error || 'Could not send invitation.');
        return;
      }
      setEmail('');
      setSendInvite(true);
      setLocalMsg('');
      setLocalErr('');
      onSuccess?.();
      onClose?.();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLeadSubmit(e) {
    e.preventDefault();
    setLocalErr('');
    setLocalMsg('');
    const company = leadCompany.trim();
    if (!company) {
      setLocalErr('Company name is required for a pipeline lead.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await erpAuthorizedFetch('/api/erp/crm/leads', {
        method: 'POST',
        body: JSON.stringify({
          companyName: company,
          contactName: leadContact.trim() || undefined,
          email: leadEmail.trim() || undefined,
          platformId: leadPlatformId || undefined,
          pipelineStage: 'new_lead',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLocalErr(data.error || 'Could not save lead.');
        return;
      }
      setLeadCompany('');
      setLeadContact('');
      setLeadEmail('');
      setLeadPlatformId(platformOptions[0]?.id || 'direct');
      onSuccess?.();
      onClose?.();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || typeof document === 'undefined') return null;

  const tabBtn = (active) =>
    `flex-1 rounded-xl px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition sm:text-sm ${
      active
        ? 'bg-amber-600 text-white shadow-md dark:bg-amber-700'
        : 'border border-amber-200/70 bg-white/80 text-amber-900/80 hover:bg-amber-50 dark:border-amber-900/50 dark:bg-[#181a17] dark:text-amber-200/90 dark:hover:bg-amber-950/30'
    }`;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-0 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px] dark:bg-slate-950/70"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="erp-add-client-title"
        className={`relative z-10 w-full ${erpModalPanelMaxWidthClass} rounded-none border border-amber-200/60 bg-gradient-to-br from-white via-white to-amber-50/40 p-6 shadow-[0_24px_64px_-16px_rgba(146,64,14,0.28)] ring-1 ring-amber-900/[0.07] sm:rounded-2xl dark:border-amber-900/40 dark:bg-[#15110b] dark:[background-image:none] dark:shadow-[0_28px_90px_-20px_rgba(0,0,0,0.7)] dark:ring-amber-950/30`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="erp-add-client-title" className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Add Client
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Invite someone to the workspace, or capture a prospect on the sales pipeline.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/5 dark:hover:text-slate-200"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-5 flex gap-2" role="tablist" aria-label="Add client mode">
          <button type="button" role="tab" aria-selected={modalTab === 'invite'} className={tabBtn(modalTab === 'invite')} onClick={() => setModalTab('invite')}>
            Email invite
          </button>
          <button type="button" role="tab" aria-selected={modalTab === 'lead'} className={tabBtn(modalTab === 'lead')} onClick={() => setModalTab('lead')}>
            Pipeline lead
          </button>
        </div>

        {modalTab === 'invite' ? (
          <form onSubmit={(e) => void handleInviteSubmit(e)} className="mt-6 space-y-4">
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
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                When set, the invite can attach them to this project after they accept.
              </p>
            </div>

            {canSendInvites ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200/70 bg-amber-50/50 px-3 py-3 text-sm text-slate-700 dark:border-amber-900/45 dark:bg-amber-950/20 dark:text-slate-300">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-300 text-amber-700 focus:ring-amber-400 dark:border-amber-800/60 dark:bg-[#181a17] dark:text-amber-500 dark:focus:ring-amber-500/30"
                  checked={sendInvite}
                  onChange={(e) => setSendInvite(e.target.checked)}
                  disabled={submitting}
                />
                <span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">Send invitation email</span>
                  <span className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-slate-400">
                    Required to add a new client — they use the link to sign up with the client role.
                  </span>
                </span>
              </label>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">Only workspace admins and team leads can send invitation emails.</p>
            )}

            {(localErr || localMsg) && (
              <p className={`text-sm ${localErr ? 'text-red-700 dark:text-rose-300' : 'text-emerald-800 dark:text-emerald-300'}`}>{localErr || localMsg}</p>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 min-w-[7rem] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-amber-900/40 dark:bg-[#181a17] dark:text-slate-200 dark:shadow-black/30 dark:hover:bg-[#1f1d18] dark:hover:border-amber-800/55"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 min-w-[7rem] rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2.5 text-sm font-bold text-white shadow-md hover:shadow-lg disabled:opacity-50 dark:[background-image:none] dark:bg-amber-700 dark:hover:bg-amber-600 dark:shadow-black/40"
              >
                {submitting ? 'Sending…' : 'Add client'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => void handleLeadSubmit(e)} className="mt-6 space-y-4">
            <div>
              <label className={labelClass} htmlFor="lead-company">
                Company
              </label>
              <input
                id="lead-company"
                value={leadCompany}
                onChange={(e) => setLeadCompany(e.target.value)}
                className={inputClass}
                placeholder="Company or brand name"
                disabled={submitting}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="lead-contact">
                Contact person
              </label>
              <input
                id="lead-contact"
                value={leadContact}
                onChange={(e) => setLeadContact(e.target.value)}
                className={inputClass}
                placeholder="Primary contact name"
                disabled={submitting}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="lead-email">
                Email (optional)
              </label>
              <input
                id="lead-email"
                type="email"
                value={leadEmail}
                onChange={(e) => setLeadEmail(e.target.value)}
                className={inputClass}
                placeholder="prospect@company.com"
                disabled={submitting}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="lead-platform">
                Platform
              </label>
              <ErpCreatableSelect
                valueId={leadPlatformId || (platformOptions[0]?.id ?? '')}
                options={platformOptions}
                placeholder="Choose platform…"
                onChange={(nextId) => setLeadPlatformId(nextId)}
                canCreate={canAddPlatformOption}
                onCreate={async ({ id, label }) => {
                  const seed = Math.min(8999, Math.floor(Date.now() / 1000) % 8999);
                  const { error } = await supabase.from('erp_client_platform_options').insert({
                    id,
                    label,
                    sort_order: 900 + seed + platformOptions.length,
                  });
                  if (error) throw new Error(error.message);
                  const { data } = await supabase
                    .from('erp_client_platform_options')
                    .select('id, label, sort_order')
                    .order('sort_order', { ascending: true });
                  const mapped = (data || [])
                    .filter((row) => row?.id && row?.label)
                    .map((row) => ({ id: String(row.id), label: String(row.label) }));
                  if (mapped.length) setPlatformOptions(mapped);
                }}
              />
            </div>

            {localErr ? <p className="text-sm text-red-700 dark:text-rose-300">{localErr}</p> : null}

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 min-w-[7rem] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-amber-900/40 dark:bg-[#181a17] dark:text-slate-200 dark:shadow-black/30 dark:hover:bg-[#1f1d18] dark:hover:border-amber-800/55"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 min-w-[7rem] rounded-xl bg-gradient-to-r from-[#103D4D] to-[#4338ca] px-4 py-2.5 text-sm font-bold text-white shadow-md hover:shadow-lg disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Save lead'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
