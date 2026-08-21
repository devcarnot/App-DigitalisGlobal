'use client';

import { useMemo, useState } from 'react';
import {
  ATTENDANCE_ARRIVAL_META,
  ATTENDANCE_OUTCOME_META,
  CHART_MAX_HOURS,
  getFullDayNetSeconds,
  classifyAttendanceArrival,
  classifyAttendanceDayOutcome,
  computeMemberMonthStats,
  currentMonthString,
  formatAttendanceHm,
} from '../../../lib/erp-attendance-policy';
import { attendanceRowNetSeconds, dateStringAddDays, isAttendanceWorkWeekday } from '../../../lib/erp-attendance';
import { isAttendanceDayClickable } from '../../../lib/erp-attendance-corrections';
import { useErpSession } from '../useErpSession';
import { AttendanceHistoryTable, formatNetHoursShort } from '../ErpAttendanceCharts';
import { AttendancePanel } from './AttendancePageFrame';
import { AttendanceSectionHeader } from './AttendanceViewPageFrame';
import AttendanceDayCorrectionMenu from './AttendanceDayCorrectionMenu';

const CHART_PX = 200;

function barClassForOutcome(outcome) {
  const meta = ATTENDANCE_OUTCOME_META[outcome];
  if (!meta) return 'bg-slate-200';
  const first = meta.cell.split(' ')[0];
  if (first.includes('repeating-linear-gradient')) {
    return 'bg-[repeating-linear-gradient(45deg,#e2e8f0_0_3px,#fff_3px_6px)] border border-slate-300';
  }
  return first;
}

function arrivalDotClass(band) {
  if (band === 'early') return 'bg-sky-500';
  if (band === 'late') return 'bg-orange-500';
  if (band === 'on_time') return 'bg-[#103D4D]';
  return '';
}

