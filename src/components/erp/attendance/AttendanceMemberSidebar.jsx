'use client';

import Link from 'next/link';
import {
  ATTENDANCE_OUTCOME_META,
  attendancePeriodLockLabel,
  computePayrollFlags,
  currentMonthString,
} from '../../../lib/erp-attendance-policy';
import { AttendancePanel } from './AttendancePageFrame';

export default function AttendanceMemberSidebar({
  needsMeItems,
  leaveBalances,
  todayStr,
  rows,
  nowMs,
  uid,
  approvedLeaveDates,
}) {
  const lockLabel = attendancePeriodLockLabel(todayStr);
  const payroll = computePayrollFlags(rows, todayStr, nowMs, { uid, approvedLeaveDates });
  const monthName = (() => {
    const [y, mo] = (todayStr || currentMonthString()).slice(0, 7).split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'long' });
  })();

  return (
    <div className="flex w-full flex-none flex-col gap-3.5 lg:w-[320px]">
      <AttendancePanel className="!p-[15px] sm:!px-[18px]">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Needs me</p>
          <p className="text-[11.5px] text-slate-500">before {lockLabel}</p>
        </div>
        <div className="mt-3 max-h-[252px] overflow-y-auto overscroll-y-contain pr-0.5 [-ms-overflow-style:auto] [scrollbar-width:thin]">
          <div className="flex flex-col gap-2">
          {needsMeItems.length === 0 ? (
            <p className="rounded-lg border border-slate-200/80 px-3 py-2.5 text-[11.5px] text-slate-500 dark:border-teal-900/45">
              No missing punches or unexplained absences in your history.
            </p>
          ) : (
            needsMeItems.map((item) => {
              const meta = ATTENDANCE_OUTCOME_META[item.kind === 'missing' ? 'missing' : 'absent'];
              return (
                <div
                  key={`${item.kind}-${item.dateStr}`}
                  className={`rounded-lg border px-3 py-2.5 ${
                    item.kind === 'absent'
                      ? 'border-orange-200/80 bg-orange-50/40 dark:border-orange-900/40 dark:bg-orange-950/20'
                      : 'border-slate-200 dark:border-teal-900/45'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-sm ${item.kind === 'missing' ? 'bg-[repeating-linear-gradient(45deg,#e2e8f0_0_3px,#fff_3px_6px)] border border-slate-300' : meta.cell.split(' ')[0]}`}
                    />
                    <p className="text-[12px] font-semibold">{item.title}</p>
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-snug text-slate-500">
                    {item.kind === 'missing'
                      ? item.body
                      : item.body}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {item.kind === 'missing' ? (
                      <>
                        <button
                          type="button"
                          className="inline-flex h-7 items-center rounded-md erp-brand-fill px-2.5 text-[11.5px] font-semibold text-white"
                        >
                          Request correction
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-medium dark:border-teal-800/45 dark:bg-[#131b24]"
                        >
                          Confirm
                        </button>
                      </>
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
                          className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-medium dark:border-teal-800/45 dark:bg-[#131b24]"
                        >
                          Explain
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
          </div>
        </div>
        {needsMeItems.length > 0 ? (
          <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 dark:border-teal-900/35">
            <p className="text-[11.5px] leading-snug text-slate-500">
              Submitted corrections and excuses appear here once you raise them.
            </p>
          </div>
        ) : null}
      </AttendancePanel>

      {leaveBalances?.length ? (
        <AttendancePanel className="!p-[15px] sm:!px-[18px]">
          <div className="flex items-baseline justify-between">
            <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Leave balance</p>
            <Link href="/erp/leave" className="text-[11.5px] font-medium text-[#103D4D] dark:text-teal-200">
              Request leave
            </Link>
          </div>
          <div className="mt-3 flex flex-col gap-2.5">
            {leaveBalances.map((row) => (
              <div key={row.id} className="flex items-center gap-2.5">
                <span className="w-[74px] text-[12px] text-slate-700 dark:text-slate-300">{row.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-[#131b24]">
                  {row.total > 0 ? (
                    <div
                      className="h-full rounded bg-[#103D4D]"
                      style={{ width: `${Math.min(100, (row.used / row.total) * 100)}%` }}
                    />
                  ) : null}
                </div>
                <span className="w-[52px] text-right font-mono text-[12px] font-medium tabular-nums">
                  {row.left} / {row.total}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-slate-100 pt-3 text-[11.5px] leading-snug text-slate-500 dark:border-teal-900/35">
            Approved leave is deducted from these balances. Overtime may convert to comp off per HR policy.
          </p>
        </AttendancePanel>
      ) : null}

      <AttendancePanel className="!p-[15px] sm:!px-[18px]">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white">What {monthName} pays</p>
        <div className="mt-3 space-y-2 text-[12px] text-slate-700 dark:text-slate-300">
          <div className="flex items-baseline gap-2">
            <span className="w-5 font-mono font-semibold text-amber-700">{payroll.lateMarks}</span>
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
        <p className="mt-3 border-t border-slate-100 pt-3 text-[11.5px] leading-snug text-slate-500 dark:border-teal-900/35">
          Nothing is final until HR locks the period on the {lockLabel.split(' ')[1]}th. Clear flagged items above
          to remove deductions.
        </p>
        <p className="mt-2.5 text-[11.5px] leading-snug text-slate-500">
          Your manager sees these same flags for the team; only HR can change a closed record.
        </p>
      </AttendancePanel>
    </div>
  );
}
