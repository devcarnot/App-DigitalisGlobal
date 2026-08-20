'use client';

import ErpUserAvatar from '../ErpUserAvatar';
import { erpWorkspaceDisplayName } from '../../../lib/erp-roles';

/**
 * Page chrome matching Team View.html — eyebrow, card header bar, manager avatar.
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
    <div className="mx-auto w-full min-w-0 max-w-[1300px] space-y-3.5 text-[13px] leading-snug text-slate-800 dark:text-slate-100">
      <div className="flex flex-wrap items-baseline gap-2.5 px-0.5">
        <p className="text-[13px] font-semibold text-[#103D4D] dark:text-teal-100">
          Team view — manager of {memberCount}
        </p>
        <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
          Live presence, today&apos;s coverage, and a fortnight of every member&apos;s days.
        </p>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-slate-200/90 bg-white shadow-sm dark:border-teal-900/45 dark:bg-[#0c121a]">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200/90 px-5 py-3 dark:border-teal-900/40">
          <p className="text-[15px] font-semibold text-[#103D4D] dark:text-white">My team</p>
          {teamSelector || (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200/90 px-2.5 text-[11.5px] font-medium text-slate-700 dark:border-teal-800/55 dark:text-slate-200">
              {teamLabel} · {memberCount}
            </span>
          )}
          {policySubtitle ? (
            <p className="text-[11.5px] text-slate-500 dark:text-slate-400">{policySubtitle}</p>
          ) : null}
          <div className="flex-1" />
          <p className="text-[11.5px] text-slate-500 dark:text-slate-400">Manager</p>
          <ErpUserAvatar profile={managerProfile} size="sm" alt={managerName} />
        </div>
        <div className="space-y-3.5 p-[18px_22px_26px]">{children}</div>
      </div>
    </div>
  );
}
