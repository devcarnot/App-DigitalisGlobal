'use client';

import { useCallback, useEffect, useMemo, useRef, startTransition, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import {
  erpModalInputClass,
  erpModalTextareaClass,
  erpModalTitleInputClass,
  ErpModalFieldLabel,
  ErpModalAttachmentDropZone,
  erpModalPanelClass,
  erpModalFooterClass,
  erpModalBackdropClass,
  erpModalPrimaryButtonClass,
  ErpModalCloseButton,
} from './ErpModalFormPrimitives';
import ErpBodyPortal from './ErpBodyPortal';
import ErpCreatableMultiSelect from './ErpCreatableMultiSelect';

const ErpTeamDirectoryGrid = dynamic(() => import('./ErpTeamDirectoryGrid'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[7rem] items-center justify-center rounded-xl border border-slate-200/80 bg-white/60 dark:border-teal-900/45 dark:bg-[#0f1820]/90">
      <div
        className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D] dark:border-teal-900/70 dark:border-t-teal-400"
        aria-hidden
      />
    </div>
  ),
});
import { ERP_PROJECT_TYPES, normalizeErpProjectType } from '../../lib/erp-project-types';
import { useErpSession } from './useErpSession';
import { isErpManagerRole } from '../../lib/erp-roles';

const MAX_BYTES = 25 * 1024 * 1024;

function formatMb(n) {
  return (n / 1024 / 1024).toFixed(1).replace(/\.0$/, '');
}
// Single "Choose files" zone — accept docs, images, video, audio, archives, etc.
// Total cap matches the old docs + images combined capacity so we don't lose
// upload budget by merging the two zones.
const MAX_ATTACHMENTS = 12;

