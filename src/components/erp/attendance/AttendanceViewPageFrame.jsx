'use client';

import ErpUserAvatar from '../ErpUserAvatar';
import { erpWorkspaceDisplayName } from '../../../lib/erp-roles';

/**
 * Modern attendance page chrome — gradient card, live badge, user chip.
 * Shared by member self-view and admin overview (My Team uses TeamViewPageFrame).
 */
export default function AttendanceViewPageFrame({
  eyebrow = 'Attendance',
  title,
  subtitle = '',
  live = true,
  userProfile,
  userEmail,
  userRoleLabel = 'You',
  innerTitle,
  innerBadge = null,
  dense = false,
  children,
}) {
  const userName = erpWorkspaceDisplayName(userProfile, userEmail);

  return (
    <div
      className={`mx-auto w-full min-w-0 max-w-[1300px] text-[13px] leading-snug text-slate-800 dark:text-slate-100 ${dense ? 'space-y-2' : 'space-y-4'}`}
    >
      {!dense ? (
        <div className="flex flex-wrap items-end justify-between gap-3 px-0.5">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700/80 dark:text-teal-400/90">
              {eyebrow}
            </p>
            <h1 className="text-xl font-bold tracking-tight text-[#103D4D] dark:text-white sm:text-[1.35rem]">
              {title}
            </h1>
            {subtitle ? (
              <p className="max-w-2xl text-[12px] text-slate-500 dark:text-slate-400">{subtitle}</p>
            ) : null}
          </div>
          {live ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/90 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur-sm dark:border-teal-900/45 dark:bg-[#0c121a]/90 dark:text-slate-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live updates
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_30px_-12px_rgba(16,61,77,0.18)] dark:border-teal-900/45 dark:bg-[#0c121a] dark:shadow-none">
        <div
          className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#103D4D] via-teal-500 to-cyan-400"
          aria-hidden
        />

        {innerTitle || userProfile ? (
          <div
            className={`flex flex-wrap items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50/90 via-white to-teal-50/30 dark:border-teal-900/40 dark:from-[#0a1018] dark:via-[#0c121a] dark:to-teal-950/20 ${dense ? 'px-4 py-2' : 'gap-3 px-5 py-3.5'}`}
          >
            {innerTitle ? (
              <p className={`font-semibold text-[#103D4D] dark:text-white ${dense ? 'text-[13px]' : 'text-[15px]'}`}>
                {innerTitle}
              </p>
            ) : null}
            {innerBadge}
            <div className="flex-1" />
            {userProfile ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white/80 py-1 pl-1.5 pr-3 shadow-sm dark:border-teal-900/45 dark:bg-[#101824]/80">
                <ErpUserAvatar profile={userProfile} size="sm" alt={userName} />
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-[12px] font-semibold text-slate-900 dark:text-white">{userName}</p>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{userRoleLabel}</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={dense ? 'space-y-2 p-3 sm:p-3' : 'space-y-4 p-4 sm:p-[18px_22px_26px]'}>{children}</div>
      </div>
    </div>
  );
}

/** Gradient strip header for nested attendance panels. */
export function AttendanceSectionHeader({ title, subtitle, meta, children, compact = false }) {
  return (
    <div
      className={`border-b border-slate-100 bg-gradient-to-r from-white via-slate-50/40 to-teal-50/30 dark:border-teal-900/35 dark:from-[#0c121a] dark:via-[#0c121a] dark:to-teal-950/10 ${compact ? 'px-3 py-2 sm:px-3' : 'px-4 py-3.5 sm:px-[18px]'}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <p className={`font-semibold text-slate-900 dark:text-white ${compact ? 'text-[12px]' : 'text-[14px]'}`}>
            {title}
          </p>
          {subtitle && !compact ? (
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>
          ) : null}
        </div>
        {meta ? <p className="text-[11px] text-slate-500 dark:text-slate-400">{meta}</p> : null}
        {children}
      </div>
    </div>
  );
}
