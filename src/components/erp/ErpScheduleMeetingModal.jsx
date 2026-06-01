'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  erpModalInputClass,
  erpModalTitleInputClass,
  erpModalSelectClass,
  erpModalTextareaClass,
  ErpModalFieldLabel,
  ErpModalSectionTitle,
  erpModalPanelClass,
  erpModalFooterClass,
  ErpModalFooterAlert,
  erpModalBackdropClass,
  erpModalPrimaryButtonClass,
  ErpModalCloseButton,
  ERP_COMPACT_FILTER_TABLIST_CLASS,
  erpCompactFilterTabClass,
} from './ErpModalFormPrimitives';
import ErpBodyPortal from './ErpBodyPortal';
import ErpNativeSelect from './ErpNativeSelect';
import { ErpDateTimeInput } from './ErpDateInput';
import {
  createErpMeeting,
  listErpMeetingInvitablePeople,
  updateErpMeeting,
} from '../../lib/erp-meetings-client';
import {
  describeTimeZone,
  getAllTimeZones,
  getLocalTimeZone,
  isValidIanaTimeZone,
  ymdHmInZone,
  zonedWallTimeToUTC,
} from '../../lib/erp-timezones';
import { useErpSession } from './useErpSession';

const ERP_ROLE_LABELS = {
  admin: 'Super Admin',
  team_lead: 'Team Manager',
  team_member: 'Member',
  hr: 'HR',
  bd: 'Business Developer',
  client: 'Client',
};

/**
 * Buckets the directory into clickable tabs. Each role gets its own bucket so
 * Team Managers (`team_lead`) and Members (`team_member`) can be filtered
 * independently — they're separate roles even though both are project-team
 * insiders.
 */
const ERP_MEETING_PEOPLE_TABS = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'admin', label: 'Admin', match: (p) => p.role === 'admin' },
  { id: 'hr', label: 'HR', match: (p) => p.role === 'hr' },
  { id: 'bd', label: 'Business', match: (p) => p.role === 'bd' },
  { id: 'team_lead', label: 'Team Manager', match: (p) => p.role === 'team_lead' },
  { id: 'team_member', label: 'Member', match: (p) => p.role === 'team_member' },
  { id: 'client', label: 'Client', match: (p) => p.role === 'client' },
];

function nextRoundedSlot() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 0);
  if (d.getMinutes() === 0 && d.getSeconds() === 0) {
    // bump to next round half-hour
    d.setHours(d.getHours() + 1);
  }
  d.setSeconds(0, 0);
  return d;
}

