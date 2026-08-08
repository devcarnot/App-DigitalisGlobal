'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { CRM_PIPELINE_STAGES } from '../../lib/erp-crm-pipeline';
import { crmActivityTypeLabel, formatCrmActivityWhen } from '../../lib/erp-crm-activities';
import ErpLeadQuickActionModal from './ErpLeadQuickActionModal';

const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'activity', label: 'Activity' },
  { id: 'notes', label: 'Notes' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'followup', label: 'Follow-up' },
];

function telHref(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : null;
}

/**
 * GHL-style lead detail drawer: details, timeline, notes, tasks, follow-ups.
 */
export default function ErpLeadDetailDrawer({
  open,
  lead,
  platformLabel,
  platformOptions = [],
  canEdit,
  initialTab = 'details',
  onClose,
  onLeadUpdated,
  onActivityLogged,
}) {
  const [tab, setTab] = useState(initialTab);
  const [activities, setActivities] = useState([]);
  const [actLoading, setActLoading] = useState(false);
  const [actErr, setActErr] = useState('');

  const [editCompany, setEditCompany] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editPlatformId, setEditPlatformId] = useState('');
  const [editStage, setEditStage] = useState('new_lead');
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  const [quickKind, setQuickKind] = useState(null);
  const [quickBody, setQuickBody] = useState('');
  const [quickDue, setQuickDue] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickErr, setQuickErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
  }, [open, initialTab, lead?.id]);

  useEffect(() => {
    if (!open || !lead) return;
    setEditCompany(String(lead.company_name ?? '').trim());
    setEditContact(String(lead.contact_name ?? '').trim());
    setEditEmail(String(lead.email ?? '').trim());
    setEditPhone(String(lead.phone ?? '').trim());
    setEditNotes(typeof lead.notes === 'string' ? lead.notes : '');
    setEditPlatformId(lead.platform_id != null ? String(lead.platform_id) : '');
    setEditStage(String(lead.pipeline_stage || 'new_lead'));
    setSaveErr('');
  }, [open, lead]);

  const loadActivities = useCallback(async () => {
    if (!lead?.id) return;
    setActLoading(true);
    setActErr('');
    try {
      const res = await erpAuthorizedFetch(`/api/erp/crm/leads/${lead.id}/activities?limit=80`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not load activity');
      setActivities(Array.isArray(j.activities) ? j.activities : []);
    } catch (e) {
      setActErr(e instanceof Error ? e.message : 'Could not load activity');
      setActivities([]);
    } finally {
      setActLoading(false);
    }
  }, [lead?.id]);

  useEffect(() => {
    if (!open || !lead?.id) return;
    void loadActivities();
  }, [open, lead?.id, loadActivities]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !saveBusy && !quickBusy) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saveBusy, quickBusy, onClose]);

  const notesOnly = useMemo(() => activities.filter((a) => a.activity_type === 'note'), [activities]);
  const tasksOnly = useMemo(() => activities.filter((a) => a.activity_type === 'task'), [activities]);
  const followupsOnly = useMemo(() => activities.filter((a) => a.activity_type === 'meeting'), [activities]);

  async function postActivity(payload) {
    if (!lead?.id || !canEdit) return null;
    const res = await erpAuthorizedFetch(`/api/erp/crm/leads/${lead.id}/activities`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'Could not save activity');
    await loadActivities();
    onActivityLogged?.(lead.id, j.activity);
    return j.activity;
  }

  async function saveDetails(e) {
    e?.preventDefault?.();
    if (!lead?.id || !canEdit || saveBusy) return;
    const company = editCompany.trim();
    if (!company) {
      setSaveErr('Company name is required');
      return;
    }
    setSaveBusy(true);
    setSaveErr('');
    try {
      const res = await erpAuthorizedFetch(`/api/erp/crm/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          companyName: company.slice(0, 240),
          contactName: editContact.trim() ? editContact.trim().slice(0, 200) : null,
          email: editEmail.trim() ? editEmail.trim().slice(0, 320) : null,
          phone: editPhone.trim() ? editPhone.trim().slice(0, 64) : null,
          notes: editNotes.slice(0, 5000),
          platformId: editPlatformId.trim().slice(0, 48) || null,
          pipelineStage: editStage,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not update lead');
      onLeadUpdated?.(j.lead);
      await loadActivities();
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Could not update lead');
    } finally {
      setSaveBusy(false);
    }
  }

  function openQuick(kind) {
    setQuickKind(kind);
    setQuickBody('');
    setQuickDue('');
    setQuickErr('');
  }

  async function submitQuick() {
    if (!quickKind || !lead?.id || quickBusy) return;
    const body = quickBody.trim();
    if (!body) {
      setQuickErr('Please enter details');
      return;
    }
    setQuickBusy(true);
    setQuickErr('');
    try {
      const type = quickKind === 'followup' ? 'meeting' : quickKind;
      const title =
        type === 'note'
          ? 'Note added'
          : type === 'task'
            ? 'Task created'
            : 'Follow-up scheduled';
      await postActivity({
        activityType: type,
        title,
        body,
        meta: quickDue ? { due_at: quickDue } : {},
      });
      setQuickKind(null);
      if (type === 'note') setTab('notes');
      if (type === 'task') setTab('tasks');
      if (type === 'meeting') setTab('followup');
    } catch (e) {
      setQuickErr(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setQuickBusy(false);
    }
  }

  if (!open || !lead) return null;

  const displayName = lead.contact_name || lead.company_name || 'Lead';
  const phoneLink = telHref(lead.phone);

  return (
    <>
      <div className="fixed inset-0 z-[500] flex justify-end" role="dialog" aria-modal="true" aria-label={`Lead ${displayName}`}>
        <button type="button" className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]" onClick={onClose} aria-label="Close panel" />
        <div className="relative flex h-full w-full max-w-[min(100%,32rem)] flex-col border-l border-cyan-200/60 bg-white shadow-[-12px_0_48px_-12px_rgba(16,61,77,0.28)] dark:border-teal-900/55 dark:bg-[#0a121a] sm:max-w-xl">
          <div className="shrink-0 border-b border-cyan-200/50 erp-brand-fill px-4 py-4 text-white shadow-md dark:border-teal-900/50">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold tracking-tight">{lead.company_name}</p>
                {lead.contact_name ? <p className="mt-0.5 truncate text-sm text-cyan-100/90">{lead.contact_name}</p> : null}
                {platformLabel ? <p className="mt-1 text-[11px] font-medium text-cyan-100/75">{platformLabel}</p> : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"
              >
                Close
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {phoneLink ? (
                <a
                  href={phoneLink}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/20"
                  onClick={() => {
                    void postActivity({ activityType: 'call', title: 'Call initiated', body: lead.phone }).catch(() => {});
                  }}
                >
                  Call
                </a>
              ) : null}
              {lead.email ? (
                <a
                  href={`mailto:${encodeURIComponent(lead.email)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/20"
                  onClick={() => {
                    void postActivity({ activityType: 'email', title: 'Email opened', body: lead.email }).catch(() => {});
                  }}
                >
                  Email
                </a>
              ) : null}
              {canEdit ? (
                <>
                  <button type="button" onClick={() => openQuick('note')} className="rounded-lg border border-white/25 bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/20">
                    Note
                  </button>
                  <button type="button" onClick={() => openQuick('task')} className="rounded-lg border border-white/25 bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/20">
                    Task
                  </button>
                  <button type="button" onClick={() => openQuick('followup')} className="rounded-lg border border-white/25 bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/20">
                    Follow-up
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <div className="shrink-0 flex gap-1 overflow-x-auto border-b border-slate-200/80 px-2 py-2 dark:border-teal-900/55 [scrollbar-width:thin]">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={
                  'shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ' +
                  (tab === t.id
                    ? 'bg-indigo-100 text-indigo-950 dark:bg-violet-950/60 dark:text-violet-100'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5')
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4 [scrollbar-width:thin]">
            {tab === 'details' ? (
              <form onSubmit={(e) => void saveDetails(e)} className="space-y-3">
                {saveErr ? (
                  <p className="rounded-lg border border-rose-200 bg-rose-50/90 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/45 dark:bg-rose-950/40 dark:text-rose-200">
                    {saveErr}
                  </p>
                ) : null}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">Company</label>
                  <input
                    value={editCompany}
                    onChange={(e) => setEditCompany(e.target.value)}
                    disabled={!canEdit}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">Contact</label>
                  <input
                    value={editContact}
                    onChange={(e) => setEditContact(e.target.value)}
                    disabled={!canEdit}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    disabled={!canEdit}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">Phone</label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    disabled={!canEdit}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">Stage</label>
                  <select
                    value={editStage}
                    onChange={(e) => setEditStage(e.target.value)}
                    disabled={!canEdit}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-100"
                  >
                    {CRM_PIPELINE_STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">Platform</label>
                  <select
                    value={editPlatformId}
                    onChange={(e) => setEditPlatformId(e.target.value)}
                    disabled={!canEdit}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-100"
                  >
                    {platformOptions.map((p) => (
                      <option key={String(p.id)} value={String(p.id)}>
                        {String(p.label || p.id)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">Card notes</label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    disabled={!canEdit}
                    rows={5}
                    className="mt-1.5 min-h-[6rem] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-relaxed dark:border-teal-900/55 dark:bg-[#0c141c] dark:text-slate-100"
                  />
                </div>
                {canEdit ? (
                  <button type="submit" disabled={saveBusy} className="w-full rounded-xl erp-brand-fill py-2.5 text-sm font-bold text-white disabled:opacity-50">
                    {saveBusy ? 'Saving…' : 'Update lead'}
                  </button>
                ) : null}
              </form>
            ) : null}

            {tab === 'activity' ? (
              <ActivityList activities={activities} loading={actLoading} error={actErr} emptyLabel="No activity yet." />
            ) : null}

            {tab === 'notes' ? (
              <>
                {canEdit ? (
                  <button type="button" onClick={() => openQuick('note')} className="mb-3 w-full rounded-xl border border-dashed border-slate-300 py-2 text-xs font-bold text-slate-600 dark:border-teal-800 dark:text-slate-300">
                    + Add note
                  </button>
                ) : null}
                <ActivityList activities={notesOnly} loading={actLoading} error={actErr} emptyLabel="No notes logged yet." />
              </>
            ) : null}

            {tab === 'tasks' ? (
              <>
                {canEdit ? (
                  <button type="button" onClick={() => openQuick('task')} className="mb-3 w-full rounded-xl border border-dashed border-slate-300 py-2 text-xs font-bold text-slate-600 dark:border-teal-800 dark:text-slate-300">
                    + Add task
                  </button>
                ) : null}
                <ActivityList activities={tasksOnly} loading={actLoading} error={actErr} emptyLabel="No tasks yet." showDue />
              </>
            ) : null}

            {tab === 'followup' ? (
              <>
                {canEdit ? (
                  <button type="button" onClick={() => openQuick('followup')} className="mb-3 w-full rounded-xl border border-dashed border-slate-300 py-2 text-xs font-bold text-slate-600 dark:border-teal-800 dark:text-slate-300">
                    + Schedule follow-up
                  </button>
                ) : null}
                <ActivityList activities={followupsOnly} loading={actLoading} error={actErr} emptyLabel="No follow-ups scheduled." showDue />
              </>
            ) : null}
          </div>
        </div>
      </div>

      <ErpLeadQuickActionModal
        open={Boolean(quickKind)}
        kind={quickKind === 'followup' ? 'meeting' : quickKind}
        leadLabel={lead.company_name}
        busy={quickBusy}
        error={quickErr}
        value={quickBody}
        dueAt={quickDue}
        onChange={setQuickBody}
        onDueChange={setQuickDue}
        onClose={() => !quickBusy && setQuickKind(null)}
        onSubmit={() => void submitQuick()}
      />
    </>
  );
}

function ActivityList({ activities, loading, error, emptyLabel, showDue = false }) {
  if (loading) return <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</p>;
  if (error) {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50/90 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/45 dark:bg-rose-950/40 dark:text-rose-200">
        {error}
      </p>
    );
  }
  if (!activities.length) {
    return <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-3">
      {activities.map((a) => (
        <li key={a.id} className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-3 dark:border-teal-900/55 dark:bg-[#0f1a23]">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-50">{a.title}</p>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {crmActivityTypeLabel(a.activity_type)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{formatCrmActivityWhen(a.created_at)}</p>
          {showDue && a.meta?.due_at ? (
            <p className="mt-1 text-xs font-semibold text-indigo-700 dark:text-violet-200">Due: {formatCrmActivityWhen(a.meta.due_at)}</p>
          ) : null}
          {a.body ? <p className="mt-2 whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{a.body}</p> : null}
        </li>
      ))}
    </ul>
  );
}
