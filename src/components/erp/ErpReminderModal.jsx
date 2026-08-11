'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import ErpBodyPortal from './ErpBodyPortal';
import { ErpDateTimeInput } from './ErpDateInput';
import {
  erpModalBackdropClass,
  erpModalFooterClass,
  erpModalPanelClass,
  ErpModalCloseButton,
  erpModalInputClass,
  erpModalTitleInputClass,
  erpModalTextareaClass,
  ErpModalFieldLabel,
  erpModalPrimaryButtonClass,
} from './ErpModalFormPrimitives';
import ErpRichTextField from './ErpWysiwygMarkdownField';
import { prepareRichContentForSave } from '../../lib/rich-text/rich-text-format';
import { isErpGlobalAdmin } from '../../lib/erp-roles';

const datetimeLocalValue = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const datetimeLocalToIso = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

const defaultRemindLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30);
  d.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Create / edit a reminder.
 *
 * Props:
 *  - open: boolean
 *  - reminder: existing row (edit) or null (create)
 *  - currentUserId: string
 *  - profileRole: string
 *  - assignablePeople: { id, full_name }[]
 *  - onClose: () => void
 *  - onSaved: (reminder) => void
 *  - onDeleted: (id) => void
 */
export default function ErpReminderModal({
  open,
  reminder,
  currentUserId,
  profileRole,
  assignablePeople = [],
  onClose,
  onSaved,
  onDeleted,
}) {
  const titleId = useId();
  const isEdit = Boolean(reminder?.id);
  const canAssignOthers = isErpGlobalAdmin(profileRole);
  const canEdit = !reminder?.reminder_sent_at;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [bodyFormat, setBodyFormat] = useState('markdown');
  const [remindLocal, setRemindLocal] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(reminder?.title || '');
    setBody(reminder?.body || '');
    setBodyFormat(reminder?.body_format || 'markdown');
    setRemindLocal(reminder?.remind_at ? datetimeLocalValue(reminder.remind_at) : defaultRemindLocal());
    setAssignedTo(reminder?.assigned_to || currentUserId || '');
    setErr('');
    setConfirmDelete(false);
    setBusy(false);
  }, [open, reminder?.id, reminder?.title, reminder?.body, reminder?.remind_at, reminder?.assigned_to, currentUserId]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (busy) return;
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        setErr('Title is required');
        return;
      }
      const remindAt = datetimeLocalToIso(remindLocal);
      if (!remindAt) {
        setErr('Pick a valid date and time');
        return;
      }
      if (new Date(remindAt).getTime() <= Date.now()) {
        setErr('Reminder must be in the future');
        return;
      }

      setBusy(true);
      setErr('');
      try {
        const preparedBody = prepareRichContentForSave(body);
        const bodyPayload = preparedBody.isEmpty ? '' : preparedBody.body;
        if (isEdit) {
          const data = await updateErpReminder(reminder.id, {
            title: trimmedTitle,
            body: bodyPayload,
            body_format: preparedBody.format,
            remindAt,
          });
          onSaved?.(data.reminder);
        } else {
          const payload = {
            title: trimmedTitle,
            body: bodyPayload,
            body_format: preparedBody.format,
            remindAt,
          };
          if (canAssignOthers && assignedTo && assignedTo !== currentUserId) {
            payload.assignedTo = assignedTo;
          }
          const data = await createErpReminder(payload);
          onSaved?.(data.reminder);
        }
        onClose?.();
      } catch (ex) {
        setErr(ex?.message || 'Could not save reminder');
      } finally {
        setBusy(false);
      }
    },
    [
      assignedTo,
      body,
      busy,
      canAssignOthers,
      currentUserId,
      isEdit,
      onClose,
      onSaved,
      remindLocal,
      reminder?.id,
      title,
    ],
  );

  const handleDelete = useCallback(async () => {
    if (!isEdit || !reminder?.id) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await deleteErpReminder(reminder.id);
      onDeleted?.(reminder.id);
      onClose?.();
    } catch (ex) {
      setErr(ex?.message || 'Could not delete reminder');
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }, [confirmDelete, isEdit, onClose, onDeleted, reminder?.id]);

  if (!open) return null;

  return (
    <ErpBodyPortal>
      <div className="fixed inset-0 z-[1200] flex items-end justify-center sm:items-center sm:p-4">
        <button type="button" className={erpModalBackdropClass} aria-label="Close" onClick={onClose} />
        <form
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onSubmit={handleSubmit}
          className={`${erpModalPanelClass} relative z-[1] flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden`}
        >
          <ErpModalCloseButton onClose={onClose} />
          <header className="shrink-0 border-b border-white/10 px-5 py-4 pr-14 sm:px-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/90">
              {isEdit ? 'Edit reminder' : 'New reminder'}
            </p>
            <h2 id={titleId} className="mt-1 text-lg font-bold text-white sm:text-xl">
              {isEdit ? 'Update reminder' : 'Set a reminder'}
            </h2>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            <div>
              <ErpModalFieldLabel htmlFor="erp-reminder-title" required>
                Title
              </ErpModalFieldLabel>
              <input
                id="erp-reminder-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={busy || !canEdit}
                className={erpModalTitleInputClass}
                placeholder="What should we remind you about?"
                maxLength={200}
                required
              />
            </div>

            <div>
              <ErpModalFieldLabel htmlFor="erp-reminder-body" optional>
                Notes
              </ErpModalFieldLabel>
              <div id="erp-reminder-body" className="mt-1">
                <ErpRichTextField
                  value={body}
                  format={bodyFormat}
                  onChange={setBody}
                  disabled={busy || !canEdit}
                  placeholder="Optional details…"
                  minHeight="5rem"
                />
              </div>
            </div>

            <div>
              <ErpModalFieldLabel required>When</ErpModalFieldLabel>
              <ErpDateTimeInput
                value={remindLocal}
                onChange={(e) => setRemindLocal(e.target.value)}
                disabled={busy || !canEdit}
                required
              />
            </div>

            {canAssignOthers && !isEdit ? (
              <div>
                <ErpModalFieldLabel htmlFor="erp-reminder-assignee">Remind</ErpModalFieldLabel>
                <select
                  id="erp-reminder-assignee"
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  disabled={busy}
                  className={erpModalInputClass}
                >
                  <option value={currentUserId}>Myself</option>
                  {assignablePeople
                    .filter((p) => p.id !== currentUserId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name || p.contact_email || p.id}
                      </option>
                    ))}
                </select>
              </div>
            ) : null}

            {isEdit && reminder?.assigned_to && reminder.assigned_to !== currentUserId ? (
              <p className="rounded-xl border border-cyan-200/40 bg-cyan-50/50 px-3 py-2 text-xs text-cyan-900 dark:border-teal-800/50 dark:bg-teal-950/30 dark:text-cyan-100">
                Assigned to{' '}
                <strong>
                  {assignablePeople.find((p) => p.id === reminder.assigned_to)?.full_name || 'team member'}
                </strong>
              </p>
            ) : null}

            {!canEdit ? (
              <p className="rounded-xl border border-amber-200/60 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/35 dark:text-amber-100">
                This reminder has already fired. You can mark it done or delete it, but not reschedule it.
              </p>
            ) : null}

            {err ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900/55 dark:bg-rose-950/40 dark:text-rose-200">
                {err}
              </p>
            ) : null}
          </div>

          <div className={erpModalFooterClass}>
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {isEdit ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wide transition disabled:opacity-50 ${
                    confirmDelete
                      ? 'border-rose-500 bg-rose-600 text-white shadow-md hover:bg-rose-700'
                      : 'border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50 dark:border-rose-900/55 dark:bg-[#121f28] dark:text-rose-200 dark:hover:bg-rose-950/40'
                  }`}
                >
                  {confirmDelete ? 'Click again to confirm' : 'Delete'}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-teal-800/50 dark:bg-[#121f28] dark:text-slate-200 dark:hover:bg-[#1a2732]"
            >
              Cancel
            </button>
            {canEdit ? (
              <button type="submit" disabled={busy} className={erpModalPrimaryButtonClass}>
                {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create reminder'}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </ErpBodyPortal>
  );
}
