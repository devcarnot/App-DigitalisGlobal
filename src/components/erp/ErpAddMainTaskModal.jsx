'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { erpProjectMemberDelegationLabel } from '../../lib/erp-roles';
import {
  erpModalInputClass,
  erpModalTitleInputClass,
  erpModalSelectClass,
  ErpModalFieldLabel,
  ErpModalAttachmentDropZone,
  ErpModalSectionTitle,
  erpModalPanelClass,
  erpModalFooterClass,
  ErpModalFooterAlert,
  erpModalBackdropClass,
  erpModalPrimaryButtonClass,
  ErpModalCloseButton,
} from './ErpModalFormPrimitives';
import ErpBodyPortal from './ErpBodyPortal';
import ErpNativeSelect from './ErpNativeSelect';
import ErpDateInput from './ErpDateInput';
import ErpTaskPriorityPicker from './ErpTaskPriorityPicker';
import ErpWysiwygMarkdownField from './ErpWysiwygMarkdownField';
import { normalizeTaskPriority } from '../../lib/erp-task-priority';
import { isTaskDueDateNotInPast, todayDateInputValue } from '../../lib/task-dates';
import { uploadInlineImageToErpFiles } from '../../lib/erp-inline-image-upload';
import { ERP_MAX_UPLOAD_BYTES, ERP_MAX_UPLOAD_MB } from '../../lib/erp-upload-limits';

const MAX_BYTES = ERP_MAX_UPLOAD_BYTES;
// Single merged "Files & media" zone; cap matches the old docs + images total.
const MAX_ATTACHMENTS = 10;

function formatMb(n) {
  return (n / 1024 / 1024).toFixed(1).replace(/\.0$/, '');
}

/**
 * Modal to add a task on an existing project (under the project anchor).
 * @param {{ onCreateProject?: () => void, canCreateProject?: boolean }} props
 */
