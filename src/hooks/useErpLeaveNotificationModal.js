'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { erpAuthorizedFetch } from '../lib/erp-client-api';
import { isErpGlobalAdmin } from '../lib/erp-roles';
import ErpLeaveOrNoticeModal from '../components/erp/ErpLeaveOrNoticeModal';
import {
  isLeaveWorkspaceNotification,
  resolveLeaveRequestIdFromNotification,
} from '../lib/erp-notification-leave';
import { downloadFromSignedUrlWithFallback, basenameFromStoragePath } from '../lib/browser-download';

const LEAVE_ROW_SELECT =
  'id, user_id, leave_type, start_date, end_date, day_count, status, reason, attachment_path, created_at, reviewed_at, reviewer_note, reviewed_by';

async function markNotificationReadIfNeeded(row, userId) {
  const nid = row?.notificationId || row?.id;
  if (!userId || !nid || row.read) return;
  await supabase.from('erp_notifications').update({ read: true }).eq('id', nid).eq('user_id', userId);
  try {
    window.dispatchEvent(new CustomEvent('erp-notifications-reload'));
  } catch {
    /* ignore */
  }
}

export function useErpLeaveNotificationModal({ viewerRole, userId }) {
  const [state, setState] = useState({
    open: false,
    busy: false,
    request: null,
    memberName: '',
    reviewerName: '',
    fallback: null,
  });
  const requestRef = useRef(null);
  useEffect(() => {
    requestRef.current = state.request;
  }, [state.request]);

  const close = useCallback(() => {
    setState({
      open: false,
      busy: false,
      request: null,
      memberName: '',
      reviewerName: '',
      fallback: null,
    });
  }, []);

  const openAttachment = useCallback(async (path) => {
    if (!path) return;
    const { data, error: uErr } = await supabase.storage.from('erp-files').createSignedUrl(path, 3600);
    if (uErr || !data?.signedUrl) return;
    await downloadFromSignedUrlWithFallback(data.signedUrl, basenameFromStoragePath(path));
  }, []);

  const applyStatus = useCallback(
    async (next) => {
      const req = requestRef.current;
      if (!req?.id || !userId) return;
      const id = req.id;
      setState((s) => ({ ...s, busy: true }));
      try {
        if (isErpGlobalAdmin(viewerRole)) {
          const res = await erpAuthorizedFetch(`/api/erp/admin/leave-requests/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: next }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Could not update request');
        } else {
          const { error: uErr } = await supabase
            .from('erp_leave_requests')
            .update({
              status: next,
              reviewed_by: userId,
              reviewed_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('status', 'pending');
          if (uErr) throw new Error(uErr.message);
        }
        const { data: row, error: rErr } = await supabase
          .from('erp_leave_requests')
          .select(LEAVE_ROW_SELECT)
          .eq('id', id)
          .maybeSingle();
        if (rErr) throw new Error(rErr.message);
        const ids = [row?.user_id, row?.reviewed_by].filter(Boolean);
        let nm = {};
        if (ids.length) {
          const { data: profs } = await supabase.from('erp_profiles').select('id, full_name').in('id', ids);
          nm = Object.fromEntries((profs || []).map((p) => [p.id, p.full_name || '']));
        }
        setState((s) => ({
          ...s,
          busy: false,
          request: row,
          memberName: row ? nm[row.user_id] || 'Member' : '',
          reviewerName: row?.reviewed_by ? nm[row.reviewed_by] || '' : '',
          fallback: null,
        }));
      } catch {
        setState((s) => ({ ...s, busy: false }));
      }
    },
    [userId, viewerRole],
  );

  const openLeaveFromNotificationRow = useCallback(
    async (row) => {
      if (!isLeaveWorkspaceNotification(row)) return false;
      await markNotificationReadIfNeeded(row, userId);

      setState({
        open: true,
        busy: true,
        request: null,
        memberName: '',
        reviewerName: '',
        fallback: null,
      });

      const requestId = resolveLeaveRequestIdFromNotification(row);
      const fb = { title: row.title || 'Leave', body: row.body || '' };

      if (!requestId) {
        setState({
          open: true,
          busy: false,
          request: null,
          memberName: '',
          reviewerName: '',
          fallback: fb,
        });
        return true;
      }

      const { data, error } = await supabase.from('erp_leave_requests').select(LEAVE_ROW_SELECT).eq('id', requestId).maybeSingle();

      if (error || !data) {
        setState({
          open: true,
          busy: false,
          request: null,
          memberName: '',
          reviewerName: '',
          fallback: fb,
        });
        return true;
      }

      const ids = [data.user_id, data.reviewed_by].filter(Boolean);
      let nm = {};
      if (ids.length) {
        const { data: profs } = await supabase.from('erp_profiles').select('id, full_name').in('id', ids);
        nm = Object.fromEntries((profs || []).map((p) => [p.id, p.full_name || '']));
      }

      setState({
        open: true,
        busy: false,
        request: data,
        memberName: nm[data.user_id] || 'Member',
        reviewerName: data.reviewed_by ? nm[data.reviewed_by] || '' : '',
        fallback: null,
      });
      return true;
    },
    [userId],
  );

  const leaveModalEl = (
    <ErpLeaveOrNoticeModal
      open={state.open}
      onClose={close}
      request={state.request}
      memberName={state.memberName}
      reviewerName={state.reviewerName}
      viewerRole={viewerRole}
      onChangeStatus={applyStatus}
      busy={state.busy}
      onOpenAttachment={(path) => void openAttachment(path)}
      fallbackNotice={state.fallback}
    />
  );

  return { leaveModalEl, openLeaveFromNotificationRow, closeLeaveModal: close };
}
