'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';import { aggregateTeamAttendanceStats, formatAttendanceHm } from '../../../lib/erp-attendance-policy';
import { erpMemberTeamLabel } from '../../../lib/erp-roles';
import ErpExportCsvButton from '../ErpExportCsvButton';
import { AttendanceFilterPill, AttendancePanel } from './AttendancePageFrame';
import { AttendanceSectionHeader } from './AttendanceViewPageFrame';
import AttendanceDateRangePicker from './AttendanceDateRangePicker';

const AttendanceTeamMembersSheet = dynamic(() => import('./AttendanceTeamMembersSheet'), { ssr: false });

const GRID =
  'grid grid-cols-[minmax(0,1.45fr)_74px_96px_82px_82px_96px_92px_92px_96px] items-center gap-3';

const TEAM_ACCENTS = [
  'from-[#103D4D] to-teal-600',
  'from-sky-500 to-cyan-600',
  'from-violet-500 to-indigo-600',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-600',
  'from-emerald-500 to-teal-500',
  'from-slate-500 to-slate-600',
];

function teamMetricValue(row, filterKey) {
  if (filterKey === 'full') return row.full;
  if (filterKey === 'short') return row.short;
  if (filterKey === 'absent') return row.absent;
  if (filterKey === 'late') return row.late;
  if (filterKey === 'openItems') return row.openItems;
  return 0;
}

function teamMatchesFilter(row, filterKey) {
  if (!filterKey) return true;
  return teamMetricValue(row, filterKey) > 0;
}

function toggleMetricFilter(current, key) {
  return current === key ? null : key;
}

const METRIC_FILTER_PILLS = [
  { key: 'full', label: 'full days', tone: 'working' },
  { key: 'short', label: 'short', tone: 'leave' },
  { key: 'absent', label: 'absent', tone: 'notIn' },
  { key: 'late', label: 'late', tone: 'break' },
  { key: 'openItems', label: 'open', tone: 'notIn' },
];

function teamAccent(index) {
  return TEAM_ACCENTS[index % TEAM_ACCENTS.length];
}

function MetricChip({ value, tone = 'neutral', active = true }) {
  const num = Number(value);
  const isEmpty = value === '—' || value === '0m' || value === 0 || (Number.isFinite(num) && num === 0);
  if (!active || isEmpty) {
    return <span className="font-mono text-[12px] tabular-nums text-slate-400 dark:text-slate-500">{value}</span>;
  }
  const tones = {
    neutral: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
    good: 'bg-teal-50 text-teal-800 ring-1 ring-teal-200/70 dark:bg-teal-950/40 dark:text-teal-100 dark:ring-teal-800/50',
    warn: 'bg-orange-50 text-orange-800 ring-1 ring-orange-200/70 dark:bg-orange-950/35 dark:text-orange-100 dark:ring-orange-900/45',
    alert: 'bg-red-50 text-red-700 ring-1 ring-red-200/70 dark:bg-red-950/35 dark:text-red-100 dark:ring-red-900/45',
    ot: 'bg-violet-50 text-violet-800 ring-1 ring-violet-200/70 dark:bg-violet-950/35 dark:text-violet-100 dark:ring-violet-900/45',
    open: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200/80 dark:bg-amber-950/35 dark:text-amber-100 dark:ring-amber-900/45',
  };
  return (
    <span
      className={`inline-flex min-w-[2.25rem] justify-center rounded-lg px-2 py-0.5 font-mono text-[11.5px] font-semibold tabular-nums ${tones[tone] || tones.neutral}`}
    >
      {value}
    </span>
  );
}

function formatRangeTitle(fromStr, toStr) {
  const fmt = (s) => {
    const d = String(s || '').slice(5).replace('-', '/');
    return d;
  };
  return `${fmt(fromStr)}–${fmt(toStr)}`;
}