export default function ErpAddMainTaskModal({
  open,
  onClose,
  projectOptions,
  userId,
  onCreated,
  onCreateProject,
  canCreateProject,
  canSetPriority = false,
}) {
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const opts = projectOptions || [];
  const allowedIds = useMemo(() => new Set(opts.map((p) => p.id).filter(Boolean)), [opts]);
  const singleProject = opts.length === 1 ? opts[0] : null;
  const quickPickProjects = useMemo(() => {
    if (singleProject || opts.length < 2) return [];
    return opts.slice(0, 5);
  }, [opts, singleProject]);

  useEffect(() => {
    if (!open) return;
    setErr('');
    setTitle('');
    setDescription('');
    setStartDate('');
    setDueDate('');
    setPriority('medium');
    setAssigneeIds([]);
    setAttachments([]);
    if (singleProject) {
      setProjectId(singleProject.id);
    } else {
      setProjectId('');
    }
  }, [open, singleProject?.id]);

  useEffect(() => {
    if (!open) return;
    setAssigneeIds([]);
  }, [projectId, open]);

  useEffect(() => {
    if (!open || !projectId) {
      setProjectMembers([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setMembersLoading(true);
      try {
        const { data: mems, error: memErr } = await supabase
          .from('erp_project_members')
          .select('user_id, role')
          .eq('project_id', projectId);
        if (memErr) throw memErr;
        const rows = mems || [];
        const uids = [...new Set(rows.map((m) => m.user_id).filter(Boolean))];
        let profilesById = {};
        if (uids.length > 0) {
          const { data: profs } = await supabase
            .from('erp_profiles')
            .select('id, full_name, role, member_team')
            .in('id', uids);
          for (const p of profs || []) {
            profilesById[p.id] = p;
          }
        }
        const list = rows
          .map((m) => {
            const prof = profilesById[m.user_id];
            const name = prof?.full_name?.trim() || 'Member';
            const roleLabel = erpProjectMemberDelegationLabel(m.role, prof);
            return {
              user_id: m.user_id,
              label: `${name} (${roleLabel})`,
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label));
        if (!cancelled) setProjectMembers(list);
      } catch {
        if (!cancelled) setProjectMembers([]);
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
    e.stopPropagation();
    const trimmed = title.trim();
    if (!trimmed || !userId) return;
    if (!projectId || !allowedIds.has(projectId)) {
      setErr('Choose one of your existing projects.');
      return;
    }
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (startDate && !dateRe.test(startDate)) {
      setErr('Invalid start date.');
      return;
    }
    if (dueDate && !dateRe.test(dueDate)) {
      setErr('Invalid due date.');
      return;
    }
    if (startDate && dueDate && startDate > dueDate) {
      setErr('Due date must be on or after the start date.');
      return;
    }
    if (dueDate && !isTaskDueDateNotInPast(dueDate)) {
      setErr('Due date cannot be in the past.');
      return;
    }

    setSaving(true);
    setErr('');
    try {
      const all = attachments;
      const uploadedMeta = all.length
        ? await Promise.all(
            all.map(async (file) => {
              const fd = new FormData();
              fd.append('projectId', projectId);
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
          )
        : [];

      const res = await erpAuthorizedFetch('/api/erp/tasks/create-main', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          title: trimmed,
          description: description.trim() || undefined,
          startDate: startDate || undefined,
          dueDate: dueDate || undefined,
          priority: canSetPriority ? normalizeTaskPriority(priority) : undefined,
          assigneeIds: assigneeIds.length ? assigneeIds : undefined,
          attachments: uploadedMeta,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || 'Could not create task');
        return;
      }
      onCreated?.();
      onClose?.();
    } catch (ex) {
      setErr(ex?.message || 'Could not create task');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <ErpBodyPortal>
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center px-0 py-5 sm:px-6 sm:py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="erp-add-task-title"
    >
      <button type="button" className={erpModalBackdropClass} aria-label="Close" onClick={onClose} />
      <div className="relative z-[1] flex w-full justify-center">
        <div className={`${erpModalPanelClass} mx-auto w-full`}>
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-slate-900 via-[#103D4D] to-cyan-900 px-5 pb-4 pt-3.5 pr-14 text-white sm:px-6 sm:pb-5 sm:pt-4 sm:pr-16">
            <ErpModalCloseButton onClose={onClose} />
            <div className="pointer-events-none absolute -right-20 -top-24 h-44 w-44 rounded-full bg-cyan-400/14 blur-3xl" aria-hidden />
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-black/20 to-transparent" aria-hidden />
            <div className="relative flex items-start gap-3">
              <div
                className="mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 sm:flex"
                aria-hidden
              >
                <svg className="h-4 w-4 text-cyan-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/95">Pipeline</p>
                <h2 id="erp-add-task-title" className="mt-0.5 text-xl font-bold tracking-tight sm:text-[1.35rem] sm:leading-snug">
                  Add task
                </h2>
              </div>
            </div>
          </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5 [scrollbar-width:thin] sm:px-6 sm:py-6">
            <section className="space-y-4">
              <ErpModalSectionTitle>Where &amp; what</ErpModalSectionTitle>
              <div>
                <ErpModalFieldLabel htmlFor="erp-add-task-project" required>
                  Project
                </ErpModalFieldLabel>
                {singleProject ? (
                  <div className={`${erpModalInputClass} border-slate-200/95 bg-slate-50/80 py-3.5 font-bold text-slate-800 dark:border-teal-800/40 dark:bg-[#0f1820] dark:text-slate-100`}>
                    {singleProject.name || 'Project'}
                  </div>
                ) : (
                  <>
                    {quickPickProjects.length > 0 ? (
                      <div className="mb-2.5">
                        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          Quick pick
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {quickPickProjects.map((p) => {
                            const active = projectId === p.id;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => setProjectId(p.id)}
                                className={`max-w-[11rem] truncate rounded-lg border px-2.5 py-1.5 text-left text-xs font-bold transition ${
                                  active
                                    ? 'border-[#103D4D] bg-[#103D4D]/10 text-[#103D4D] ring-1 ring-[#103D4D]/25 dark:border-teal-500/55 dark:bg-teal-900/35 dark:text-teal-100 dark:ring-teal-700/35'
                                    : 'border-slate-200/90 bg-white text-slate-700 hover:border-cyan-300/80 hover:bg-cyan-50/40 dark:border-teal-900/45 dark:bg-[#0f1820] dark:text-slate-200 dark:hover:border-teal-700/55 dark:hover:bg-teal-950/40'
                                }`}
                              >
                                {p.name || 'Project'}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                    <ErpNativeSelect
                      id="erp-add-task-project"
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      required
                      aria-required
                      className={`${erpModalSelectClass} !pl-3 !pr-11 ${!projectId ? 'ring-2 ring-amber-200/70' : ''}`}
                    >
                      <option value="" disabled>
                        Choose which project this belongs to…
                      </option>
                      {opts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name || 'Project'}
                        </option>
                      ))}
                    </ErpNativeSelect>
                    {canCreateProject && typeof onCreateProject === 'function' ? (
                      <button
                        type="button"
                        onClick={onCreateProject}
                        className="mt-2 text-left text-sm font-bold text-[#103D4D] underline decoration-cyan-400/60 underline-offset-2 transition hover:text-teal-800 dark:text-teal-300 dark:hover:text-teal-200"
                      >
                        + Create new project
                      </button>
                    ) : null}
                  </>
                )}
              </div>
              <div>
                <ErpModalFieldLabel htmlFor="erp-add-task-title-input" required>
                  Task title
                </ErpModalFieldLabel>
                <input
                  id="erp-add-task-title-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={500}
                  autoComplete="off"
                  placeholder="What needs to be done?"
                  className={erpModalTitleInputClass}
                />
              </div>
              <div>
                <ErpModalFieldLabel htmlFor="erp-add-task-desc" optional>
                  Description
                </ErpModalFieldLabel>
                <div id="erp-add-task-desc" className="mt-1">
                  <ErpWysiwygMarkdownField
                    value={description}
                    onChange={(next) => setDescription(String(next || '').slice(0, 8000))}
                    disabled={saving}
                    resetKey={`${open ? 'open' : 'closed'}-${projectId || 'none'}`}
                    placeholder="Details, links, criteria…"
                    editorClassName="min-h-[5rem]"
                    onImagePaste={(file) =>
                      uploadInlineImageToErpFiles(file, {
                        folder: 'task-desc',
                        projectId: projectId || undefined,
                      })
                    }
                    onImagePasteError={(e) => setErr(e?.message || 'Could not upload pasted image.')}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <ErpModalSectionTitle>Timeline</ErpModalSectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <ErpModalFieldLabel htmlFor="erp-task-start" optional>
                    Start date
                  </ErpModalFieldLabel>
                  <ErpDateInput
                    id="erp-task-start"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={`${erpModalInputClass} erp-date-input font-medium`}
                  />
                </div>
                <div className="min-w-0">
                  <ErpModalFieldLabel htmlFor="erp-task-due" optional>
                    Due date
                  </ErpModalFieldLabel>
                  <ErpDateInput
                    id="erp-task-due"
                    min={todayDateInputValue()}
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={`${erpModalInputClass} erp-date-input font-medium`}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <ErpModalSectionTitle>Assign to</ErpModalSectionTitle>
              <div>
                <ErpModalFieldLabel optional>Team members</ErpModalFieldLabel>
                {!projectId ? (
                  <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
                    Choose a project first to see who you can assign.
                  </p>
                ) : (
                  <div className="rounded-xl border border-slate-200/95 bg-white px-3 py-2.5 text-sm shadow-sm dark:border-teal-800/45 dark:bg-[#0f1820] dark:text-slate-100">
                    <div className="flex flex-wrap gap-1.5">
                      {assigneeIds.length > 0 ? (
                        assigneeIds.map((uid) => {
                          const label =
                            projectMembers.find((m) => m.user_id === uid)?.label || uid.slice(0, 8);
                          return (
                            <button
                              key={uid}
                              type="button"
                              onClick={() => setAssigneeIds((prev) => prev.filter((x) => x !== uid))}
                              className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700 dark:bg-teal-950/55 dark:text-teal-100 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                              title="Remove assignee"
                            >
                              <span className="truncate">{label}</span>
                              <span aria-hidden>×</span>
                            </button>
                          );
                        })
                      ) : (
                        <span className="text-[12px] text-slate-400 dark:text-slate-500">Unassigned</span>
                      )}
                    </div>
                    <ErpNativeSelect
                      value=""
                      disabled={membersLoading || projectMembers.length === 0}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        setAssigneeIds((prev) => (prev.includes(v) ? prev : [...prev, v]));
                      }}
                      className={`${erpModalSelectClass} mt-2 !pl-3 !pr-11`}
                      aria-label="Add assignee"
                    >
                      <option value="" disabled hidden>
                        {membersLoading
                          ? 'Loading members…'
                          : projectMembers.length === 0
                            ? 'No members on this project'
                            : 'Select member…'}
                      </option>
                      {projectMembers
                        .filter((m) => !assigneeIds.includes(m.user_id))
                        .map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.label}
                          </option>
                        ))}
                    </ErpNativeSelect>
                    <p className="mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Assign yourself or anyone on this project. Leave empty for unassigned.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {canSetPriority ? (
              <section className="space-y-4">
                <ErpModalSectionTitle>Priority</ErpModalSectionTitle>
                <div className="flex items-center gap-3">
                  <ErpTaskPriorityPicker
                    size="sm"
                    value={normalizeTaskPriority(priority)}
                    onChange={(next) => setPriority(next)}
                    ariaLabel="Task priority"
                  />
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Defaults to Medium. Only admins &amp; leads can set this.
                  </p>
                </div>
              </section>
            ) : null}

            <section className="space-y-4">
              <ErpModalSectionTitle>Attachments</ErpModalSectionTitle>
              <ErpModalAttachmentDropZone
                id="erp-task-files"
                label="Files & media"
                hint={`Documents, images, video or any file · max ${MAX_ATTACHMENTS} · ${ERP_MAX_UPLOAD_MB} MB each`}
                files={attachments}
                onPick={mergeAttachments}
                onRemove={(i) => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                variant="doc"
                compact
              />
            </section>
          </div>

          <ErpModalFooterAlert message={err} />
          <div className={erpModalFooterClass}>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-teal-800/50 dark:bg-[#121f28] dark:text-slate-200 dark:shadow-none dark:hover:bg-[#1a2732]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !projectId || !title.trim()}
              className={erpModalPrimaryButtonClass}
            >
              {saving ? 'Adding…' : 'Add task'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
    </ErpBodyPortal>
  );
}
