'use client';

import { useCallback, useState } from 'react';
import ErpMeetingsList from './ErpMeetingsList';
import ErpScheduleMeetingModal from './ErpScheduleMeetingModal';
import { getErpMeeting } from '../../lib/erp-meetings-client';
import { ERP_DARK_PRIMARY_BUTTON } from '../../lib/erp-dark-surfaces';

/**
 * Meetings section embedded in the project workspace.
 * Lists meetings scoped to this project and lets organizers schedule new ones
 * with the project pre-selected.
 *
 * Props:
 *   projectId  — required, the current project id
 *   projectName? — used to label the section
 *   currentUserId
 *   canSchedule — whether the user can organize (clients cannot)
 *   nameById?: Record<id, fullName>
 *   projectsById?: Record<id, { name }>
 */
export default function ErpProjectMeetingsSection({
  projectId,
  projectName,
  currentUserId,
  canSchedule,
  nameById = {},
  projectsById = {},
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingAttendees, setEditingAttendees] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  const handleEdit = useCallback(async (meeting) => {
    try {
      const { meeting: m, attendees } = await getErpMeeting(meeting.id);
      setEditing(m);
      setEditingAttendees(attendees || []);
      setOpen(true);
    } catch {
      setEditing(meeting);
      setEditingAttendees([]);
      setOpen(true);
    }
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setEditing(null);
    setEditingAttendees([]);
  }, []);

  const handleScheduled = useCallback(() => {
    setReloadKey((n) => n + 1);
  }, []);

  const projectOptions =
    projectId
      ? [{ id: projectId, name: projectName || projectsById[projectId]?.name || 'This project' }]
      : [];

  return (
    <section aria-label="Project meetings" className="space-y-2 min-w-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-0.5 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-6 w-1 rounded-full erp-brand-fill" aria-hidden />
          <h2 className="erp-brand-text text-[11px] font-extrabold uppercase tracking-[0.14em]">
            Meetings
          </h2>
        </div>
        {canSchedule ? (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setEditingAttendees([]);
              setOpen(true);
            }}
            className={`inline-flex items-center gap-1.5 rounded-full border border-cyan-400/60 px-3.5 py-1.5 text-[11px] font-bold text-white shadow-md transition disabled:opacity-50 dark:border-teal-600/55 ${ERP_DARK_PRIMARY_BUTTON}`}
          >
            <span aria-hidden>+</span>
            Schedule meeting
          </button>
        ) : null}
      </div>
      <ErpMeetingsList
        currentUserId={currentUserId}
        projectsById={projectsById}
        nameById={nameById}
        projectId={projectId}
        onEdit={handleEdit}
        reloadKey={reloadKey}
      />
      {open ? (
        <ErpScheduleMeetingModal
          open={open}
          onClose={handleClose}
          onScheduled={handleScheduled}
          projectOptions={projectOptions}
          defaultProjectId={projectId}
          existing={editing ? { meeting: editing, attendees: editingAttendees } : null}
        />
      ) : null}
    </section>
  );
}
