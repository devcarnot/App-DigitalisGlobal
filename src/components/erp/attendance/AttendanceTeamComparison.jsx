'use client';

import { useMemo } from 'react';
import { aggregateTeamAttendanceStats, formatAttendanceHm } from '../../../lib/erp-attendance-policy';
import ErpExportCsvButton from '../ErpExportCsvButton';
import { AttendancePanel } from './AttendancePageFrame';

export default function AttendanceTeamComparison({
  members,
  attendanceRows,
  fromStr,
  toStr,
  todayStr,
  nowMs,
  leaveByUser,
}) {
  const teams = useMemo(
    () => aggregateTeamAttendanceStats(members, attendanceRows, fromStr, toStr, todayStr, nowMs, leaveByUser),
    [members, attendanceRows, fromStr, toStr, todayStr, nowMs, leaveByUser],
  );

  const totals = useMemo(
    () =>
      teams.reduce(
        (acc, t) => ({
          people: acc.people + t.people,
          full: acc.full + t.full,
          short: acc.short + t.short,
          absent: acc.absent + t.absent,
          late: acc.late + t.late,
          shortfallSec: acc.shortfallSec + t.shortfallSec,
          overtimeSec: acc.overtimeSec + t.overtimeSec,
          openItems: acc.openItems + t.openItems,
        }),
        { people: 0, full: 0, short: 0, absent: 0, late: 0, shortfallSec: 0, overtimeSec: 0, openItems: 0 },
      ),
    [teams],
  );

  const exportRows = [...teams, { team: 'All teams', ...totals }];

  return (
    <AttendancePanel>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
          Teams · {fromStr.slice(5).replace('-', '/')}–{toStr.slice(5).replace('-', '/')}
        </p>
        <p className="text-[11.5px] text-slate-500">comparison across functional teams</p>
        <div className="ml-auto">
          <ErpExportCsvButton
            filename={`attendance-teams-${fromStr}-to-${toStr}`}
            rows={exportRows}
            columns={[
              { header: 'Team', value: (r) => r.team },
              { header: 'People', value: (r) => r.people },
              { header: 'Full days', value: (r) => r.full },
              { header: 'Short', value: (r) => r.short },
              { header: 'Absent', value: (r) => r.absent },
              { header: 'Late arrivals', value: (r) => r.late },
              { header: 'Shortfall', value: (r) => formatAttendanceHm(r.shortfallSec) },
              { header: 'Overtime', value: (r) => formatAttendanceHm(r.overtimeSec) },
              { header: 'Open items', value: (r) => r.openItems },
            ]}
          />
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[880px]">
          <div className="grid grid-cols-[minmax(0,1.4fr)_74px_96px_82px_82px_96px_92px_92px_96px] items-center gap-3 border-b border-slate-200 py-2 dark:border-teal-900/45">
            {['Team', 'People', 'Full days', 'Short', 'Absent', 'Late', 'Shortfall', 'Overtime', 'Open'].map(
              (h, i) => (
                <p
                  key={h}
                  className={`text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500 ${i > 0 ? 'text-right' : ''}`}
                >
                  {h}
                </p>
              ),
            )}
          </div>
          {teams.map((t) => (
            <div
              key={t.team}
              className="grid grid-cols-[minmax(0,1.4fr)_74px_96px_82px_82px_96px_92px_92px_96px] items-center gap-3 border-b border-slate-50 py-2.5 dark:border-teal-900/20"
            >
              <p className="text-[12.5px] font-medium">{t.team}</p>
              <p className="text-right font-mono text-[12px]">{t.people}</p>
              <p className="text-right font-mono text-[12px]">{t.full}</p>
              <p className="text-right font-mono text-[12px]">{t.short}</p>
              <p className="text-right font-mono text-[12px]">{t.absent}</p>
              <p className="text-right font-mono text-[12px] text-orange-700">{t.late}</p>
              <p className="text-right font-mono text-[12px]">{formatAttendanceHm(t.shortfallSec)}</p>
              <p className="text-right font-mono text-[12px] text-violet-700">{formatAttendanceHm(t.overtimeSec)}</p>
              <p className="text-right font-mono text-[12px] font-medium">{t.openItems}</p>
            </div>
          ))}
          <div className="grid grid-cols-[minmax(0,1.4fr)_74px_96px_82px_82px_96px_92px_92px_96px] items-center gap-3 py-2.5">
            <p className="text-[12.5px] font-semibold">All teams</p>
            <p className="text-right font-mono text-[12px] font-semibold">{totals.people}</p>
            <p className="text-right font-mono text-[12px] font-semibold">{totals.full}</p>
            <p className="text-right font-mono text-[12px] font-semibold">{totals.short}</p>
            <p className="text-right font-mono text-[12px] font-semibold">{totals.absent}</p>
            <p className="text-right font-mono text-[12px] font-semibold text-orange-700">{totals.late}</p>
            <p className="text-right font-mono text-[12px] font-semibold">{formatAttendanceHm(totals.shortfallSec)}</p>
            <p className="text-right font-mono text-[12px] font-semibold text-violet-700">
              {formatAttendanceHm(totals.overtimeSec)}
            </p>
            <p className="text-right font-mono text-[12px] font-semibold">{totals.openItems}</p>
          </div>
        </div>
      </div>
    </AttendancePanel>
  );
}
