'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import ErpTeamDirectoryGrid from './ErpTeamDirectoryGrid';
import ErpConfirmDialog from './ErpConfirmDialog';

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
 * Invite workspace people by email (existing roster + free-form). Optionally attach a project.
 * Uses POST /api/erp/invitations/batch (admin / team lead only).
 */
export default function ErpInviteMembersModal({
  open,
  onClose,
  /** When set, invitations attach to this project (adds existing users + emails). */
  projectId = null,
  projectName = '',
  /** User ids already on the project — hidden from pick list */
  existingMemberUserIds = [],
  onSuccess,
}) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [usersErr, setUsersErr] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [extraEmails, setExtraEmails] = useState('');
  const [inviteRole, setInviteRole] = useState('team_member');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [confirmNoProjectOpen, setConfirmNoProjectOpen] = useState(false);

  const rosterUsers = useMemo(() => {
    const skip = new Set(existingMemberUserIds || []);
    return (users || []).filter((u) => u?.id && !skip.has(u.id));
  }, [users, existingMemberUserIds]);

  const toggleId = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelectedIds([]);
    setExtraEmails('');
    setInviteRole('team_member');
    setErr('');
    setUsersErr('');
    let cancelled = false;
    setLoading(true);
    erpAuthorizedFetch('/api/erp/dm/directory?assignable=1')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not load people');
        if (!cancelled) setUsers(Array.isArray(data.users) ? data.users : []);
      })
      .catch((e) => {
        if (!cancelled) setUsersErr(e?.message || 'Could not load people');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function buildCombinedEmails() {
    const fromGrid = selectedIds
      .map((id) => rosterUsers.find((u) => u.id === id))
      .filter(Boolean)
      .map((u) => (u.email && String(u.email).trim()) || '')
      .filter(Boolean)
      .map((e) => e.toLowerCase());

    const fromText = parseEmails(extraEmails);
    return [...new Set([...fromGrid, ...fromText])];
  }

  async function submitInviteBatch(combined) {
    setSubmitting(true);
    try {
      const joined = combined.join('\n');
      const payload = {
        projectId: projectId || null,
        teamMemberEmails: '',
        managerEmails: '',
        clientEmails: '',
      };
      if (inviteRole === 'team_lead') payload.managerEmails = joined;
      else if (inviteRole === 'client') payload.clientEmails = joined;
      else payload.teamMemberEmails = joined;
      const res = await erpAuthorizedFetch('/api/erp/invitations/batch', {
        method: 'POST',
        body: JSON.stringify(payload),
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

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');

    const combined = buildCombinedEmails();

    if (combined.length === 0) {
      setErr('Select at least one person or enter at least one email.');
      return;
    }

    if (!projectId) {
      setConfirmNoProjectOpen(true);
      return;
    }

    await submitInviteBatch(combined);
  }

  if (!open) return null;

  const title = projectId ? 'Invite members' : 'Invite to workspace';
  const subtitle = projectId
    ? projectName
      ? `Add people to “${projectName}”. They’ll get an email (existing accounts are added immediately when possible).`
      : 'Add people to this project. They’ll get an email.'
    : 'Choose workspace members or enter email addresses. Invitations are sent by email.';

  return (
    <ErpBodyPortal>
      <div
        className="fixed inset-0 z-[500] overflow-y-auto text-xs"
        role="dialog"
        aria-modal="true"
        aria-labelledby="erp-invite-members-title"
      >
        <button type="button" className={erpModalBackdropClass} aria-label="Close" onClick={onClose} />
        <div className="relative z-[1] flex min-h-full flex-col justify-center px-3 py-3 sm:px-5 sm:py-4">
          <div className={`${erpModalPanelClass} mx-auto w-full !max-h-[min(92dvh,720px)]`}>
            <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-slate-900 via-[#103D4D] to-teal-900 px-4 pb-2.5 pt-2.5 pr-12 text-white sm:px-5 sm:pb-3 sm:pt-3 sm:pr-14">
              <ErpModalCloseButton onClose={onClose} />
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-200/95">Workspace</p>
              <h2 id="erp-invite-members-title" className="mt-0.5 text-base font-bold tracking-tight sm:text-lg">
                {title}
              </h2>
              <p className="mt-1 text-[11px] font-medium leading-snug text-white/85">{subtitle}</p>
            </div>

            <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-width:thin] sm:px-5 sm:py-3">
                {err ? (
                  <p className="rounded-xl border border-rose-200/90 bg-rose-50/95 px-2.5 py-2 text-[11px] font-medium text-rose-900">
                    {err}
                  </p>
                ) : null}
                <div>
                  <ErpModalFieldLabel small>People on the workspace</ErpModalFieldLabel>
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/30 p-2">
                    <ErpTeamDirectoryGrid
                      users={rosterUsers}
                      loading={loading}
                      errorText={usersErr}
                      mode="group"
                      dense
                      showBulkActions
                      groupSelectedIds={selectedIds}
                      onGroupToggle={toggleId}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {projectId
                      ? 'People already on this project are omitted. Pick a role below to set how they are invited.'
                      : 'Pick workspace members to email an invitation.'}
                  </p>
                </div>

                <div>
                  <ErpModalFieldLabel small>Invite as</ErpModalFieldLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'team_lead', label: 'Team lead' },
                      { id: 'team_member', label: 'Team member' },
                      { id: 'client', label: 'Client' },
                    ].map((o) => {
                      const active = inviteRole === o.id;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setInviteRole(o.id)}
                          className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${
                            active
                              ? 'border-[#103D4D] bg-[#103D4D] text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Everyone selected or pasted below is invited with this role.
                  </p>
                </div>

                <div>
                  <ErpModalFieldLabel htmlFor="erp-invite-extra" optional small>
                    Or paste email addresses
                  </ErpModalFieldLabel>
                  <textarea
                    id="erp-invite-extra"
                    value={extraEmails}
                    onChange={(e) => setExtraEmails(e.target.value)}
                    rows={3}
                    placeholder={'one@company.com\nteammate@example.com'}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#103D4D]/35 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
                  />
                </div>
              </div>

              <div className={`${erpModalFooterClass} !px-3 !py-2.5 sm:!px-5`}>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || loading}
                  className={`${erpModalPrimaryButtonClass} !px-5 !py-2.5 !text-xs`}
                >
                  {submitting ? 'Sending…' : 'Send invitations'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      <ErpConfirmDialog
        open={confirmNoProjectOpen}
        title="Send without attaching a project?"
        confirmLabel="Send invitations"
        tone="teal"
        busy={submitting}
        onCancel={() => !submitting && setConfirmNoProjectOpen(false)}
        onConfirm={async () => {
          const combined = buildCombinedEmails();
          setConfirmNoProjectOpen(false);
          await submitInviteBatch(combined);
        }}
      >
        <p>
          No project is attached. Invited people get workspace access; their Projects list stays empty until they are added
          to a project.
        </p>
      </ErpConfirmDialog>
    </ErpBodyPortal>
  );
}
