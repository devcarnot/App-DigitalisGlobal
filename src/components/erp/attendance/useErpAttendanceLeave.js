'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import {
  buildLeaveBreakdownLines,
  buildMemberLeaveBalances,
  leaveQuotaYear,
} from '../../../lib/erp-leave';
import { buildApprovedLeaveDateSet } from '../../../lib/erp-attendance-policy';
import { dateStringAddDays, localDateString } from '../../../lib/erp-attendance';

/**
 * Load approved leave dates keyed by user id for a date window.
 */
export function useErpAttendanceLeaveMap(userIds, fromStr, toStr) {
  const [leaveByUser, setLeaveByUser] = useState(() => new Map());

  const load = useCallback(async () => {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (ids.length === 0) {
      setLeaveByUser(new Map());
      return;
    }
    try {
      const { data, error } = await supabase
        .from('erp_leave_requests')
        .select('user_id, start_date, end_date, status, leave_type')
        .eq('status', 'approved')
        .lte('start_date', toStr)
        .gte('end_date', fromStr)
        .in('user_id', ids);
      if (error) throw error;
      const map = new Map();
      for (const id of ids) {
        const rows = (data || []).filter((r) => r.user_id === id);
        map.set(id, buildApprovedLeaveDateSet(rows, id));
      }
      setLeaveByUser(map);
    } catch {
      setLeaveByUser(new Map());
    }
  }, [userIds, fromStr, toStr]);

  useEffect(() => {
    void load();
  }, [load]);

  return leaveByUser;
}

/** Leave balance bars + approved-leave breakdown for member sidebar. */
export function useMemberLeaveBalances(uid) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!uid) {
      setData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const year = leaveQuotaYear();
        const { data: rows } = await supabase
          .from('erp_leave_requests')
          .select('leave_type, day_count, status, start_date, end_date')
          .eq('user_id', uid)
          .gte('start_date', `${year}-01-01`)
          .lte('start_date', `${year}-12-31`);
        if (cancelled) return;
        setData({
          balances: buildMemberLeaveBalances(rows),
          breakdown: buildLeaveBreakdownLines(rows, year),
          year,
        });
      } catch {
        if (!cancelled) setData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return data;
}

/** @deprecated use useMemberLeaveBalances */
export function useMemberLeaveSummary(uid) {
  const data = useMemberLeaveBalances(uid);
  if (!data?.balances) return null;
  return data.balances.map((b) => ({ label: b.label, value: `${b.left} left` }));
}

export function useMemberApprovedLeaveDates(uid, fromStr, toStr) {
  const [dates, setDates] = useState(undefined);

  useEffect(() => {
    if (!uid) {
      setDates(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('erp_leave_requests')
          .select('user_id, start_date, end_date, status')
          .eq('user_id', uid)
          .eq('status', 'approved')
          .lte('start_date', toStr || localDateString())
          .gte('end_date', fromStr || dateStringAddDays(localDateString(), -365));
        if (cancelled) return;
        setDates(buildApprovedLeaveDateSet(data || [], uid));
      } catch {
        if (!cancelled) setDates(undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, fromStr, toStr]);

  return dates;
}
