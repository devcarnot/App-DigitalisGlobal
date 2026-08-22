'use client';

import { useMemo } from 'react';
import AttendanceMemberHistoryTable from './AttendanceMemberHistoryTable';

export default function AttendanceMemberRecentPanel({
  member,
  rows = [],
  viewDateStr,
  limit = 10,
  embedded = false,
  onViewAll,
  onEditRow,
  canEdit = false,
}) {
  const excludeDate = String(viewDateStr || '').slice(0, 10);

  const hasRows = useMemo(
    () =>
      [...rows]
        .filter((r) => r.user_id === member?.id)
        .some((r) => {
          const wd = String(r.work_date || '').slice(0, 10);
          return !excludeDate || wd !== excludeDate;
        }),
    [rows, member?.id, excludeDate],
  );

  if (!member || !hasRows) return null;

  const name = member.full_name?.trim() || 'Member';

  return (
    <div
      className={
        embedded
          ? 'mb-1.5 overflow-hidden rounded-xl border border-teal-200/50 bg-gradient-to-br from-teal-50/40 via-white to-slate-50/60 shadow-sm dark:border-teal-900/40 dark:from-teal-950/15 dark:via-[#0a1018] dark:to-[#0c121a]'
          : 'mt-2 overflow-hidden rounded-xl border border-teal-200/60 bg-gradient-to-br from-teal-50/50 via-white to-slate-50/80 shadow-sm dark:border-teal-900/45 dark:from-teal-950/20 dark:via-[#0a1018] dark:to-[#0c121a]'
      }
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-b border-teal-100/80 bg-white/60 dark:border-teal-900/35 dark:bg-[#0c121a]/60 ${embedded ? 'px-2.5 py-2' : 'px-3 py-2.5 sm:px-4'}`}
      >
        <div>
          <p className={`font-bold text-[#103D4D] dark:text-teal-100 ${embedded ? 'text-[11px]' : 'text-[12px]'}`}>
            Last {limit} days
          </p>
          {!embedded ? <p className="text-[11px] text-slate-500 dark:text-slate-400">{name}</p> : null}
        </div>
        {onViewAll ? (
          <button
            type="button"
            onClick={() => onViewAll(member.id)}
            className="inline-flex h-7 items-center rounded-lg border border-teal-200/80 bg-white px-2.5 text-[10px] font-semibold text-teal-800 shadow-sm transition hover:bg-teal-50 dark:border-teal-800/50 dark:bg-[#131b24] dark:text-teal-200 dark:hover:bg-teal-950/40"
          >
            Full history
          </button>
        ) : null}
      </div>

      <div className={`overflow-x-auto ${embedded ? 'px-1.5 pb-1.5 pt-1' : 'px-2 pb-2 pt-1 sm:px-3'}`}>
        <AttendanceMemberHistoryTable
          member={member}
          rows={rows}
          limit={limit}
          excludeDateStr={excludeDate}
          compact={embedded}
          canEdit={canEdit}
          onEditRow={onEditRow}
        />
      </div>
    </div>
  );
}
