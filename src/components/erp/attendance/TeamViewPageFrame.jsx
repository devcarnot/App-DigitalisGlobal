'use client';

import ErpUserAvatar from '../ErpUserAvatar';
import { erpWorkspaceDisplayName } from '../../../lib/erp-roles';

/**
 * Modern team view page chrome — gradient accent, manager chip, policy bar.
 */
export default function TeamViewPageFrame({
  memberCount = 0,
  teamLabel = 'My team',
  teamSelector = null,
  policySubtitle = '',
  managerProfile,
  managerEmail,
  children,
}) {
  const managerName = erpWorkspaceDisplayName(managerProfile, managerEmail);

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1300px] space-y-4 text-[13px] leading-snug text-slate-800 dark:text-slate-100">
      <div className="flex flex-wrap items-end justify-between gap-3 px-0.5">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700/80 dark:text-teal-400/90">
            Team view
          </p>
          <h1 className="text-xl font-bold tracking-tight text-[#103D4D] dark:text-white sm:text-[1.35rem]">
            Manager of {memberCount}
          </h1>
          <p className="max-w-xl text-[12px] text-slate-500 dark:text-slate-400">
            Live presence, today&apos;s coverage, and a fortnight of every member&apos;s days.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/90 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur-sm dark:border-teal-900/45 dark:bg-[#0c121a]/90 dark:text-slate-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live updates
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_30px_-12px_rgba(16,61,77,0.18)] dark:border-teal-900/45 dark:bg-[#0c121a] dark:shadow-none">
        <div
          className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#103D4D] via-teal-500 to-cyan-400"
          aria-hidden
        />

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-teal-50/30 px-5 py-3.5 dark:border-teal-900/40 dark:from-[#0a1018] dark:via-[#0c121a] dark:to-teal-950/20">
          <p className="text-[15px] font-semibold text-[#103D4D] dark:text-white">My team</p>
          {teamSelector || (
            <span className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-3 text-[11.5px] font-semibold text-slate-700 shadow-sm dark:border-teal-800/55 dark:bg-[#131b24] dark:text-slate-200">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden />
              {teamLabel}
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-slate-600 dark:bg-white/10 dark:text-slate-300">
                {memberCount}
              </span>
            </span>
          )}
          {policySubtitle ? (
            <p className="hidden text-[11.5px] text-slate-500 dark:text-slate-400 md:block">{policySubtitle}</p>
          ) : null}
          <div className="flex-1" />
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white/80 py-1 pl-1.5 pr-3 shadow-sm dark:border-teal-900/45 dark:bg-[#101824]/80">
            <ErpUserAvatar profile={managerProfile} size="sm" alt={managerName} />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[12px] font-semibold text-slate-900 dark:text-white">{managerName}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Manager</p>
            </div>
          </div>
        </div>

        {policySubtitle ? (
          <p className="border-b border-slate-100 px-5 py-2 text-[11px] text-slate-500 md:hidden dark:border-teal-900/35 dark:text-slate-400">
            {policySubtitle}
          </p>
        ) : null}

        <div className="space-y-4 p-4 sm:p-[18px_22px_26px]">{children}</div>
      </div>
    </div>
  );
}
