'use client';

import Link from 'next/link';
import { isErpManagerRole } from '../../lib/erp-roles';

/**
 * Compact “needs attention” row for leads/admins: links mirror the sidebar;
 * counts come from the parent to avoid extra round-trips.
 */
export default function ErpDashboardAdminStrip({
  profile,
  pendingLeaveCount,
  pendingRemoteCount,
  pendingInvites,
  loading,
  /** When set, “Pending invites” opens the invite modal instead of navigating to /erp/admin/invites */
  onPendingInvitesClick,
}) {
  if (!isErpManagerRole(profile?.role)) return null;

  const showLeave = pendingLeaveCount != null && pendingLeaveCount > 0;
  const showRemote = pendingRemoteCount != null && pendingRemoteCount > 0;
  const showInvites = pendingInvites != null && pendingInvites > 0;

  if (!showLeave && !showRemote && !showInvites && !loading) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200/60 bg-gradient-to-r from-amber-50/90 via-white to-cyan-50/40 px-3 py-2.5 shadow-sm ring-1 ring-amber-900/[0.06] sm:px-4 dark:border-amber-900/50 dark:from-amber-950/50 dark:via-slate-900/92 dark:to-cyan-950/40 dark:ring-amber-900/30"
      aria-label="Needs your attention"
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-900/70 dark:text-amber-200/85">Needs attention</span>
      {loading ? (
        <span className="text-[11px] text-slate-500 dark:text-slate-400">…</span>
      ) : (
        <>
          {showLeave ? (
            <Link
              href="/erp/leave"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-amber-950 shadow-sm ring-1 ring-amber-200/80 transition hover:bg-amber-50 dark:bg-gradient-to-r dark:from-slate-800/90 dark:to-amber-950/50 dark:text-amber-100 dark:ring-amber-800/50 dark:hover:from-slate-700 dark:hover:to-amber-900/40"
            >
              Review leave
              <span className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                {pendingLeaveCount}
              </span>
            </Link>
          ) : null}
          {showRemote ? (
            <Link
              href="/erp/remote"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-sky-900 shadow-sm ring-1 ring-sky-200/80 transition hover:bg-sky-50 dark:bg-gradient-to-r dark:from-slate-800/90 dark:to-sky-950/60 dark:text-sky-100 dark:ring-sky-800/50 dark:hover:from-slate-700 dark:hover:to-sky-900/50"
            >
              Review remote
              <span className="rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                {pendingRemoteCount}
              </span>
            </Link>
          ) : null}
          {showInvites ? (
            onPendingInvitesClick ? (
              <button
                type="button"
                onClick={onPendingInvitesClick}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-[#103D4D] shadow-sm ring-1 ring-cyan-200/70 transition hover:bg-cyan-50/80 dark:bg-gradient-to-r dark:from-slate-800/90 dark:to-teal-950/55 dark:text-teal-100 dark:ring-teal-800/45 dark:hover:from-slate-700 dark:hover:to-teal-950/70"
              >
                Pending invites
                <span className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                  {pendingInvites}
                </span>
              </button>
            ) : (
              <Link
                href="/erp/admin/invites"
                className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-[#103D4D] shadow-sm ring-1 ring-cyan-200/70 transition hover:bg-cyan-50/80 dark:bg-gradient-to-r dark:from-slate-800/90 dark:to-teal-950/55 dark:text-teal-100 dark:ring-teal-800/45 dark:hover:from-slate-700 dark:hover:to-teal-950/70"
              >
                Pending invites
                <span className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                  {pendingInvites}
                </span>
              </Link>
            )
          ) : null}
        </>
      )}
    </div>
  );
}
