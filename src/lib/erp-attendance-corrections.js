import { supabase } from './supabase';
import { ERP_ATTENDANCE_TIMEZONE } from './erp-attendance';
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
  return `Submitted ${submitted} · absent explanation`;
}

export async function submitAttendanceCorrection({
  workDate,
  kind,
  requestedCheckOutIso,
  memberNote,
  attendanceDayId,
}) {
  const { data, error } = await supabase.rpc('erp_attendance_submit_correction_pk', {
    p_work_date: String(workDate).slice(0, 10),
    p_kind: kind,
    p_requested_check_out_at: requestedCheckOutIso || null,
    p_member_note: memberNote || null,
    p_attendance_day_id: attendanceDayId || null,
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