export default function AttendanceTeamComparison({
  members,
  attendanceRows,
  fromStr,
  toStr,
  todayStr,
  minDate,
  nowMs,
  leaveByUser,
  onRangeChange,
  fillHeight = false,
  compact = false,
}) {
  const [metricFilter, setMetricFilter] = useState(null);
  const [selectedTeamKey, setSelectedTeamKey] = useState(null);
  const [expandedMemberId, setExpandedMemberId] = useState(null);
  const pillsRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    setMetricFilter(null);
    setSelectedTeamKey(null);
    setExpandedMemberId(null);
  }, [fromStr, toStr]);

  useEffect(() => {
    if (!metricFilter) return undefined;
    function onDocMouseDown(e) {
      if (pillsRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setMetricFilter(null);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [metricFilter]);

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
  const teamLabel = (name) => erpMemberTeamLabel(name) || name;

  const headers = ['Team', 'People', 'Full days', 'Short', 'Absent', 'Late', 'Shortfall', 'Overtime', 'Open'];

  function handleTeamSelect(teamKey) {
    setSelectedTeamKey(teamKey);
    setExpandedMemberId(null);
  }

  const handleCloseTeamSheet = useCallback(() => {
    setSelectedTeamKey(null);
    setExpandedMemberId(null);
  }, []);

  const handleToggleMember = useCallback((memberId) => {
    setExpandedMemberId((prev) => (prev === memberId ? null : memberId));
  }, []);

  const selectedAccentIndex = useMemo(
    () => teams.findIndex((t) => t.team === selectedTeamKey),
    [teams, selectedTeamKey],
  );

  function renderRow(row, { isTotal = false, accentIndex = 0 } = {}) {
    const matchesFilter = isTotal || teamMatchesFilter(row, metricFilter);
    const dimmed = Boolean(metricFilter) && !isTotal && !matchesFilter;
    const highlighted = Boolean(metricFilter) && !isTotal && matchesFilter;
    const selected = !isTotal && selectedTeamKey === row.team;
    const baseRow = `${GRID} px-3 transition duration-200 ${compact ? 'py-1.5' : 'py-2.5'}`;
    const totalRow =
      'rounded-xl border border-[#103D4D]/15 bg-gradient-to-r from-[#103D4D]/[0.07] via-teal-50/80 to-cyan-50/40 shadow-sm dark:border-teal-800/40 dark:from-teal-950/40 dark:via-[#0c121a] dark:to-teal-950/20';
    const teamRowSelected =
      'border-teal-400/80 ring-2 ring-teal-400/50 ring-offset-1 dark:border-teal-600/70 dark:ring-offset-[#0c121a]';
    const teamRowDefault =
      'border-slate-100/90 hover:border-teal-200/70 hover:shadow-[0_8px_24px_-16px_rgba(16,61,77,0.28)] dark:border-teal-900/35 dark:hover:border-teal-800/55';
    const teamRowBase =
      'rounded-xl border bg-white shadow-[0_1px_0_rgba(16,61,77,0.04)] dark:bg-[#0a1018]';
    const rowClassName = [
      baseRow,
      isTotal ? totalRow : `${teamRowBase} ${selected ? teamRowSelected : teamRowDefault}`,
      dimmed ? 'opacity-30 saturate-50' : '',
      highlighted ? 'relative z-[1] scale-[1.005] ring-2 ring-teal-400/70 ring-offset-1 dark:ring-offset-[#0c121a]' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const rowContent = (
      <>
        <div className="flex min-w-0 items-center gap-2.5">
          {!isTotal ? (
            <span
              className={`h-9 w-1 shrink-0 rounded-full bg-gradient-to-b ${teamAccent(accentIndex)} shadow-sm`}
              aria-hidden
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#103D4D] text-[10px] font-bold uppercase tracking-wide text-white shadow-sm dark:bg-teal-800">
              Σ
            </span>
          )}
          <p className={`truncate ${isTotal ? 'text-[13px] font-bold text-[#103D4D] dark:text-teal-100' : 'text-[12.5px] font-semibold text-slate-800 dark:text-slate-100'}`}>
            {teamLabel(row.team)}
          </p>
        </div>
        <p className={`text-right font-mono text-[12px] tabular-nums ${isTotal ? 'font-bold text-slate-800 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
          {row.people}
        </p>
        <div className="text-right">
          <MetricChip value={row.full} tone="good" />
        </div>
        <div className="text-right">
          <MetricChip value={row.short} tone="warn" />
        </div>
        <div className="text-right">
          <MetricChip value={row.absent} tone="alert" />
        </div>
        <div className="text-right">
          <MetricChip value={row.late} tone="warn" />
        </div>
        <div className="text-right">
          <MetricChip value={formatAttendanceHm(row.shortfallSec)} tone="warn" active={row.shortfallSec > 0} />
        </div>
        <div className="text-right">
          <MetricChip value={formatAttendanceHm(row.overtimeSec)} tone="ot" active={row.overtimeSec > 0} />
        </div>
        <div className="text-right">
          <MetricChip value={row.openItems} tone="open" />
        </div>
      </>
    );

    if (isTotal) {
      return <div className={rowClassName}>{rowContent}</div>;
    }

    return (
      <button
        type="button"
        onClick={() => handleTeamSelect(row.team)}
        aria-pressed={selected}
        className={`block w-full text-left ${rowClassName}`}
      >
        {rowContent}
      </button>
    );
  }

  return (
    <div ref={panelRef} className={fillHeight ? 'flex min-h-0 flex-1 flex-col' : undefined}>
    <AttendancePanel flush className={`overflow-hidden ${fillHeight ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
      <AttendanceSectionHeader
        compact={compact}
        title={`Teams · ${formatRangeTitle(fromStr, toStr)}`}
        subtitle={compact ? undefined : 'Tap a team to see members · tap a member for last 10 days'}
      >
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {onRangeChange ? (
            <AttendanceDateRangePicker
              fromStr={fromStr}
              toStr={toStr}
              todayStr={todayStr}
              minDate={minDate}
              onChange={onRangeChange}
            />
          ) : null}
          <ErpExportCsvButton
            filename={`attendance-teams-${fromStr}-to-${toStr}`}
            rows={exportRows}
            columns={[
              { header: 'Team', value: (r) => teamLabel(r.team) },
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
      </AttendanceSectionHeader>

      <div
        ref={pillsRef}
        onMouseDown={(e) => e.stopPropagation()}
        className={`flex shrink-0 flex-wrap gap-1.5 border-b border-slate-100 dark:border-teal-900/35 ${compact ? 'px-3 pb-2 pt-0.5' : 'px-4 pb-3 sm:px-[18px]'}`}
      >
        {METRIC_FILTER_PILLS.map(({ key, label, tone }) => (
          <AttendanceFilterPill
            key={key}
            label={label}
            count={totals[key]}
            tone={tone}
            active={metricFilter === key}
            onClick={() => setMetricFilter(toggleMetricFilter(metricFilter, key))}
          />
        ))}
      </div>

      <div
        className={`overflow-x-auto ${fillHeight ? 'min-h-0 flex-1 overflow-y-auto' : ''} ${compact ? 'px-3 pb-2 pt-0.5' : 'px-4 pb-4 pt-1 sm:px-[18px]'}`}
      >
        <div className="min-w-[880px] space-y-1">
          <div
            className={`${GRID} rounded-xl bg-gradient-to-r from-[#103D4D] via-[#145068] to-teal-700 shadow-sm ${compact ? 'sticky top-0 z-[2] px-2.5 py-1.5' : 'px-3 py-2.5'}`}
          >
            {headers.map((h, i) => (
              <p
                key={h}
                className={`text-[10px] font-bold uppercase tracking-[0.1em] text-white/75 ${i > 0 ? 'text-right' : ''}`}
              >
                {h}
              </p>
            ))}
          </div>

          {teams.map((t, i) => (
            <div key={t.team}>{renderRow(t, { accentIndex: i })}</div>
          ))}

          <div className="pt-1">{renderRow({ team: 'All teams', ...totals }, { isTotal: true })}</div>
        </div>
      </div>
    </AttendancePanel>

    <AttendanceTeamMembersSheet
      open={Boolean(selectedTeamKey)}
      teamKey={selectedTeamKey}
      members={members}
      attendanceRows={attendanceRows}
      fromStr={fromStr}
      toStr={toStr}
      todayStr={todayStr}
      nowMs={nowMs}
      leaveByUser={leaveByUser}
      expandedMemberId={expandedMemberId}
      onToggleMember={handleToggleMember}
      onClose={handleCloseTeamSheet}
      accentClass={selectedAccentIndex >= 0 ? teamAccent(selectedAccentIndex) : TEAM_ACCENTS[0]}
    />
    </div>
  );
}
