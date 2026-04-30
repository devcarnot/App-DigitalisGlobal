'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { isErpManagerRole } from '../../lib/erp-roles';
import { useErpSession } from './useErpSession';
import ErpDashboardAdminStrip from './ErpDashboardAdminStrip';

const ErpInviteMembersModal = dynamic(() => import('./ErpInviteMembersModal'), { ssr: false });

/**
 * “Needs attention” strip for managers — shown on Members (not dashboard home).
 */
export default function ErpMembersNeedsAttention() {
  const { profile } = useErpSession();
  const showInviteStats = isErpManagerRole(profile?.role);
  const [pendingInvites, setPendingInvites] = useState(null);
  const [pendingLeaveReviews, setPendingLeaveReviews] = useState(null);
  const [pendingRemoteReviews, setPendingRemoteReviews] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    if (!profile || !isErpManagerRole(profile.role)) {
      setPendingInvites(null);
      setPendingLeaveReviews(null);
      setPendingRemoteReviews(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const inviteP = showInviteStats
        ? supabase
            .from('erp_invitations')
            .select('*', { count: 'exact', head: true })
            .is('accepted_at', null)
            .then(({ count }) => count ?? 0)
        : Promise.resolve(null);

      const leaveP = supabase
        .from('erp_leave_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .then(({ count }) => count ?? 0);

      const remoteP = supabase
        .from('erp_remote_work_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .then(({ count, error }) => (error ? null : count ?? 0))
        .catch(() => null);

      const [inviteCount, leavePending, remotePending] = await Promise.all([inviteP, leaveP, remoteP]);

      if (showInviteStats && inviteCount != null) setPendingInvites(inviteCount);
      else setPendingInvites(null);

      if (leavePending != null) setPendingLeaveReviews(leavePending);
      else setPendingLeaveReviews(null);

      if (remotePending != null) setPendingRemoteReviews(remotePending);
      else setPendingRemoteReviews(null);
    } finally {
      setLoading(false);
    }
  }, [profile, showInviteStats]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onReload = () => void load();
    window.addEventListener('erp-dashboard-reload', onReload);
    return () => window.removeEventListener('erp-dashboard-reload', onReload);
  }, [load]);

  if (!isErpManagerRole(profile?.role)) return null;

  return (
    <>
      <ErpDashboardAdminStrip
        profile={profile}
        pendingLeaveCount={pendingLeaveReviews}
        pendingRemoteCount={pendingRemoteReviews}
        pendingInvites={pendingInvites}
        loading={loading}
        onPendingInvitesClick={() => setInviteOpen(true)}
      />
      <ErpInviteMembersModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        projectId={null}
        onSuccess={() => void load()}
      />
    </>
  );
}