function PersonRow({ person, selectedRole, onChange, disabled }) {
  const roleLabel = ERP_ROLE_LABELS[person.role] || person.role || 'Member';
  const initials = (person.full_name || person.contact_email || '?')
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-sm transition dark:border-teal-900/45 dark:bg-[#101a22] dark:[background-image:none] ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 text-[11px] font-bold uppercase tracking-wide text-teal-900 ring-1 ring-teal-200/60 dark:from-teal-900 dark:to-cyan-950 dark:text-teal-100 dark:ring-teal-800/55">
          {initials || '·'}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {person.full_name || person.contact_email || 'Unknown'}
          </p>
          <p className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
              {roleLabel}
            </span>{' '}
            {person.contact_email || ''}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 rounded-lg border border-slate-200 bg-slate-50/80 p-0.5 text-[10px] font-bold uppercase tracking-wide dark:border-slate-700/70 dark:bg-slate-900/50">
        {[
          { id: 'none', label: 'Skip' },
          { id: 'required', label: 'Required' },
          { id: 'optional', label: 'Optional' },
        ].map((opt) => (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            className={`rounded-md px-2 py-1 transition ${
              selectedRole === opt.id
                ? 'bg-teal-500 text-white shadow-sm dark:bg-teal-600'
                : 'text-slate-600 hover:bg-white/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </li>
  );
}

/**
 * Schedule (or edit) a meeting. When `existing` is provided the dialog opens
 * pre-populated for editing.
 *
 * Props:
 *   open, onClose
 *   onScheduled(meetingResponse) — called after a successful create/update
 *   projectOptions: [{ id, name }]
 *   defaultProjectId? — pre-select this project (e.g. when opened from a project workspace)
 *   existing? — { meeting, attendees } from the API to edit
 */
export default function ErpScheduleMeetingModal({
  open,
  onClose,
  onScheduled,
  projectOptions = [],
  defaultProjectId = '',
  existing = null,
}) {
  const { profile } = useErpSession();
  const isEditing = Boolean(existing?.meeting?.id);
  /** Clients + team members can only invite team_lead/team_member of a
   * project they belong to, so the project field is mandatory for them. */
  const isProjectTeamOnly =
    profile?.role === 'client' ||
    profile?.role === 'client_team_member' ||
    profile?.role === 'team_member';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [timeZone, setTimeZone] = useState(() => getLocalTimeZone());
  const [duration, setDuration] = useState(30);
  const [projectId, setProjectId] = useState('');
  const [generateJitsi, setGenerateJitsi] = useState(true);
  const [locationUrl, setLocationUrl] = useState('');
  const [locationText, setLocationText] = useState('');
  const [people, setPeople] = useState([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleErr, setPeopleErr] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  /** Map<userId, 'required'|'optional'|'none'> */
  const [selection, setSelection] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // (Re)initialize fields whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setErr('');
    setSearch('');
    setActiveTab('all');
    if (existing?.meeting) {
      const m = existing.meeting;
      // Prefer the timezone the meeting was originally scheduled in so the
      // wall-clock the organizer typed is the wall-clock they see again.
      const initialZone = isValidIanaTimeZone(m.time_zone) ? m.time_zone : getLocalTimeZone();
      setTimeZone(initialZone);
      setTitle(m.title || '');
      setDescription(m.description || '');
      setScheduledAt(m.scheduled_at ? ymdHmInZone(new Date(m.scheduled_at), initialZone) : '');
      setDuration(m.duration_minutes || 30);
      setProjectId(m.project_id || '');
      setGenerateJitsi(Boolean(m.jitsi_room));
      setLocationUrl(m.location_url || '');
      setLocationText(m.location_text || '');
      const sel = {};
      for (const a of existing.attendees || []) {
        if (a.role === 'organizer') continue;
        if (a.role === 'optional') sel[a.user_id] = 'optional';
        else sel[a.user_id] = 'required';
      }
      setSelection(sel);
    } else {
      const localZone = getLocalTimeZone();
      setTimeZone(localZone);
      setTitle('');
      setDescription('');
      setScheduledAt(ymdHmInZone(nextRoundedSlot(), localZone));
      setDuration(30);
      setProjectId(defaultProjectId || '');
      setGenerateJitsi(true);
      setLocationUrl('');
      setLocationText('');
      setSelection({});
    }
  }, [open, existing?.meeting?.id, defaultProjectId]);

  // Load directory whenever the modal opens or project scope changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPeopleLoading(true);
    setPeopleErr('');
    listErpMeetingInvitablePeople(projectId || null)
      .then((rows) => {
        if (!cancelled) setPeople(rows);
      })
      .catch((e) => {
        if (!cancelled) setPeopleErr(e?.message || 'Could not load directory');
      })
      .finally(() => {
        if (!cancelled) setPeopleLoading(false);
      });
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

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => {
      const name = String(p.full_name || '').toLowerCase();
      const email = String(p.contact_email || '').toLowerCase();
      const role = String(p.role || '').toLowerCase();
      return name.includes(q) || email.includes(q) || role.includes(q);
    });
  }, [people, search]);

  /**
   * For each tab, the slice of `filteredPeople` it covers + its count. We
   * compute every tab's count even when inactive so the tab strip can show
   * badges and so we can fall back to the first non-empty tab if the active
   * tab becomes empty after a search.
   */
  const tabsWithCounts = useMemo(
    () =>
      ERP_MEETING_PEOPLE_TABS.map((tab) => {
        const items = filteredPeople.filter(tab.match);
        return { ...tab, items, count: items.length };
      }),
    [filteredPeople],
  );

  const visiblePeople = useMemo(() => {
    const found = tabsWithCounts.find((t) => t.id === activeTab);
    return found ? found.items : filteredPeople;
  }, [tabsWithCounts, activeTab, filteredPeople]);

  const setPersonRole = useCallback((userId, role) => {
    setSelection((prev) => {
      const next = { ...prev };
      if (role === 'none') {
        delete next[userId];
      } else {
        next[userId] = role;
      }
      return next;
    });
  }, []);

  // Timezone option list — featured zones are surfaced first by `getAllTimeZones`.
  const timeZoneOptions = useMemo(() => getAllTimeZones(), []);
  const localZone = useMemo(() => getLocalTimeZone(), []);

  // Live preview: what does the typed wall-clock + chosen timezone look like
  // in the viewer's own zone? We render this so organizers can sanity-check
  // their conversion at a glance.
  const tzPreview = useMemo(() => {
    if (!scheduledAt) return null;
    const effectiveZone = isValidIanaTimeZone(timeZone) ? timeZone : localZone;
    const utc = zonedWallTimeToUTC(scheduledAt, effectiveZone);
    if (!utc || Number.isNaN(utc.getTime())) return null;
    const localLabel = utc.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return {
      localLabel,
      sameAsLocal: effectiveZone === localZone,
      effectiveZone,
    };
  }, [scheduledAt, timeZone, localZone]);

  const summaryCounts = useMemo(() => {
    let req = 0;
    let opt = 0;
    for (const v of Object.values(selection)) {
      if (v === 'required') req += 1;
      if (v === 'optional') opt += 1;
    }
    return { req, opt };
  }, [selection]);

  const handleSubmit = useCallback(
    async (e) => {
      e?.preventDefault?.();
      if (saving) return;
      if (!title.trim()) {
        setErr('Please give the meeting a title.');
        return;
      }
      if (!scheduledAt) {
        setErr('Pick a date and time.');
        return;
      }
      // Always interpret the typed wall-clock through the chosen timezone so a
      // "3 PM in client's zone" entry produces the right UTC instant without
      // the organizer doing manual math.
      const effectiveZone = isValidIanaTimeZone(timeZone) ? timeZone : getLocalTimeZone();
      const startDate = zonedWallTimeToUTC(scheduledAt, effectiveZone);
      if (!startDate || Number.isNaN(startDate.getTime())) {
        setErr('Invalid scheduled time.');
        return;
      }
      if (isProjectTeamOnly && !projectId) {
        setErr('Please link a project — you can only invite team managers or members of a project.');
        return;
      }
      setSaving(true);
      setErr('');
      const requiredIds = Object.entries(selection)
        .filter(([, v]) => v === 'required')
        .map(([id]) => id);
      const optionalIds = Object.entries(selection)
        .filter(([, v]) => v === 'optional')
        .map(([id]) => id);

      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        scheduledAt: startDate.toISOString(),
        timeZone: effectiveZone,
        durationMinutes: Number(duration) || 30,
        projectId: projectId || null,
        locationUrl: locationUrl.trim() || undefined,
        locationText: locationText.trim() || undefined,
        attendeeIds: requiredIds,
        optionalAttendeeIds: optionalIds,
        generateJitsi,
      };

      try {
        const res = isEditing
          ? await updateErpMeeting(existing.meeting.id, payload)
          : await createErpMeeting(payload);
        onScheduled?.(res);
        onClose?.();
      } catch (e2) {
        setErr(e2?.message || 'Could not save meeting.');
      } finally {
        setSaving(false);
      }
    },
    [
      saving,
      title,
      scheduledAt,
      timeZone,
      duration,
      description,
      projectId,
      locationText,
      locationUrl,
      generateJitsi,
      selection,
      isEditing,
      isProjectTeamOnly,
      existing?.meeting?.id,
      onScheduled,
      onClose,
    ],
  );

  if (!open) return null;

  return (
    <ErpBodyPortal>
      <div className="fixed inset-0 z-[100] flex items-stretch justify-center p-0 sm:p-4">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={erpModalBackdropClass}
        />
        <form onSubmit={handleSubmit} className={erpModalPanelClass}>
          <div className="relative shrink-0 border-b border-slate-200/90 bg-gradient-to-r from-[#103D4D] to-teal-700 px-5 py-4 text-white dark:border-teal-900/55 dark:from-[#0e2c3a] dark:to-teal-900 dark:[background-image:none]">
            <ErpModalCloseButton onClose={onClose} />
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
              {isEditing ? 'Edit meeting' : 'Schedule a meeting'}
            </p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight">
              {isEditing ? existing?.meeting?.title || 'Edit meeting' : 'New meeting'}
            </h2>
          </div>

          <div className="flex flex-1 min-h-0 flex-col gap-5 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <div>
              <ErpModalFieldLabel htmlFor="meet-title" required>
                Title
              </ErpModalFieldLabel>
              <input
                id="meet-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Kick-off — discuss timeline"
                className={erpModalTitleInputClass}
                maxLength={160}
                autoFocus
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              <div>
                <ErpModalFieldLabel htmlFor="meet-when" required>
                  Date &amp; time
                </ErpModalFieldLabel>
                <ErpDateTimeInput
                  id="meet-when"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className={erpModalInputClass}
                />
              </div>
              <div>
                <ErpModalFieldLabel htmlFor="meet-duration">Duration (minutes)</ErpModalFieldLabel>
                <ErpNativeSelect
                  id="meet-duration"
                  value={String(duration)}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className={erpModalSelectClass}
                >
                  {[15, 30, 45, 60, 90, 120, 180].map((n) => (
                    <option key={n} value={n}>
                      {n} min
                    </option>
                  ))}
                </ErpNativeSelect>
              </div>
              <div className="sm:col-span-2 md:col-span-1">
                <div className="flex items-baseline justify-between gap-2">
                  <ErpModalFieldLabel htmlFor="meet-tz">Timezone</ErpModalFieldLabel>
                  {timeZone !== localZone ? (
                    <button
                      type="button"
                      onClick={() => setTimeZone(localZone)}
                      className="text-[10px] font-bold uppercase tracking-wide text-teal-700 hover:underline dark:text-teal-300"
                    >
                      Use my local
                    </button>
                  ) : null}
                </div>
                <ErpNativeSelect
                  id="meet-tz"
                  value={timeZone}
                  onChange={(e) => setTimeZone(e.target.value)}
                  className={erpModalSelectClass}
                >
                  {timeZoneOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {describeTimeZone(tz)}
                    </option>
                  ))}
                </ErpNativeSelect>
              </div>
            </div>

            {tzPreview ? (
              <p className="-mt-3 text-[11px] font-medium leading-relaxed text-slate-500 dark:text-slate-400">
                {tzPreview.sameAsLocal ? (
                  <>Times shown in your local timezone ({describeTimeZone(localZone)}).</>
                ) : (
                  <>
                    Entered as <span className="font-bold text-slate-700 dark:text-slate-200">{describeTimeZone(tzPreview.effectiveZone)}</span>
                    {' · '}
                    Your local time:{' '}
                    <span className="font-bold text-slate-700 dark:text-slate-200">{tzPreview.localLabel}</span>
                  </>
                )}
              </p>
            ) : null}

            <div>
              <ErpModalFieldLabel htmlFor="meet-project" required={isProjectTeamOnly} optional={!isProjectTeamOnly}>
                Project
              </ErpModalFieldLabel>
              <ErpNativeSelect
                id="meet-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={erpModalSelectClass}
              >
                {isProjectTeamOnly ? (
                  <option value="">— Pick a project —</option>
                ) : (
                  <option value="">— No project link —</option>
                )}
                {(projectOptions || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </ErpNativeSelect>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {isProjectTeamOnly
                  ? 'You can only invite team managers or members of the project you link.'
                  : 'Linking a project filters the directory below to project members and clients.'}
              </p>
            </div>

            <div>
              <ErpModalFieldLabel htmlFor="meet-desc" optional>
                Agenda / notes
              </ErpModalFieldLabel>
              <textarea
                id="meet-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Talking points, prep links, etc."
                className={erpModalTextareaClass}
                rows={3}
              />
            </div>

            <div className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-3.5 dark:border-teal-900/45 dark:bg-[#0c151c]">
              <ErpModalSectionTitle>Conferencing</ErpModalSectionTitle>
              <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={generateJitsi}
                  onChange={(e) => setGenerateJitsi(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm leading-snug text-slate-700 dark:text-slate-200">
                  Auto-generate a Jitsi room for this meeting.
                  <span className="ml-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Attendees get a one-click join link in the meeting card.
                  </span>
                </span>
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <ErpModalFieldLabel htmlFor="meet-loc-url" optional small>
                    External link (Zoom, Meet, …)
                  </ErpModalFieldLabel>
                  <input
                    id="meet-loc-url"
                    type="url"
                    value={locationUrl}
                    onChange={(e) => setLocationUrl(e.target.value)}
                    className={erpModalInputClass}
                    placeholder="https://…"
                  />
                </div>
                <div>
                  <ErpModalFieldLabel htmlFor="meet-loc-text" optional small>
                    Location / room
                  </ErpModalFieldLabel>
                  <input
                    id="meet-loc-text"
                    type="text"
                    value={locationText}
                    onChange={(e) => setLocationText(e.target.value)}
                    className={erpModalInputClass}
                    placeholder="Meeting Room 4 / 3rd floor"
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <ErpModalSectionTitle>
                  Invite people · {summaryCounts.req + summaryCounts.opt} selected
                </ErpModalSectionTitle>
                <span className="text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                  {summaryCounts.req} required · {summaryCounts.opt} optional
                </span>
              </div>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, or role…"
                className={`${erpModalInputClass} mb-3`}
              />
              {peopleErr ? (
                <p className="rounded-lg border border-rose-300/70 bg-rose-50/80 px-3 py-2 text-xs text-rose-800 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-200">
                  {peopleErr}
                </p>
              ) : null}
              {peopleLoading ? (
                <p className="rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-xs text-slate-500 dark:border-teal-900/45 dark:bg-[#0e1824] dark:text-slate-400">
                  Loading directory…
                </p>
              ) : null}
              {!peopleLoading && filteredPeople.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300/70 bg-slate-50/40 px-3 py-3 text-center text-xs text-slate-500 dark:border-teal-900/55 dark:bg-[#0c151c] dark:text-slate-400">
                  {isProjectTeamOnly && !projectId
                    ? 'Pick a project above — you can only invite team managers or members of a project you belong to.'
                    : 'No people match this filter.'}
                </p>
              ) : null}

              {!peopleLoading && filteredPeople.length > 0 ? (
                <>
                  <div
                    role="tablist"
                    aria-label="Filter people by role"
                    className={`mb-2 ${ERP_COMPACT_FILTER_TABLIST_CLASS}`}
                  >
                    {tabsWithCounts.map((tab) => {
                      const isActive = activeTab === tab.id;
                      const isEmpty = tab.count === 0;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          disabled={isEmpty && !isActive}
                          onClick={() => setActiveTab(tab.id)}
                          className={[
                            erpCompactFilterTabClass(isActive),
                            isEmpty && !isActive ? 'opacity-45 cursor-not-allowed' : '',
                          ].join(' ')}
                        >
                          {tab.label}{' '}
                          <span className="tabular-nums opacity-90">({tab.count})</span>
                        </button>
                      );
                    })}
                  </div>
                  {visiblePeople.length > 0 ? (
                    <ul className="space-y-1.5">
                      {visiblePeople.map((p) => (
                        <PersonRow
                          key={p.id}
                          person={p}
                          selectedRole={selection[p.id] || 'none'}
                          onChange={(role) => setPersonRole(p.id, role)}
                          disabled={saving}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-300/70 bg-slate-50/40 px-3 py-3 text-center text-xs text-slate-500 dark:border-teal-900/55 dark:bg-[#0c151c] dark:text-slate-400">
                      No people in this group.
                    </p>
                  )}
                </>
              ) : null}
            </div>

          </div>

          <ErpModalFooterAlert message={err} />
          <div className={erpModalFooterClass}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-300/90 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-teal-900/55 dark:bg-[#101a22] dark:text-slate-200 dark:hover:bg-[#16242e] dark:[background-image:none]"
            >
              Cancel
            </button>
            <button type="submit" className={erpModalPrimaryButtonClass} disabled={saving}>
              {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Schedule meeting'}
            </button>
          </div>
        </form>
      </div>
    </ErpBodyPortal>
  );
}
