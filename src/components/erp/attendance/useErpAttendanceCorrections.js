'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useErpTableRealtime } from '../../../lib/erp-realtime-sync';

export function useMemberAttendanceCorrections(uid, { limit = 12 } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(Boolean(uid));

  const load = useCallback(async () => {
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('erp_attendance_correction_requests')
        .select(
          'id, work_date, kind, requested_check_out_at, member_note, status, reviewer_note, created_at, reviewed_at',
        )
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      setRows(data || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [uid, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  useErpTableRealtime({
    enabled: Boolean(uid),
    channelName: `erp-att-corr-member-${uid}`,
    table: 'erp_attendance_correction_requests',
    filter: uid ? `user_id=eq.${uid}` : undefined,
    onChange: load,
  });

  return { rows, loading, reload: load };
}

export function useAdminAttendanceCorrections({ enabled = true } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(enabled);

  const load = useCallback(async () => {
    if (!enabled) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('erp_attendance_correction_requests')
        .select(
          'id, user_id, attendance_day_id, work_date, kind, requested_check_out_at, member_note, status, reviewer_note, created_at, reviewed_at',
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setRows(data || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  useErpTableRealtime({
    enabled,
    channelName: 'erp-att-corr-admin',
    table: 'erp_attendance_correction_requests',
    onChange: load,
  });

  return { rows, loading, reload: load };
}
