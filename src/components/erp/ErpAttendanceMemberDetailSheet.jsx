'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  attendanceAverageForWindow,
  attendanceRowNetSeconds,
  formatAttendanceAverageSeconds,
  formatWorkDate,
  localDateString,
} from '../../lib/erp-attendance';
import ErpUserAvatar from './ErpUserAvatar';
import {
  AttendanceHistoryTable,
  AttendanceHoursBarChart,
  buildDailyNetSeriesForRange,
  formatNetHoursShort,
  formatSecondsAsHms,
} from './ErpAttendanceCharts';

/**
 * @param {{
 *   open: boolean,
 *   member: { id: string, full_name?: string | null, role?: string | null } | null,
 *   rows: object[],
 *   rangeFrom: string,
 *   rangeTo: string,
 *   rangeLabel: string,
 *   onClose: () => void,
 *   canEdit?: boolean,
 * }} props
 */
export default function ErpAttendanceMemberDetailSheet({
  open,
  member,
  rows,
  rangeFrom,
  rangeTo,
  rangeLabel,
  onClose,
  canEdit = false,
}) {
  const [detailTab, setDetailTab] = useState('overview');

  const memberId = member?.id;
  const memberRows = useMemo(
    () =>
      [...(rows || [])]
        .filter((r) => r.user_id === memberId)
        .sort((a, b) => String(b.work_date).localeCompare(String(a.work_date))),
    [rows, memberId],
  );

  const todayStr = localDateString();

  useEffect(() => {
    if (!open) setDetailTab('overview');
  }, [open, memberId]);

  const stats = useMemo(() => {
    let completed = 0;
    let missingOut = 0;
    let totalNetSec = 0;
    let totalBreakSec = 0;
    for (const r of memberRows) {
      if (!r.check_out_at) missingOut += 1;
      else completed += 1;
      if (r.check_in_at && memberId) {
        totalNetSec += attendanceRowNetSeconds(r, Date.now(), { uid: memberId, workDate: r.work_date });
      }
      totalBreakSec += Math.max(0, Number(r.break_seconds_total) || 0);
    }
    return {
      completed,
      missingOut,
      totalNetSec,
      totalBreakSec,
      avg7: attendanceAverageForWindow(memberRows, todayStr, 7, Date.now(), { uid: memberId }),
      avg14: attendanceAverageForWindow(memberRows, todayStr, 14, Date.now(), { uid: memberId }),
      avg30: attendanceAverageForWindow(memberRows, todayStr, 30, Date.now(), { uid: memberId }),
    };
  }, [memberRows, memberId, todayStr]);

  const chartSeries = useMemo(
    () => buildDailyNetSeriesForRange(rangeFrom, rangeTo, memberRows, memberId, Date.now()),
    [rangeFrom, rangeTo, memberRows, memberId],
  );

  if (!open || !member) return null;

  const name = member.full_name?.trim() || 'Member';

  return (
    <div className="fixed inset-0 z-[500] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="attendance-member-sheet-title">
      <button type="button" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close panel" />
      <div className="relative flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-teal-900/50 dark:bg-[#0a1018]">
        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-r from-teal-50/80 to-white px-4 py-4 dark:border-teal-900/45 dark:from-[#0d141c] dark:to-[#0a1018] dark:[background-image:none]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <ErpUserAvatar profile={member} size="md" alt={name} />
              <div className="min-w-0">
                <h2 id="attendance-member-sheet-title" className="truncate text-lg font-bold text-slate-900 dark:text-white">
                  {name}
                </h2>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">{rangeLabel}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              Close
            </button>
          </div>

          <div role="tablist" aria-label="Member attendance views" className="mt-3 flex flex-wrap gap-1.5">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'history', label: 'History', count: memberRows.length },
            ].map((tab) => {
              const active = detailTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setDetailTab(tab.id)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    active
                      ? 'bg-[#103D4D] text-white dark:bg-teal-700/90'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-[#101a22] dark:text-slate-300 dark:ring-teal-900/55'
                  }`}
                >
                  {tab.label}
                  {tab.count != null ? (
                    <span className={`rounded-full px-1 text-[9px] tabular-nums ${active ? 'bg-white/20' : 'bg-slate-100 dark:bg-white/10'}`}>
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-width:thin]">
          {detailTab === 'overview' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-teal-200/55 bg-teal-50/50 px-2.5 py-2 dark:border-teal-900/45 dark:bg-[#0e1824]">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-teal-800/80 dark:text-teal-300">Total net</p>
                  <p className="mt-0.5 font-mono text-base font-bold text-[#103D4D] dark:text-white">{formatNetHoursShort(stats.totalNetSec)}</p>
                </div>
                <div className="rounded-xl border border-violet-200/55 bg-violet-50/50 px-2.5 py-2 dark:border-violet-900/45 dark:bg-[#141020]">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-violet-800/80 dark:text-violet-300">Pauses</p>
                  <p className="mt-0.5 font-mono text-base font-bold text-[#103D4D] dark:text-white">{formatNetHoursShort(stats.totalBreakSec)}</p>
                </div>
                <div className="rounded-xl border border-emerald-200/55 bg-emerald-50/50 px-2.5 py-2 dark:border-emerald-900/45 dark:bg-[#101816]">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-800/80 dark:text-emerald-300">Completed</p>
                  <p className="mt-0.5 font-mono text-base font-bold text-[#103D4D] dark:text-white">{stats.completed}</p>
                </div>
                <div className="rounded-xl border border-amber-200/55 bg-amber-50/50 px-2.5 py-2 dark:border-amber-900/45 dark:bg-[#1a1408]">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-amber-800/80 dark:text-amber-300">Missing out</p>
                  <p className="mt-0.5 font-mono text-base font-bold text-[#103D4D] dark:text-white">{stats.missingOut}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Avg 7d', stat: stats.avg7 },
                  { label: 'Avg 14d', stat: stats.avg14 },
                  { label: 'Avg 30d', stat: stats.avg30 },
                ].map(({ label, stat }) => (
                  <div key={label} className="rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5 dark:border-teal-900/35 dark:bg-[#0a1018]">
                    <p className="text-[8px] font-bold uppercase text-slate-500">{label}</p>
                    <p className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                      {stat.workDayCount > 0 ? formatAttendanceAverageSeconds(stat.avgSec) : '—'}
                    </p>
                    <p className="text-[8px] text-slate-500">
                      {stat.workDayCount > 0 ? `${stat.workDayCount} Mon–Sat` : '—'}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 dark:border-teal-900/35 dark:bg-[#0c121a]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold text-slate-800 dark:text-white">Daily hours</p>
                  <span className="text-[9px] font-semibold uppercase text-slate-500">Selected range</span>
                </div>
                <AttendanceHoursBarChart
                  labels={chartSeries.labels}
                  minutes={chartSeries.minutes}
                  dates={chartSeries.dates}
                  compact
                />
              </div>
            </div>
          ) : null}

          {detailTab === 'history' ? (
            <div>
              <AttendanceHistoryTable rows={memberRows} uid={memberId} showBreaks />
              {canEdit ? (
                <p className="mt-2 text-[10px] text-slate-500">Use Edit on a row in the main table to change times.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
