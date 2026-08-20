'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  attendancePeriodLockLabel,
  computePayrollFlags,
  currentMonthString,
} from '../../../lib/erp-attendance-policy';
import AttendanceCorrectionRequestModal from './AttendanceCorrectionRequestModal';
import { AttendanceCorrectionHistoryLine } from './AttendanceCorrectionAdminQueue';
import { useMemberAttendanceCorrections } from './useErpAttendanceCorrections';
import { AttendancePanel } from './AttendancePageFrame';
import { AttendanceSectionHeader } from './AttendanceViewPageFrame';

function NeedsCard({ tone = 'default', title, body, children }) {
  const tones = {
    default:
      'border-slate-200/90 bg-white dark:border-teal-900/45 dark:bg-[#101824]',
    warn: 'border-amber-200/90 bg-gradient-to-br from-amber-50/90 to-orange-50/40 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-orange-950/10',
    alert:
      'border-rose-200/80 bg-gradient-to-br from-rose-50/70 to-white dark:border-rose-900/40 dark:from-rose-950/25 dark:to-[#101824]',
  };
  const accent = {
    default: 'bg-[#103D4D]',
    warn: 'bg-amber-500',
    alert: 'bg-rose-500',
  };
  return (
    <div className={`relative overflow-hidden rounded-xl border shadow-sm ${tones[tone] || tones.default}`}>
      <div className={`absolute inset-y-0 left-0 w-1 ${accent[tone] || accent.default}`} aria-hidden />
      <div className="px-3.5 py-3 pl-4">
        <p className="text-[12px] font-semibold leading-snug text-slate-900 dark:text-white">{title}</p>
        {body ? <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400">{body}</p> : null}
        {children}
      </div>
    </div>
  );
}

export default function AttendanceMemberSidebar({
  needsMeItems,
  onDismissNeedsMeItem,
  leaveBalances,
  leaveBreakdown,
  todayStr,
  rows,
  nowMs,
  uid,
  approvedLeaveDates,
  onCorrectionsChanged,
}) {
  const [correctionItem, setCorrectionItem] = useState(null);
  const { rows: correctionRows, reload: reloadCorrections } = useMemberAttendanceCorrections(uid);
  const lockLabel = attendancePeriodLockLabel(todayStr);
  const payroll = computePayrollFlags(rows, todayStr, nowMs, { uid, approvedLeaveDates });
  const monthName = (() => {
    const [y, mo] = (todayStr || currentMonthString()).slice(0, 7).split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'long' });
  })();

  const pendingByKey = useMemo(() => {
    const map = new Map();
    for (const row of correctionRows) {
      if (row.status !== 'pending') continue;
      const kind = row.kind === 'missing_checkout' ? 'missing' : 'absent';
      map.set(`${kind}:${String(row.work_date).slice(0, 10)}`, row);
    }
    return map;
  }, [correctionRows]);

  const recentCorrections = useMemo(
    () => correctionRows.filter((r) => r.status !== 'cancelled').slice(0, 4),
    [correctionRows],
  );

  function openCorrection(item) {
    setCorrectionItem(item);
  }

  async function onCorrectionSubmitted() {
    await reloadCorrections();
    onCorrectionsChanged?.();
  }

  return (
    <div className="flex w-full flex-none flex-col gap-3.5 lg:w-[320px]">
      <AttendancePanel flush>
        <AttendanceSectionHeader title="Needs me" subtitle={`before ${lockLabel}`} />
        <div className="max-h-[252px] overflow-y-auto overscroll-y-contain px-4 py-3 sm:px-[18px]">
          <div className="flex flex-col gap-2">
            {needsMeItems.length === 0 ? (
              <p className="rounded-xl border border-slate-200/80 px-3 py-2.5 text-[11.5px] text-slate-500 dark:border-teal-900/45">
                No missing punches or unexplained absences in your history.
              </p>
            ) : (
              needsMeItems.map((item) => {
                const pending = pendingByKey.get(`${item.kind}:${item.dateStr}`);
                return (
                  <NeedsCard
                    key={`${item.kind}-${item.dateStr}`}
                    tone={item.kind === 'absent' ? 'alert' : 'warn'}
                    title={item.title}
                    body={item.body}
                  >
                    <button
                      type="button"
                      onClick={() => onDismissNeedsMeItem?.(item.kind, item.dateStr)}
                      className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-[15px] leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-[#131b24] dark:hover:text-slate-200"
                      aria-label={`Remove ${item.title}`}
                      title="Remove from list"
                    >
                      ×
                    </button>
                    {pending ? (
                      <p className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                        Waiting for admin review…
                      </p>
                    ) : (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {item.kind === 'missing' ? (
                          <button
                            type="button"
                            onClick={() => openCorrection(item)}
                            className="inline-flex h-7 items-center rounded-md erp-brand-fill px-2.5 text-[11.5px] font-semibold text-white"
                          >
                            Request correction
                          </button>
                        ) : (
                          <>
                            <Link
                              href="/erp/leave"
                              className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold dark:border-teal-800/45 dark:bg-[#131b24]"
                            >
                              Apply leave
                            </Link>
                            <button
                              type="button"
                              onClick={() => openCorrection(item)}
                              className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-medium dark:border-teal-800/45 dark:bg-[#131b24]"
                            >
                              Explain
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </NeedsCard>
                );
              })
            )}
          </div>
        </div>
        {recentCorrections.length > 0 ? (
          <div className="space-y-1.5 border-t border-slate-100 px-4 py-3 dark:border-teal-900/35 sm:px-[18px]">
            {recentCorrections.map((row) => (
              <AttendanceCorrectionHistoryLine key={row.id} row={row} />
            ))}
          </div>
        ) : (
          <div className="border-t border-slate-100 px-4 py-3 dark:border-teal-900/35 sm:px-[18px]">
            <p className="text-[11.5px] leading-snug text-slate-500">
              Submitted corrections and excuses appear here once you raise them.
            </p>
          </div>
        )}
      </AttendancePanel>

      {correctionItem ? (
        <AttendanceCorrectionRequestModal
          item={correctionItem}
          onClose={() => setCorrectionItem(null)}
          onSubmitted={onCorrectionSubmitted}
        />
      ) : null}

      {leaveBalances?.length ? (
        <AttendancePanel flush>
          <AttendanceSectionHeader title="Leave balance">
            <Link
              href="/erp/leave"
              className="ml-auto text-[11.5px] font-medium text-[#103D4D] dark:text-teal-200"
            >
              Request leave
            </Link>
          </AttendanceSectionHeader>
          <div className="px-4 py-3 sm:px-[18px]">
            <div className="flex flex-col gap-2.5">
              {leaveBalances.map((row) => (
                <div key={row.id} className="flex items-center gap-2.5">
                  <span className="w-[74px] text-[12px] text-slate-700 dark:text-slate-300">{row.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-[#131b24]">
                    {row.total > 0 ? (
                      <div
                        className="h-full rounded bg-gradient-to-r from-[#103D4D] to-teal-600"
                        style={{ width: `${Math.min(100, (row.used / row.total) * 100)}%` }}
                      />
                    ) : null}
                  </div>
                  <span className="w-[52px] text-right font-mono text-[12px] font-medium tabular-nums">
                    {row.used} / {row.total}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 border-t border-slate-100 pt-3 text-[11.5px] leading-snug text-slate-500 dark:border-teal-900/35">
              {leaveBreakdown?.length ? (
                <>
                  {leaveBreakdown.map((line) => (
                    <span key={line} className="block">
                      {line} is deducted.
                    </span>
                  ))}
                </>
              ) : (
                'No approved leave deducted yet this year.'
              )}
              {leaveBalances?.some((row) => row.pending > 0) ? (
                <span className="mt-1 block text-amber-700 dark:text-amber-300">
                  {leaveBalances
                    .filter((row) => row.pending > 0)
                    .map((row) => `${row.pending} ${row.label.toLowerCase()} day(s) pending approval`)
                    .join(' · ')}
                  .
                </span>
              ) : null}
            </p>
          </div>
        </AttendancePanel>
      ) : null}

      <AttendancePanel flush>
        <AttendanceSectionHeader title={`What ${monthName} pays`} />
        <div className="space-y-2 px-4 py-3 text-[12px] text-slate-700 dark:text-slate-300 sm:px-[18px]">
          <div className="flex items-baseline gap-2">
            <span className="w-5 font-mono font-semibold text-red-700 dark:text-red-400">{payroll.lateMarks}</span>
            <span>late marks</span>
            <span className="ml-auto text-[11px] text-slate-500">3 = ½ day cut</span>
          </div>
          {payroll.unexplainedAbsent > 0 ? (
            <div className="flex items-baseline gap-2">
              <span className="w-5 font-mono font-semibold">{payroll.unexplainedAbsent}</span>
              <span>unexplained absence</span>
              <span className="ml-auto text-[11px] text-slate-500">{payroll.absentLabel}</span>
            </div>
          ) : null}
          {payroll.halfDays > 0 ? (
            <div className="flex items-baseline gap-2">
              <span className="w-5 font-mono font-semibold">{payroll.halfDays}</span>
              <span>half day</span>
              <span className="ml-auto text-[11px] text-slate-500">{payroll.halfLabel}</span>
            </div>
          ) : null}
        </div>
        <p className="border-t border-slate-100 px-4 py-3 text-[11.5px] leading-snug text-slate-500 dark:border-teal-900/35 sm:px-[18px]">
          Nothing is final until HR locks the period on the {lockLabel.split(' ')[1]}th. Clear flagged items above to
          remove deductions.
        </p>
      </AttendancePanel>
    </div>
  );
}
