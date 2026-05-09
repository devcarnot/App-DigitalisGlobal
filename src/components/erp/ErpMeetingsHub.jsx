'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useErpSession } from './useErpSession';
import { isErpGlobalAdmin } from '../../lib/erp-roles';
import { ERP_DARK_PRIMARY_BUTTON } from '../../lib/erp-dark-surfaces';
import ErpMeetingsList from './ErpMeetingsList';
import ErpMeetingsCalendarView from './ErpMeetingsCalendarView';
import ErpScheduleMeetingModal from './ErpScheduleMeetingModal';
import { getErpMeeting } from '../../lib/erp-meetings-client';

const VIEW_STORAGE_KEY = 'erp:meetingsHubView';

/**
 * Top-level Meetings hub. Standalone page wrapper around <ErpMeetingsList />
 * with the schedule / edit modal wired up plus the project + roster context
 * the list and modal need.
 */
export default function ErpMeetingsHub() {
  const { session, profile } = useErpSession();
  const [projects, setProjects] = useState([]);
  const [projectsById, setProjectsById] = useState({});
  const [nameById, setNameById] = useState({});
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [editingAttendees, setEditingAttendees] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [defaultProjectId, setDefaultProjectId] = useState('');

  const userId = session?.user?.id || null;
  const canSchedule = profile?.role && profile.role !== 'client';
  const isAdmin = profile?.role === 'admin';
  const [view, setView] = useState('list');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === 'calendar' || stored === 'list') setView(stored);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const switchView = useCallback((next) => {
    setView(next);
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* ignore quota / privacy errors */
    }
  }, []);

  // Load projects the user can see (for the project selector + label lookup).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        if (isErpGlobalAdmin(profile?.role)) {
          const { data } = await supabase
            .from('erp_projects')
            .select('id, name')
            .order('name', { ascending: true })
            .limit(500);
          if (!cancelled) {
            const list = data || [];
            setProjects(list);
            const m = {};
            for (const p of list) m[p.id] = p;
            setProjectsById(m);
          }
        } else {
          const { data: mems } = await supabase
            .from('erp_project_members')
            .select('project_id')
            .eq('user_id', userId);
          const ids = [...new Set((mems || []).map((r) => r.project_id).filter(Boolean))];
          if (ids.length === 0) {
            if (!cancelled) {
              setProjects([]);
              setProjectsById({});
            }
            return;
          }
          const { data } = await supabase
            .from('erp_projects')
            .select('id, name')
            .in('id', ids)
            .order('name', { ascending: true });
          if (!cancelled) {
            const list = data || [];
            setProjects(list);
            const m = {};
            for (const p of list) m[p.id] = p;
            setProjectsById(m);
          }
        }
      } catch {
        /* non-fatal — hub still renders without project context */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, profile?.role]);

  // Load roster (just id → full_name) so attendee chips read properly.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('erp_profiles')
          .select('id, full_name')
          .limit(1000);
        if (!cancelled) {
          const m = {};
          for (const p of data || []) m[p.id] = p.full_name || 'Member';
          setNameById(m);
        }
      } catch {
        /* roster lookup is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Deep-link: ?id=<meeting_id> opens the meeting in edit mode if you can manage it.
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    const params = new URL(window.location.href).searchParams;
    const id = params.get('id');
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const { meeting, attendees, canManage } = await getErpMeeting(id);
        if (cancelled) return;
        if (canManage) {
          setEditingMeeting(meeting);
          setEditingAttendees(attendees || []);
          setScheduleOpen(true);
        }
      } catch {
        /* meeting not visible / not found — ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleScheduleClick = useCallback(() => {
    setEditingMeeting(null);
    setEditingAttendees([]);
    setDefaultProjectId('');
    setScheduleOpen(true);
  }, []);

  const handleEditMeeting = useCallback(async (meeting) => {
    try {
      const { meeting: m, attendees } = await getErpMeeting(meeting.id);
      setEditingMeeting(m);
      setEditingAttendees(attendees || []);
      setDefaultProjectId(m.project_id || '');
      setScheduleOpen(true);
    } catch {
      /* If load fails, fall back to the row data we already have. */
      setEditingMeeting(meeting);
      setEditingAttendees([]);
      setDefaultProjectId(meeting.project_id || '');
      setScheduleOpen(true);
    }
  }, []);

  const handleScheduled = useCallback(() => {
    setReloadKey((n) => n + 1);
  }, []);

  const handleClose = useCallback(() => {
    setScheduleOpen(false);
    setEditingMeeting(null);
    setEditingAttendees([]);
  }, []);

  const headerActions = useMemo(
    () => (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div
          role="tablist"
          aria-label="Meetings view"
          className="inline-flex overflow-hidden rounded-full border border-slate-300/85 bg-white text-[11px] font-bold uppercase tracking-wide shadow-sm dark:border-teal-900/55 dark:bg-[#101a22] dark:[background-image:none]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === 'list'}
            onClick={() => switchView('list')}
            className={`px-3 py-1.5 transition ${
              view === 'list'
                ? 'bg-teal-600 text-white shadow-inner dark:bg-teal-700'
                : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-[#16242e]'
            }`}
          >
            List
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'calendar'}
            onClick={() => switchView('calendar')}
            className={`border-l border-slate-300/85 px-3 py-1.5 transition dark:border-teal-900/55 ${
              view === 'calendar'
                ? 'bg-teal-600 text-white shadow-inner dark:bg-teal-700'
                : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-[#16242e]'
            }`}
          >
            Calendar
          </button>
        </div>
        {canSchedule ? (
          <button
            type="button"
            onClick={handleScheduleClick}
            className={`inline-flex items-center gap-1.5 rounded-full border border-cyan-400/60 px-4 py-2 text-[12px] font-bold text-white shadow-md transition disabled:opacity-50 dark:border-teal-600/55 ${ERP_DARK_PRIMARY_BUTTON}`}
          >
            <span aria-hidden>+</span>
            Schedule meeting
          </button>
        ) : null}
      </div>
    ),
    [canSchedule, handleScheduleClick, switchView, view],
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700/85 dark:text-teal-300/85">
            Schedule
          </p>
          <h1 className="erp-brand-text text-2xl font-extrabold tracking-tight">Meetings</h1>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            Plan a call with your team or a client. Attendees get a notification with the join link.
          </p>
        </div>
        {headerActions}
      </header>

      {view === 'calendar' ? (
        <ErpMeetingsCalendarView
          currentUserId={userId}
          isAdmin={isAdmin}
          projectsById={projectsById}
          nameById={nameById}
          onEdit={handleEditMeeting}
          reloadKey={reloadKey}
        />
      ) : (
        <ErpMeetingsList
          currentUserId={userId}
          projectsById={projectsById}
          nameById={nameById}
          onEdit={handleEditMeeting}
          reloadKey={reloadKey}
        />
      )}

      {scheduleOpen ? (
        <ErpScheduleMeetingModal
          open={scheduleOpen}
          onClose={handleClose}
          onScheduled={handleScheduled}
          projectOptions={projects}
          defaultProjectId={defaultProjectId}
          existing={editingMeeting ? { meeting: editingMeeting, attendees: editingAttendees } : null}
        />
      ) : null}
    </div>
  );
}
