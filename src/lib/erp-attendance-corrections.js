import { supabase } from './supabase';
import { ERP_ATTENDANCE_TIMEZONE, isAttendanceWorkWeekday } from './erp-attendance';
import { ERP_ATTENDANCE_POLICY } from './erp-attendance-policy';

export const ATTENDANCE_CORRECTION_STATUS_META = {
  pending: { label: 'pending', tone: 'text-amber-700 dark:text-amber-300' },
  approved: { label: 'approved', tone: 'text-emerald-700 dark:text-emerald-300 font-semibold' },
  rejected: { label: 'rejected', tone: 'text-red-600 dark:text-red-400' },
  cancelled: { label: 'cancelled', tone: 'text-slate-500' },
};

export function defaultCheckoutLocalValue(workDateStr) {
  const wd = String(workDateStr || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wd)) return '';
  const h = String(ERP_ATTENDANCE_POLICY.shiftEndHour).padStart(2, '0');
  const m = String(ERP_ATTENDANCE_POLICY.shiftEndMinute).padStart(2, '0');
  return `${wd}T${h}:${m}`;
}

export function defaultCheckInLocalValue(workDateStr) {
  const wd = String(workDateStr || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wd)) return '';
  const h = String(ERP_ATTENDANCE_POLICY.shiftStartHour).padStart(2, '0');
  const m = String(ERP_ATTENDANCE_POLICY.shiftStartMinute).padStart(2, '0');
  return `${wd}T${h}:${m}`;
}

export function formatCorrectionClock(iso) {
  if (!iso) return '—';
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  return new Intl.DateTimeFormat(undefined, {
    timeZone: ERP_ATTENDANCE_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

export function formatCorrectionSubmittedLabel(row) {
  const created = row?.created_at ? new Date(row.created_at) : null;
  const submitted =
    created && !Number.isNaN(created.getTime())
      ? created.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '—';
  if (row?.kind === 'missing_checkout') {
    return `Submitted ${submitted} · check-out ${formatCorrectionClock(row.requested_check_out_at)}`;
  }
  if (row?.kind === 'forgot_punch') {
    return `Submitted ${submitted} · in ${formatCorrectionClock(row.requested_check_in_at)} · out ${formatCorrectionClock(row.requested_check_out_at)}`;
  }
  if (row?.kind === 'adjust_times') {
    return `Submitted ${submitted} · adjust to in ${formatCorrectionClock(row.requested_check_in_at)} · out ${formatCorrectionClock(row.requested_check_out_at)}`;
  }
  return `Submitted ${submitted} · absent explanation`;
}

function formatCorrectionDayTitle(dateStr) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Whether a calendar/chart day can open the correction menu. */
export function isAttendanceDayClickable({ dateStr, outcome, todayStr }) {
  const d = String(dateStr || '').slice(0, 10);
  const today = String(todayStr || '').slice(0, 10);
  if (!d || !today || d >= today) return false;
  if (!isAttendanceWorkWeekday(d)) return false;
  return outcome !== 'leave' && outcome !== 'off' && outcome !== 'future';
}

/** @returns {{ requestKind: string, label: string, description: string }[]} */
export function correctionOptionsForDay({ dateStr, row, outcome, todayStr }) {
  if (!isAttendanceDayClickable({ dateStr, outcome, todayStr })) return [];

  const hasIn = Boolean(row?.check_in_at);
  const hasOut = Boolean(row?.check_out_at);
  const opts = [];

  if (hasIn && hasOut) {
    opts.push({
      requestKind: 'adjust_times',
      label: 'Request time correction (check-in & check-out)',
      description: 'Fix incorrect punch times for this day',
    });
  }

  if ((hasIn && !hasOut) || outcome === 'missing' || outcome === 'open') {
    opts.push({
      requestKind: 'missing_checkout',
      label: 'Request check-out correction',
      description: 'You checked in but forgot to check out',
    });
  }

  if (!hasIn && !hasOut) {
    opts.push({
      requestKind: 'forgot_punch',
      label: 'Request correction (check-in & check-out)',
      description: 'You were at work but forgot to punch — e.g. came at 10 AM, remembered at 4 PM',
    });
    opts.push({
      requestKind: 'absent_explain',
      label: 'Explain absence',
      description: 'You were not at work that day',
    });
  }

  const seen = new Set();
  return opts.filter((o) => {
    if (seen.has(o.requestKind)) return false;
    seen.add(o.requestKind);
    return true;
  });
}

export function buildCorrectionItemFromDay({ dateStr, row, requestKind }) {
  const dayTitle = formatCorrectionDayTitle(dateStr);
  const kind = requestKind === 'missing_checkout' ? 'missing' : 'absent';
  const titles = {
    missing_checkout: `Missing punch · ${dayTitle}`,
    forgot_punch: `Absent · ${dayTitle}`,
    absent_explain: `Absent · ${dayTitle}`,
    adjust_times: `Time correction · ${dayTitle}`,
  };
  const bodies = {
    missing_checkout: 'Request the check-out time to be recorded after admin review.',
    forgot_punch: 'Enter when you arrived and left — admin will review before applying.',
    absent_explain: 'Tell your manager why you were absent.',
    adjust_times: 'Enter the correct check-in and check-out times for this day.',
  };
  return {
    kind,
    requestKind,
    dateStr: String(dateStr).slice(0, 10),
    attendanceDayId: row?.id || null,
    attendanceRow: row || null,
    title: titles[requestKind] || dayTitle,
    body: bodies[requestKind] || '',
  };
}

export async function submitAttendanceCorrection({
  workDate,
  kind,
  requestedCheckOutIso,
  requestedCheckInIso,
  memberNote,
  attendanceDayId,
}) {
  const { data, error } = await supabase.rpc('erp_attendance_submit_correction_pk', {
    p_work_date: String(workDate).slice(0, 10),
    p_kind: kind,
    p_requested_check_out_at: requestedCheckOutIso || null,
    p_member_note: memberNote || null,
    p_attendance_day_id: attendanceDayId || null,
    p_requested_check_in_at: requestedCheckInIso || null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function reviewAttendanceCorrection(id, action, reviewerNote) {
  const { data, error } = await supabase.rpc('erp_attendance_review_correction_pk', {
    p_id: id,
    p_action: action,
    p_reviewer_note: reviewerNote || null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function cancelAttendanceCorrection(id) {
  const { error } = await supabase
    .from('erp_attendance_correction_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);
}
