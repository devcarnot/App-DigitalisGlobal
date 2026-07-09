'use client';

import { useCallback, useEffect, useMemo, useRef, startTransition, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch, fetchErpWorkspaceRoleTypeOptions, resolveDefaultWorkspaceRoleInviteId } from '../../lib/erp-client-api';
import {
  erpModalInputClass,
  erpModalTitleInputClass,
  ErpModalFieldLabel,
  ErpModalAttachmentDropZone,
  erpModalPanelClass,
  erpModalFooterClass,
  ErpModalFooterAlert,
  erpModalBackdropClass,
  erpModalPrimaryButtonClass,
  ErpModalCloseButton,
} from './ErpModalFormPrimitives';
import ErpBodyPortal from './ErpBodyPortal';
import ErpDateInput from './ErpDateInput';
import ErpCreatableMultiSelect from './ErpCreatableMultiSelect';
import ErpWysiwygMarkdownField from './ErpWysiwygMarkdownField';
import { uploadInlineImageToErpFiles } from '../../lib/erp-inline-image-upload';
import { ERP_MAX_UPLOAD_BYTES, ERP_MAX_UPLOAD_MB } from '../../lib/erp-upload-limits';

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

const MAX_BYTES = ERP_MAX_UPLOAD_BYTES;

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

const compactInput = `${erpModalInputClass} !px-2.5 !py-2 !text-xs`;
const compactTitleInput = `${erpModalTitleInputClass} !px-2.5 !py-2 !text-sm !leading-snug sm:!text-[0.9375rem]`;
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
  const [inviteRoleOptions, setInviteRoleOptions] = useState([]);
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
    setMemberIds((prev) => {
      if (projectLeadIds.includes(id)) return prev;
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }, [projectLeadIds]);

  const deadlineMin = useMemo(() => {
    const todayIso = todayIsoLocal();
    if (!startDate) return todayIso;
    const today = new Date(`${todayIso}T00:00:00`);
    const start = new Date(`${startDate}T00:00:00`);
    if (Number.isNaN(start.getTime())) return todayIso;
    return start > today ? startDate : todayIso;
  }, [startDate]);

  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setProjectTypeIds([]);
    setStartDate(todayIsoLocal());
    setDeadlineDate('');
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
    fetchErpWorkspaceRoleTypeOptions().then(({ ok, options }) => {
      if (cancelled || !ok || !Array.isArray(options) || options.length === 0) return;
      setInviteRoleOptions(options);
      setInviteRole((prev) =>
        resolveDefaultWorkspaceRoleInviteId(options, prev || options[0]?.id),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

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

    erpAuthorizedFetch('/api/erp/dm/directory?assignable=1')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not load people');
        const list = [...(data.users || [])].sort((a, b) => {
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

    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, saving]);

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
        invites: [{ email, globalRole: inviteRole }],
      };
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
        `Skipped — too large (limit ${ERP_MAX_UPLOAD_MB} MB): ${tooBig.join(', ')}`,
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
    if (!projectTypeIds.length) {
      setErr('Please select a project type.');
      return;
    }
    if (!startDate || !deadlineDate) {
      setErr('Choose start and due dates.');
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
          projectTypeIds,
          projectType: normalizeErpProjectType(projectTypeIds[0]),
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

      let meta = [];
      if (attachments.length) {
        try {
          meta = await Promise.all(
            attachments.map(async (file) => {
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
                throw new Error(upData?.error || `Upload failed for "${file.name}"`);
              }
              return {
                path: upData.path,
                name: upData.name || file.name,
                mime: upData.mime || file.type || 'application/octet-stream',
              };
            }),
          );
        } catch (upEx) {
          setErr(`${upEx?.message || 'One or more uploads failed.'} — project was created; add files from the project page.`);
          onCreated?.();
          onClose?.();
          return;
        }
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
        className="fixed inset-0 z-[500] text-xs dark:[color-scheme:dark]"
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
        <div
          className={`${erpModalPanelClass} z-[1]`}
          style={{
            position: 'absolute',
            top: '0.75rem',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(calc(100vw - 1rem), 60rem)',
            maxHeight: 'min(calc(100dvh - 1.5rem), 920px)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
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

            <form
              onSubmit={onSubmit}
              className="overflow-hidden"
              style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0%', minHeight: 0 }}
            >
              <div
                className="space-y-3 overflow-y-auto overscroll-contain px-3 py-3 [scrollbar-width:thin] sm:px-5 sm:py-3 dark:[color-scheme:dark]"
                style={{ flex: '1 1 0%', minHeight: 0 }}
              >
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
                  <div id="erp-proj-desc" className="mt-1">
                    <ErpWysiwygMarkdownField
                      value={description}
                      onChange={(next) => setDescription(String(next || '').slice(0, 8000))}
                      disabled={saving}
                      resetKey={`${open ? 'open' : 'closed'}-${name || 'new-project'}`}
                      placeholder="Goals, scope, links…"
                      editorClassName="!h-[300px] !max-h-[300px] !min-h-[300px] !resize-none !rounded-xl"
                      onImagePaste={(file) => uploadInlineImageToErpFiles(file, { folder: 'project-desc' })}
                      onImagePasteError={(e) => setErr(e?.message || 'Could not upload pasted image.')}
                    />
                  </div>
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
                    <ErpDateInput
                      id="erp-proj-start"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                      className={`${compactInput} erp-date-input font-medium`}
                    />
                  </div>
                  <div>
                    <ErpModalFieldLabel htmlFor="erp-proj-due" required small>
                      Due date
                    </ErpModalFieldLabel>
                    <ErpDateInput
                      id="erp-proj-due"
                      value={deadlineDate}
                      min={deadlineMin}
                      onChange={(e) => setDeadlineDate(e.target.value)}
                      required
                      className={`${compactInput} erp-date-input font-medium`}
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
                          {inviteRoleOptions.length === 0 ? (
                            <>
                              <option value="team_lead">Team lead</option>
                              <option value="team_member">Team member</option>
                              <option value="client">Client</option>
                            </>
                          ) : (
                            inviteRoleOptions.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))
                          )}
                        </select>
                        <button
                          type="button"
                          onClick={() => void sendInvite()}
                          disabled={inviteBusy || !inviteEmail.trim()}
                          className="shrink-0 rounded-xl erp-brand-fill px-3 py-2 text-[11px] font-bold text-white shadow-sm transition disabled:opacity-50"
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
                  hint={`Documents, images, video or any file · max ${MAX_ATTACHMENTS} · ${ERP_MAX_UPLOAD_MB} MB each`}
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

              <ErpModalFooterAlert message={err} toastTitle="Could not create project" />
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
    </ErpBodyPortal>
  );
}
