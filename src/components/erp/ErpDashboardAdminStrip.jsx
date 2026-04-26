'use client';

import Link from 'next/link';
import { isErpManagerRole } from '../../lib/erp-roles';

/**
 * Compact “needs attention” row for leads/admins — links mirror the sidebar;
 * counts come from the parent to avoid extra round-trips.
 */
export default function ErpDashboardAdminStrip({
  profile,
  pendingLeaveCount,
  pendingInvites,
  loading,
  /** When set, “Pending invites” opens the invite modal instead of navigating to /erp/admin/invites */
  onPendingInvitesClick,
}) {
  if (!isErpManagerRole(profile?.role)) return null;

  const showLeave = pendingLeaveCount != null && pendingLeaveCount > 0;
  const showInvites = pendingInvites != null && pendingInvites > 0;

  if (!showLeave && !showInvites && !loading) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200/60 bg-gradient-to-r from-amber-50/90 via-white to-cyan-50/40 px-3 py-2.5 shadow-sm ring-1 ring-amber-900/[0.06] sm:px-4"
      aria-label="Needs your attention"
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-900/70">Needs attention</span>
      {loading ? (
        <span className="text-[11px] text-slate-500">…</span>
      ) : (
        <>
          {showLeave ? (
            <Link
              href="/erp/leave"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-amber-950 shadow-sm ring-1 ring-amber-200/80 transition hover:bg-amber-50"
            >
              Review leave
              <span className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                {pendingLeaveCount}
              </span>
            </Link>
          ) : null}
          {showInvites ? (
            onPendingInvitesClick ? (
              <button
                type="button"
                onClick={onPendingInvitesClick}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-[#103D4D] shadow-sm ring-1 ring-cyan-200/70 transition hover:bg-cyan-50/80"
              >
                Pending invites
                <span className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                  {pendingInvites}
                </span>
              </button>
            ) : (
              <Link
                href="/erp/admin/invites"
                className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-[#103D4D] shadow-sm ring-1 ring-cyan-200/70 transition hover:bg-cyan-50/80"
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
