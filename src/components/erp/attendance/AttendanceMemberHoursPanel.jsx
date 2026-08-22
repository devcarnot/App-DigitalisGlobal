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
import { attendanceRowNetSeconds, attendanceRowChartNetSeconds, dateStringAddDays, isAttendanceWorkWeekday, isPastOpenAttendanceRow } from '../../../lib/erp-attendance';
import { isAttendanceDayClickable } from '../../../lib/erp-attendance-corrections';
import { useErpSession } from '../useErpSession';
import { AttendanceHistoryTable, formatNetHoursShort } from '../ErpAttendanceCharts';
import { AttendancePanel } from './AttendancePageFrame';
import { AttendanceSectionHeader } from './AttendanceViewPageFrame';
import AttendanceDayCorrectionMenu from './AttendanceDayCorrectionMenu';

const CHART_PX = 200;

function StatIconClock({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatIconTrendDown({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 16l6-6 4 4 6-8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 6h4v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatIconBolt({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" strokeLinejoin="round" />
    </svg>
  );
}

function HoursSummaryStatCard({ label, value, sub, tone = 'teal', icon: Icon }) {
  const tones = {
    teal: {
      shell:
        'border-teal-200/70 bg-gradient-to-br from-teal-50/90 via-white to-cyan-50/60 shadow-[0_8px_24px_-14px_rgba(16,61,77,0.28)] dark:border-teal-800/45 dark:from-teal-950/35 dark:via-[#0c121a] dark:to-cyan-950/20',
      accent: 'from-[#103D4D] to-teal-500',
      label: 'text-teal-800/75 dark:text-teal-300/90',
      value: 'text-[#103D4D] dark:text-teal-50',
      chip: 'bg-teal-100/80 text-teal-900 ring-1 ring-teal-200/60 dark:bg-teal-950/50 dark:text-teal-100 dark:ring-teal-800/40',
      icon: 'text-teal-700 dark:text-teal-300',
    },
    amber: {
      shell:
        'border-amber-200/70 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/50 shadow-[0_8px_24px_-14px_rgba(180,83,9,0.22)] dark:border-amber-900/45 dark:from-amber-950/30 dark:via-[#12100a] dark:to-orange-950/15',
      accent: 'from-amber-500 to-orange-500',
      label: 'text-amber-800/75 dark:text-amber-300/90',
      value: 'text-amber-800 dark:text-amber-100',
      chip: 'bg-amber-100/80 text-amber-900 ring-1 ring-amber-200/60 dark:bg-amber-950/45 dark:text-amber-100 dark:ring-amber-900/40',
      icon: 'text-amber-700 dark:text-amber-300',
    },
    indigo: {
      shell:
        'border-indigo-200/70 bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/50 shadow-[0_8px_24px_-14px_rgba(79,70,229,0.22)] dark:border-indigo-900/45 dark:from-indigo-950/30 dark:via-[#0e0c18] dark:to-violet-950/15',
      accent: 'from-indigo-500 to-violet-500',
      label: 'text-indigo-800/75 dark:text-indigo-300/90',
      value: 'text-indigo-800 dark:text-indigo-100',
      chip: 'bg-indigo-100/80 text-indigo-900 ring-1 ring-indigo-200/60 dark:bg-indigo-950/45 dark:text-indigo-100 dark:ring-indigo-900/40',
      icon: 'text-indigo-700 dark:text-indigo-300',
    },
  };
  const t = tones[tone] || tones.teal;

  return (
    <div className={`relative overflow-hidden rounded-2xl border px-4 py-3.5 ${t.shell}`}>
      <div className={`pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${t.accent}`} aria-hidden />
      <div className="relative flex items-start justify-between gap-2 pl-1">
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${t.label}`}>{label}</p>
          <p className={`mt-2 font-mono text-[1.35rem] font-bold leading-none tabular-nums tracking-tight ${t.value}`}>
            {value}
          </p>
          {sub ? (
            <p className={`mt-2.5 inline-flex max-w-full flex-wrap items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${t.chip}`}>
              {sub}
            </p>
          ) : null}
        </div>
        {Icon ? (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70 shadow-sm ring-1 ring-white/80 dark:bg-white/5 dark:ring-white/10 ${t.icon}`}
            aria-hidden
          >
            <Icon />
          </span>
        ) : null}
      </div>
    </div>
  );
}

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
      const chartNetSec = row?.check_in_at
        ? attendanceRowChartNetSeconds(row, nowMs, { uid, workDate: dateStr, todayStr })
        : 0;
      const missingCheckout = Boolean(
        row?.check_in_at && !row.check_out_at && isPastOpenAttendanceRow(row, todayStr),
      );
      const minutes = Math.round(netSec / 60);
      const chartMinutes = Math.min(Math.round(chartNetSec / 60), maxChartMin);
      const arrival = row?.check_in_at ? classifyAttendanceArrival(row.check_in_at, dateStr) : 'none';
      const overtime = netSec > getFullDayNetSeconds();
      const dt = new Date(`${dateStr}T12:00:00`);
      return {
        dateStr,
        row,
        outcome,
        minutes,
        netSec,
        chartNetSec,
        missingCheckout,
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
                            ? `${bar.dateStr}: ${bar.missingCheckout ? '7h (no checkout)' : formatAttendanceHm(bar.netSec)} · tap to request correction`
                            : `${bar.dateStr}: ${bar.missingCheckout ? '7h (no checkout)' : formatAttendanceHm(bar.netSec)}`
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

            <div className="mt-[18px] grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <HoursSummaryStatCard
                tone="teal"
                icon={StatIconClock}
                label="Avg complete day"
                value={stats.completeDays > 0 ? formatAttendanceHm(stats.avgSec) : '—'}
                sub={
                  stats.completeDays > 0
                    ? `${stats.completeDays} complete days · ${formatNetHoursShort(stats.totalNet)}`
                    : 'No completed days yet'
                }
              />
              <HoursSummaryStatCard
                tone="amber"
                icon={StatIconTrendDown}
                label="Shortfall vs schedule"
                value={stats.shortfallSec > 0 ? `−${formatAttendanceHm(stats.shortfallSec)}` : '—'}
                sub={
                  stats.shortDayCount > 0
                    ? `${formatAttendanceHm(stats.shortDayShortfall)} over ${stats.shortDayCount} short days`
                    : 'On track'
                }
              />
              <HoursSummaryStatCard
                tone="indigo"
                icon={StatIconBolt}
                label="Overtime"
                value={stats.overtimeSec > 0 ? `+${formatAttendanceHm(stats.overtimeSec)}` : '—'}
                sub={stats.overtimeDayLabel || 'No overtime days yet'}
              />
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