export default function AttendanceMemberHoursPanel({
  rows,
  todayStr,
  nowMs,
  uid,
  approvedLeaveDates,
  monthStr: monthStrProp,
  onOpenCorrection,
}) {
  const { workspaceSettingsTick } = useErpSession();
  const monthStr = monthStrProp || currentMonthString();
  const [tab, setTab] = useState('hours');
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuDay, setMenuDay] = useState(null);

  const statTabs = useMemo(
    () => [
      { id: 'hours', label: 'Hours' },
      { id: 'flags', label: 'Flags' },
      { id: 'punctuality', label: 'Punctuality' },
      { id: 'records', label: 'All my records', count: rows.length },
    ],
    [rows.length],
  );

  const monthStart = `${monthStr}-01`;
  const monthEnd = useMemo(() => {
    const [y, mo] = monthStr.split('-').map(Number);
    const last = new Date(y, mo, 0).getDate();
    const end = `${monthStr}-${String(last).padStart(2, '0')}`;
    return end > todayStr ? todayStr : end;
  }, [monthStr, todayStr]);

  const chartDays = useMemo(() => {
    const list = [];
    let d = monthStart;
    let guard = 0;
    while (d <= monthEnd && guard < 400) {
      guard += 1;
      if (isAttendanceWorkWeekday(d)) list.push(d);
      d = dateStringAddDays(d, 1);
    }
    return list;
  }, [monthStart, monthEnd]);

  const maxChartMin = CHART_MAX_HOURS * 60;

  const chartBars = useMemo(() => {
    return chartDays.map((dateStr) => {
      const row = rows.find((r) => String(r.work_date).slice(0, 10) === dateStr);
      const outcome = classifyAttendanceDayOutcome(row || { work_date: dateStr }, todayStr, nowMs, {
        uid,
        approvedLeaveDates,
      });
      const netSec = row?.check_in_at
        ? attendanceRowNetSeconds(row, nowMs, { uid, workDate: dateStr, todayStr })
        : 0;
      const minutes = Math.round(netSec / 60);
      const chartMinutes = Math.min(minutes, maxChartMin);
      const arrival = row?.check_in_at ? classifyAttendanceArrival(row.check_in_at, dateStr) : 'none';
      const overtime = netSec > getFullDayNetSeconds();
      const dt = new Date(`${dateStr}T12:00:00`);
      return {
        dateStr,
        row,
        outcome,
        minutes,
        netSec,
        chartMinutes,
        arrival,
        overtime,
        label: {
          weekday: dt.toLocaleDateString(undefined, { weekday: 'short' }),
          day: dt.getDate(),
        },
      };
    });
  }, [chartDays, rows, todayStr, nowMs, uid, approvedLeaveDates, maxChartMin, workspaceSettingsTick]);

  const stats = useMemo(
    () => computeMemberMonthStats(rows, monthStr, todayStr, nowMs, uid),
    [rows, monthStr, todayStr, nowMs, uid, workspaceSettingsTick],
  );

  const flagItems = useMemo(() => {
    return chartBars.filter((b) => ['missing', 'absent', 'half', 'short'].includes(b.outcome));
  }, [chartBars]);

  const punctualityItems = useMemo(() => {
    const counts = { early: 0, on_time: 0, late: 0, none: 0 };
    for (const b of chartBars) {
      if (b.arrival === 'none') counts.none += 1;
      else counts[b.arrival] += 1;
    }
    return counts;
  }, [chartBars]);

  const rangeLabel = useMemo(() => {
    const [y, mo] = monthStr.split('-').map(Number);
    const ml = new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'short' });
    const startDay = chartDays[0]?.slice(8) || '1';
    const endDay = monthEnd.slice(8);
    return `${ml} ${startDay}–${endDay}`;
  }, [monthStr, chartDays, monthEnd]);

  function openDayMenu(e, bar) {
    if (!onOpenCorrection) return;
    if (!isAttendanceDayClickable({ dateStr: bar.dateStr, outcome: bar.outcome, todayStr })) return;
    setMenuAnchor({ x: e.clientX, y: e.clientY });
    setMenuDay(bar);
  }

  return (
    <>
      <AttendancePanel flush>
        <AttendanceSectionHeader
          title="Statistics"
          subtitle={`${rangeLabel} · scheduled days only · ${formatNetHoursShort(stats.totalNet)} of ${formatNetHoursShort(stats.targetSec)}`}
        >
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-[#131b24]">
              {statTabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-semibold ${
                    tab === t.id
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-[#0c121a] dark:text-white'
                      : 'text-slate-500'
                  }`}
                >
                  {t.label}
                  {t.count != null ? (
                    <span className="ml-1 font-mono text-[10px] font-semibold tabular-nums opacity-80">{t.count}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </AttendanceSectionHeader>

        <div className="px-4 pb-4 sm:px-[18px]">
        {tab === 'hours' ? (
          <div className="relative mt-4 pl-9">
            <div className="absolute left-0 top-0 h-[200px] w-8 font-mono text-[10.5px] text-slate-500">
              <div className="absolute right-0 top-[14px]">10h</div>
              <div className="absolute right-0 top-[69px]">7h</div>
              <div className="absolute right-0 top-[123px]">4h</div>
              <div className="absolute right-0 top-[196px]">0</div>
            </div>
            <div className="relative overflow-hidden border-b border-slate-200" style={{ height: CHART_PX }}>
              <div className="absolute left-0 right-0 top-[18px] border-t border-dashed border-slate-200" />
              <div className="absolute left-0 right-0 top-[73px] border-t border-teal-300/80" />
              <div className="absolute right-0 top-[58px] bg-white px-1 text-[10px] font-semibold uppercase tracking-wider text-teal-800">
                Full day 7h
              </div>
              <div className="absolute left-0 right-0 top-[127px] border-t border-dashed border-slate-200" />
              <div className="absolute bottom-0 left-0 right-0 flex items-end gap-2 overflow-hidden" style={{ height: CHART_PX }}>
                {chartBars.map((bar) => {
                  const h =
                    bar.chartMinutes > 0
                      ? Math.max(6, Math.min(CHART_PX, Math.round((bar.chartMinutes / maxChartMin) * CHART_PX)))
                      : 6;
                  const dot = arrivalDotClass(bar.arrival);
                  const canCorrect =
                    Boolean(onOpenCorrection) &&
                    isAttendanceDayClickable({ dateStr: bar.dateStr, outcome: bar.outcome, todayStr });
                  return (
                    <div key={bar.dateStr} className="relative flex flex-1 justify-center">
                      {bar.overtime && bar.netSec > getFullDayNetSeconds() ? (
                        <span className="absolute -top-4 font-mono text-[9.5px] font-semibold text-indigo-700">
                          {formatAttendanceHm(bar.netSec)}
                        </span>
                      ) : null}
                      {dot && bar.chartMinutes > 0 ? (
                        <span className={`absolute -top-3.5 h-1.5 w-1.5 rounded-full ${dot}`} />
                      ) : null}
                      <button
                        type="button"
                        disabled={!canCorrect}
                        onClick={(e) => openDayMenu(e, bar)}
                        title={
                          canCorrect
                            ? `${bar.dateStr}: ${formatAttendanceHm(bar.netSec)} · tap to request correction`
                            : `${bar.dateStr}: ${formatAttendanceHm(bar.netSec)}`
                        }
                        className={`w-full max-w-[30px] rounded-t ${barClassForOutcome(bar.outcome)} ${bar.outcome === 'open' ? 'border border-dashed border-teal-500 bg-teal-50' : ''} ${bar.overtime ? 'shadow-[inset_0_-5px_0_#6366f1]' : ''} ${
                          canCorrect
                            ? 'cursor-pointer hover:ring-2 hover:ring-teal-400/70'
                            : 'cursor-default'
                        }`}
                        style={{ height: h }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              {chartBars.map((bar) => {
                const canCorrect =
                  Boolean(onOpenCorrection) &&
                  isAttendanceDayClickable({ dateStr: bar.dateStr, outcome: bar.outcome, todayStr });
                return (
                  <button
                    key={`lbl-${bar.dateStr}`}
                    type="button"
                    disabled={!canCorrect}
                    onClick={(e) => openDayMenu(e, bar)}
                    className={`flex-1 text-center font-mono text-[10.5px] leading-tight ${
                      bar.outcome === 'absent' ? 'text-red-600' : bar.dateStr === todayStr ? 'font-semibold text-slate-900' : 'text-slate-600'
                    } ${canCorrect ? 'cursor-pointer rounded hover:bg-slate-50 dark:hover:bg-teal-950/20' : 'cursor-default'}`}
                  >
                    {bar.label.weekday.slice(0, 2)}
                    <br />
                    {String(bar.label.day).padStart(2, '0')}
                  </button>
                );
              })}
            </div>

            <div className="mt-[18px] grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-3 dark:border-teal-900/45 dark:bg-teal-900/45">
              <div className="bg-white px-4 py-3.5 dark:bg-[#0c121a]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Avg complete day</p>
                <p className="mt-2.5 font-mono text-xl font-semibold tabular-nums">
                  {stats.completeDays > 0 ? formatAttendanceHm(stats.avgSec) : '—'}
                </p>
                <p className="mt-2 text-[11.5px] text-slate-500">
                  {stats.completeDays} complete days · {formatNetHoursShort(stats.totalNet)}
                </p>
              </div>
              <div className="bg-white px-4 py-3.5 dark:bg-[#0c121a]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Shortfall vs schedule</p>
                <p className="mt-2.5 font-mono text-xl font-semibold tabular-nums text-amber-700">
                  {stats.shortfallSec > 0 ? `−${formatAttendanceHm(stats.shortfallSec)}` : '—'}
                </p>
                <p className="mt-2 text-[11.5px] text-slate-500">
                  {stats.shortDayCount > 0
                    ? `${formatAttendanceHm(stats.shortDayShortfall)} over ${stats.shortDayCount} short days`
                    : 'On track'}
                </p>
              </div>
              <div className="bg-white px-4 py-3.5 dark:bg-[#0c121a]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Overtime</p>
                <p className="mt-2.5 font-mono text-xl font-semibold tabular-nums text-indigo-700">
                  {stats.overtimeSec > 0 ? `+${formatAttendanceHm(stats.overtimeSec)}` : '—'}
                </p>
                <p className="mt-2 text-[11.5px] text-slate-500">
                  {stats.overtimeDayLabel || 'No overtime days yet'}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {tab === 'flags' ? (
          <div className="mt-4 space-y-2">
            {flagItems.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-slate-500">No flagged days in this period.</p>
            ) : (
              flagItems.map((b) => (
                <div key={b.dateStr} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px]">
                  <span className={`h-2 w-2 rounded-sm ${ATTENDANCE_OUTCOME_META[b.outcome]?.cell.split(' ')[0] || 'bg-slate-300'}`} />
                  <span className="font-semibold">{b.dateStr}</span>
                  <span className="text-slate-500">{ATTENDANCE_OUTCOME_META[b.outcome]?.label}</span>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === 'punctuality' ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {['early', 'on_time', 'late', 'none'].map((key) => (
              <div key={key} className="rounded-lg border px-3 py-3 text-center dark:border-teal-900/45">
                <div className={`mx-auto mb-2 h-1.5 w-6 rounded-sm ${ATTENDANCE_ARRIVAL_META[key].band}`} />
                <p className="text-[11px] text-slate-500">{ATTENDANCE_ARRIVAL_META[key].label}</p>
                <p className="mt-1 font-mono text-xl font-semibold">{punctualityItems[key]}</p>
              </div>
            ))}
          </div>
        ) : null}

        {tab === 'records' ? (
          <div className="mt-4 overflow-x-auto">
            <AttendanceHistoryTable rows={rows} uid={uid} />
          </div>
        ) : null}
        </div>
      </AttendancePanel>

      <AttendanceDayCorrectionMenu
        anchor={menuAnchor}
        dateStr={menuDay?.dateStr}
        row={menuDay?.row}
        outcome={menuDay?.outcome}
        todayStr={todayStr}
        onClose={() => {
          setMenuAnchor(null);
          setMenuDay(null);
        }}
        onOpenCorrection={onOpenCorrection}
      />
    </>
  );
}
