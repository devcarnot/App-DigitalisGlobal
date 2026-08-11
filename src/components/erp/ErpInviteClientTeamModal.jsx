'use client';

import { useEffect, useState } from 'react';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import {
  ErpModalFieldLabel,
  erpModalPanelClass,
  erpModalFooterClass,
  erpModalBackdropClass,
  erpModalPrimaryButtonClass,
  ErpModalCloseButton,
} from './ErpModalFormPrimitives';
import ErpBodyPortal from './ErpBodyPortal';

function parseEmails(text) {
  if (!text || typeof text !== 'string') return [];
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const seen = new Set();
  const out = [];
  for (const chunk of text.split(/[\n,;]+/)) {
    const e = chunk.trim().toLowerCase();
    if (!e || !re.test(e) || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

/**
 * Invite client team helpers to the current project only (limited access: chat + tasks).
 */
export default function ErpInviteClientTeamModal({
  open,
  onClose,
  projectId,
  projectName = '',
  onSuccess,
}) {
  const [extraEmails, setExtraEmails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setExtraEmails('');
    setErr('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    const combined = parseEmails(extraEmails);
    if (combined.length === 0) {
      setErr('Enter at least one email address.');
      return;
    }
    if (!projectId) {
      setErr('Project is missing.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await erpAuthorizedFetch('/api/erp/invitations/project-client-team', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          invites: combined.map((email) => ({ email })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || 'Request failed');
        return;
      }
      const { summary } = data;
      if (summary?.failed > 0 && summary?.sent === 0) {
        setErr(data.results?.[0]?.error || 'No emails were sent.');
        return;
      }
      onSuccess?.();
      onClose?.();
    } catch (ex) {
      setErr(ex?.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const subtitle = projectName
    ? `Add helpers to “${projectName}”. They can use project chat and add or assign tasks: nothing else in the workspace.`
    : 'Add helpers who can use project chat and tasks on this project only.';

  return (
    <ErpBodyPortal>
      <div
        className="fixed inset-0 z-[500] flex items-center justify-center px-0 py-3 text-xs sm:px-5 sm:py-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="erp-invite-client-team-title"
      >
        <button type="button" className={erpModalBackdropClass} aria-label="Close" onClick={onClose} />
        <div className="relative z-[1] flex w-full justify-center">
          <div className={`${erpModalPanelClass} mx-auto w-full !max-h-[min(72dvh,520px)]`}>
            <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-slate-900 via-[#103D4D] to-teal-900 px-4 pb-2.5 pt-2.5 pr-12 text-white sm:px-5 sm:pb-3 sm:pt-3 sm:pr-14">
              <ErpModalCloseButton onClose={onClose} />
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-200/95">Project</p>
              <h2 id="erp-invite-client-team-title" className="mt-0.5 text-base font-bold tracking-tight sm:text-lg">
                Invite client team
              </h2>
              <p className="mt-1 text-[11px] font-medium leading-snug text-white/85">{subtitle}</p>
            </div>

            <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-width:thin] sm:px-5 sm:py-3">
                {err ? (
                  <p className="rounded-xl border border-rose-200/90 bg-rose-50/95 px-2.5 py-2 text-[11px] font-medium text-rose-900 dark:border-rose-900/55 dark:bg-rose-950/45 dark:text-rose-200">
                    {err}
                  </p>
                ) : null}
                <div>
                  <ErpModalFieldLabel htmlFor="erp-invite-client-team-emails" small>
                    Email addresses
                  </ErpModalFieldLabel>
                  <textarea
                    id="erp-invite-client-team-emails"
                    value={extraEmails}
                    onChange={(e) => setExtraEmails(e.target.value)}
                    rows={4}
                    placeholder={'helper@company.com\ncolleague@example.com'}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#103D4D]/35 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-600/50 dark:focus:ring-teal-500/20"
                  />
                  <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                    Invited people join as <span className="font-semibold">Client team member</span> on this project only.
                    They need a phone number when accepting, like other client invites.
                  </p>
                </div>
              </div>

              <div className={`${erpModalFooterClass} !px-3 !py-2.5 sm:!px-5`}>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-teal-800/55 dark:bg-[#101a22] dark:text-slate-200 dark:shadow-black/30 dark:hover:bg-[#152230] dark:hover:border-teal-700/55"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`${erpModalPrimaryButtonClass} !px-5 !py-2.5 !text-xs`}
                >
                  {submitting ? 'Sending…' : 'Send invitations'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ErpBodyPortal>
  );
}