function todayIsoLocal() {
  const a = new Date();
  const y = a.getFullYear();
  const m = String(a.getMonth() + 1).padStart(2, '0');
  const day = String(a.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultDateRange() {
  const a = new Date();
  const b = new Date(a);
  b.setDate(b.getDate() + 30);
  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return { start: fmt(a), end: fmt(b) };
}

const compactInput = `${erpModalInputClass} !px-2.5 !py-2 !text-xs`;
const compactTitleInput = `${erpModalTitleInputClass} !px-2.5 !py-2 !text-sm !leading-snug sm:!text-[0.9375rem]`;
const compactTextarea = `${erpModalTextareaClass} !min-h-[3.25rem] !px-2.5 !py-2 !text-xs`;

export default function ErpAddProjectModal({ open, onClose, userId, onCreated }) {
  const { profile } = useErpSession();
  const isManager = isErpManagerRole(profile?.role);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectTypeIds, setProjectTypeIds] = useState([]);
  const [projectTypeOptions, setProjectTypeOptions] = useState(ERP_PROJECT_TYPES);
  const [startDate, setStartDate] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [projectLeadIds, setProjectLeadIds] = useState([]);
  const [memberIds, setMemberIds] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersErr, setUsersErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [clientInviteEmail, setClientInviteEmail] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('team_member');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteNote, setInviteNote] = useState('');
  const assignableUsersRef = useRef([]);
  assignableUsersRef.current = assignableUsers;

  const toggleProjectLead = useCallback((id) => {
    setProjectLeadIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
    setMemberIds((m) => m.filter((x) => x !== id));
  }, []);

  const toggleMember = useCallback((id) => {
    if (projectLeadIds.includes(id)) return;
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, [projectLeadIds]);

  const deadlineMin = useMemo(() => {
    const t = todayIsoLocal();
    if (!startDate) return t;
    return startDate > t ? startDate : t;
  }, [startDate]);

  useEffect(() => {
    if (!open) return;
    const d = defaultDateRange();
    setName('');
    setDescription('');
    setProjectTypeIds([]);
    setStartDate(d.start);
    setDeadlineDate(d.end);
    setAttachments([]);
    setProjectLeadIds(userId ? [userId] : []);
    setMemberIds([]);
    setErr('');
    setUsersErr('');
    setClientInviteEmail('');
    setInviteEmail('');
    setInviteRole('team_member');
    setInviteBusy(false);
    setInviteNote('');
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    supabase
      .from('erp_project_type_options')
      .select('id, label')
      .order('label', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !Array.isArray(data) || data.length === 0) {
          setProjectTypeOptions(ERP_PROJECT_TYPES);
          return;
        }
        const mapped = data
          .filter((r) => r?.id && r?.label)
          .map((r) => ({ id: String(r.id), label: String(r.label) }));
        setProjectTypeOptions(mapped.length ? mapped : ERP_PROJECT_TYPES);
      })
      .catch(() => {
        if (!cancelled) setProjectTypeOptions(ERP_PROJECT_TYPES);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setUsersErr('');
    const hadUsers = assignableUsersRef.current.length > 0;
    if (!hadUsers) setUsersLoading(true);

    const runFetch = () => {
      if (cancelled) return;
      erpAuthorizedFetch('/api/erp/dm/directory?assignable=1')
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Could not load people');
          const list = [...(data.users || [])];
          list.sort((a, b) => {
            if (a.id === userId) return -1;
            if (b.id === userId) return 1;
            return (a.full_name || '').localeCompare(b.full_name || '');
          });
          if (!cancelled) setAssignableUsers(list);
        })
        .catch((e) => {
          if (!cancelled) setUsersErr(e?.message || 'Could not load people');
        })
        .finally(() => {
          if (!cancelled) setUsersLoading(false);
        });
    };

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(runFetch);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    if (!deadlineDate) return;
    if (deadlineDate < deadlineMin) setDeadlineDate(deadlineMin);
  }, [open, deadlineMin, deadlineDate]);

  const sendInvite = useCallback(async () => {
    const email = inviteEmail.trim().toLowerCase();
    setInviteNote('');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteNote('Enter a valid email.');
      return;
    }
    setInviteBusy(true);
    try {
      const payload = {
        projectId: null,
        teamMemberEmails: '',
        managerEmails: '',
        clientEmails: '',
      };
      if (inviteRole === 'team_lead') payload.managerEmails = email;
      else if (inviteRole === 'client') payload.clientEmails = email;
      else payload.teamMemberEmails = email;
      const res = await erpAuthorizedFetch('/api/erp/invitations/batch', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.summary?.sent === 0) {
        setInviteNote(data?.results?.[0]?.error || data?.error || 'Invite failed.');
      } else {
        setInviteNote(`Invite sent to ${email}.`);
        setInviteEmail('');
        erpAuthorizedFetch('/api/erp/dm/directory?assignable=1')
          .then(async (res2) => {
            const d2 = await res2.json().catch(() => ({}));
            if (res2.ok && Array.isArray(d2.users)) setAssignableUsers(d2.users);
          })
          .catch(() => {});
      }
    } catch (e) {
      setInviteNote(e?.message || 'Invite failed.');
    } finally {
      setInviteBusy(false);
    }
  }, [inviteEmail, inviteRole]);

  const mergeAttachments = useCallback((fileList) => {
    if (!fileList?.length) return;
    const tooBig = [];
    let skippedOverCap = 0;
    setAttachments((prev) => {
      const next = [...prev];
      for (const f of Array.from(fileList)) {
        if (!f) continue;
        if (f.size > MAX_BYTES) {
          tooBig.push(`${f.name} (${formatMb(f.size)} MB)`);
          continue;
        }
        if (next.length >= MAX_ATTACHMENTS) {
          skippedOverCap += 1;
          continue;
        }
        next.push(f);
      }
      return next;
    });
    if (tooBig.length) {
      setErr(
        `Skipped — too large (limit ${Math.round(MAX_BYTES / 1024 / 1024)} MB): ${tooBig.join(', ')}`,
      );
    } else if (skippedOverCap > 0) {
      setErr(`Only ${MAX_ATTACHMENTS} files allowed; ${skippedOverCap} extra file(s) skipped.`);
    } else {
      setErr('');
    }
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !userId || projectLeadIds.length === 0) return;
    if (!startDate || !deadlineDate) {
      setErr('Choose start and end dates.');
      return;
    }
    if (startDate > deadlineDate) {
      setErr('End date must be on or after the start date.');
      return;
    }
    if (deadlineDate < deadlineMin) {
      setErr('Due date must be today or later, and not before the start date.');
      return;
    }
    const inviteTrim = clientInviteEmail.trim();
    if (inviteTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteTrim.toLowerCase())) {
      setErr('Enter a valid client email or leave invitation blank.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const res = await erpAuthorizedFetch('/api/erp/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmed,
          description: description.trim() || undefined,
          projectTypeIds: Array.isArray(projectTypeIds) && projectTypeIds.length ? projectTypeIds : ['custom'],
          projectType: normalizeErpProjectType(projectTypeIds?.[0]),
          startDate,
          deadlineDate,
          projectLeadIds,
          memberIds,
          ...(inviteTrim ? { clientInviteEmail: inviteTrim.toLowerCase() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || 'Could not create project');
        return;
      }
      const projectId = data.project?.id;
      if (!projectId) {
        setErr('Unexpected response from server.');
        return;
      }
      if (data.invite && data.invite.ok === false) {
        setErr(
          data.invite.error ||
            (data.invite.step === 'email'
              ? 'Project was created, but the invitation email could not be sent.'
              : 'Project was created, but the client invitation could not be completed.'),
        );
      }

      const meta = [];
      for (const file of attachments) {
        const fd = new FormData();
        fd.append('projectId', projectId);
        fd.append('scope', 'brief');
        fd.append('file', file, file.name);
        const upRes = await erpAuthorizedFetch('/api/erp/uploads/task-attachment', {
          method: 'POST',
          body: fd,
        });
        const upData = await upRes.json().catch(() => ({}));
        if (!upRes.ok || !upData?.ok || !upData?.path) {
          setErr(upData?.error || `Upload failed for "${file.name}" — project was created; add files from the project page.`);
          onCreated?.();
          onClose?.();
          return;
        }
        meta.push({
          path: upData.path,
          name: upData.name || file.name,
          mime: upData.mime || file.type || 'application/octet-stream',
        });
      }
      if (meta.length) {
        const { error: patchErr } = await supabase.from('erp_projects').update({ description_attachments: meta }).eq('id', projectId);
        if (patchErr) {
          setErr(patchErr.message || 'Could not save attachment metadata.');
        }
      }
      onCreated?.();
      onClose?.();
    } catch (ex) {
      setErr(ex?.message || 'Could not create project');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <ErpBodyPortal>
      <div
        className="fixed inset-0 z-[500] overflow-y-auto text-xs dark:[color-scheme:dark]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="erp-add-project-title"
        aria-describedby="erp-add-project-desc"
      >
        <p id="erp-add-project-desc" className="sr-only">
          Fill in project details, choose a type and team, optionally invite a client by email, then attach optional
          documents or images.
        </p>
        <button type="button" className={erpModalBackdropClass} aria-label="Close" onClick={onClose} />
        <div className="relative z-[1] flex min-h-full flex-col justify-center px-3 py-3 sm:px-5 sm:py-4">
          <div className={`${erpModalPanelClass} mx-auto w-full max-w-[min(100%,56rem)] !max-h-[min(96dvh,920px)]`}>
            <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-slate-900 via-[#103D4D] to-teal-900 px-4 pb-2.5 pt-2.5 pr-12 text-white sm:px-5 sm:pb-3 sm:pt-3 sm:pr-14">
              <ErpModalCloseButton onClose={onClose} />
              <div className="pointer-events-none absolute -right-20 -top-24 h-44 w-44 rounded-full bg-teal-400/14 blur-3xl" aria-hidden />
              <div className="relative min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-200/95">Workspace</p>
                <h2 id="erp-add-project-title" className="mt-0.5 text-base font-bold tracking-tight sm:text-lg">
                  New project
                </h2>
              </div>
            </div>

            <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-width:thin] sm:px-5 sm:py-3 dark:[color-scheme:dark]">
                {err ? (
                  <p className="rounded-xl border border-rose-200/90 bg-rose-50/95 px-2.5 py-2 text-[11px] font-medium text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/35 dark:text-rose-100">
                    {err}
                  </p>
                ) : null}

                <div>
                  <ErpModalFieldLabel htmlFor="erp-proj-name" required small>
                    Project title
                  </ErpModalFieldLabel>
                  <input
                    id="erp-proj-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={200}
                    autoComplete="off"
                    placeholder="Name this project"
                    className={compactTitleInput}
                  />
                </div>

                <div>
                  <ErpModalFieldLabel htmlFor="erp-proj-desc" optional small>
                    Description
                  </ErpModalFieldLabel>
                  <textarea
                    id="erp-proj-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    maxLength={8000}
                    placeholder="Goals, scope, links…"
                    className={compactTextarea}
                  />
                </div>

                <div>
                  <ErpModalFieldLabel htmlFor="erp-proj-type" required small>
                    Project type
                  </ErpModalFieldLabel>
                  <div id="erp-proj-type">
                    <ErpCreatableMultiSelect
                      valueIds={projectTypeIds}
                      options={projectTypeOptions}
                      onChange={(ids) => startTransition(() => setProjectTypeIds(ids))}
                      placeholder="Select or type a project type…"
                      canCreate
                      createLabel="Add project type"
                      onCreate={async ({ id, label }) => {
                        if (isManager) {
                          const { error: insErr } = await supabase
                            .from('erp_project_type_options')
                            .insert({ id, label });
                          if (insErr && !/duplicate/i.test(insErr.message || '')) {
                            throw new Error(insErr.message);
                          }
                        }
                        setProjectTypeOptions((prev) => {
                          if (prev.some((o) => o.id === id)) return prev;
                          return [...prev, { id, label }].sort((a, b) =>
                            a.label.localeCompare(b.label),
                          );
                        });
                      }}
                    />
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <ErpModalFieldLabel htmlFor="erp-proj-start" required small>
                      Start date
                    </ErpModalFieldLabel>
                    <input
                      id="erp-proj-start"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                      className={`${compactInput} font-medium`}
                    />
                  </div>
                  <div>
                    <ErpModalFieldLabel htmlFor="erp-proj-due" required small>
                      Due date
                    </ErpModalFieldLabel>
                    <input
                      id="erp-proj-due"
                      type="date"
                      value={deadlineDate}
                      min={deadlineMin}
                      onChange={(e) => setDeadlineDate(e.target.value)}
                      required
                      className={`${compactInput} font-medium`}
                    />
                  </div>
                </div>

                <div>
                  <ErpModalFieldLabel htmlFor="erp-proj-team" required small>
                    Team
                  </ErpModalFieldLabel>
                  <div id="erp-proj-team" className="rounded-xl border border-slate-200/80 bg-slate-50/30 p-2 dark:border-teal-900/45 dark:bg-[#080d14]/95 dark:[background-image:none]">
                    <ErpTeamDirectoryGrid
                      users={assignableUsers}
                      loading={usersLoading}
                      errorText={usersErr}
                      mode="project"
                      dense
                      projectLeadIds={projectLeadIds}
                      onProjectLeadToggle={toggleProjectLead}
                      projectMemberIds={memberIds}
                      onProjectMemberToggle={toggleMember}
                    />
                  </div>
                  {isManager ? (
                    <div className="mt-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-2.5 py-2 dark:border-teal-900/45 dark:bg-[#121f28]/95 dark:[background-image:none]">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Invite new member
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-stretch gap-1.5">
                        <input
                          type="email"
                          inputMode="email"
                          autoComplete="off"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="name@company.com"
                          className={`${compactInput} min-w-[10rem] flex-1`}
                          disabled={inviteBusy}
                        />
                        <select
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value)}
                          className={`${compactInput} min-w-[7.5rem] !w-auto !px-2 dark:[color-scheme:dark]`}
                          disabled={inviteBusy}
                          aria-label="Invite role"
                        >
                          <option value="team_lead">Team lead</option>
                          <option value="team_member">Team member</option>
                          <option value="client">Client</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => void sendInvite()}
                          disabled={inviteBusy || !inviteEmail.trim()}
                          className="shrink-0 rounded-xl bg-[#103D4D] px-3 py-2 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#0d3442] disabled:opacity-50 dark:[background-image:none]"
                        >
                          {inviteBusy ? 'Sending…' : 'Send invite'}
                        </button>
                      </div>
                      {inviteNote ? (
                        <p
                          className={`mt-1.5 text-[10px] font-medium ${
                            /sent/i.test(inviteNote)
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {inviteNote}
                        </p>
                      ) : (
                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                          They receive an email; once they sign up you can assign them as lead or member above.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>

                <ErpModalAttachmentDropZone
                  id="erp-proj-files"
                  label="Files & media"
                  hint={`Documents, images, video or any file · max ${MAX_ATTACHMENTS} · ${Math.round(MAX_BYTES / 1024 / 1024)} MB each`}
                  files={attachments}
                  onPick={(fl) => mergeAttachments(fl)}
                  onRemove={(i) => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  variant="doc"
                  compact
                />

                <div>
                  <ErpModalFieldLabel htmlFor="erp-proj-client-invite" optional small>
                    Client invitation
                  </ErpModalFieldLabel>
                  <input
                    id="erp-proj-client-invite"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    value={clientInviteEmail}
                    onChange={(e) => setClientInviteEmail(e.target.value)}
                    placeholder="client@company.com"
                    className={compactInput}
                  />
                  <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                    We will create the project and email this address an invite to the client workspace for this project.
                  </p>
                </div>
              </div>

              <div className={`${erpModalFooterClass} !px-3 !py-2.5 sm:!px-5`}>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-teal-800/50 dark:bg-[#121f28] dark:text-slate-200 dark:shadow-none dark:hover:bg-[#1a2732]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !name.trim() || projectLeadIds.length === 0 || (usersLoading && assignableUsers.length === 0)}
                  className={`${erpModalPrimaryButtonClass} !px-5 !py-2.5 !text-xs`}
                >
                  {saving ? 'Working…' : 'Create project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ErpBodyPortal>
  );
}
