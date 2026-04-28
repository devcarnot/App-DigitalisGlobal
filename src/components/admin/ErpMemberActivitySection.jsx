'use client';

import { useCallback, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatErpRelativeTime, formatErpPktDateTime } from '../../lib/erp-presence';
import { useErpPresenceOnline } from '../erp/ErpPresenceContext';
import { ERP_TASK_STATUS_LABELS } from '../../lib/erp-task-status';

function describeActivityRow(action, meta, projectName) {
  const proj = projectName ? ` · ${projectName}` : '';
  const m = meta && typeof meta === 'object' ? meta : {};
  switch (action) {
    case 'message_sent':
      return `Sent a chat message${m.preview ? `: ${String(m.preview).slice(0, 80)}` : ''}${proj}`;
    case 'task_created':
      return `Created task${m.title ? `: ${m.title}` : ''}${proj}`;
    case 'subtask_created':
      return `Created task${proj}`;
    case 'task_status_changed': {
      const toKey = m.to ? String(m.to) : '';
      const toLabel = ERP_TASK_STATUS_LABELS[toKey] || toKey || 'updated';
      const fromKey = m.from ? String(m.from) : '';
      const fromPart = fromKey ? `from ${ERP_TASK_STATUS_LABELS[fromKey] || fromKey} → ` : '';
      return `Task ${fromPart}${toLabel}${m.title ? `: ${m.title}` : ''}${proj}`;
    }
    case 'project_created':
      return `Created project${m.name ? `: ${m.name}` : ''}${proj}`;
    case 'member_joined':
      return `Joined project${proj}`;
    case 'session_login': {
      const ctx = m.context ? String(m.context) : '';
      const via =
        ctx === 'invite'
          ? ' (via invitation)'
          : ctx === 'erp'
            ? ' (ERP sign-in)'
            : ctx
              ? ` (${ctx})`
              : '';
      return `Logged in to workspace${via}`;
    }
    case 'session_logout':
      return 'Signed out of workspace';
    default:
      return `${action || 'Activity'}${proj}`;
  }
}

export default function ErpMemberActivitySection({ userId, lastActiveAt, lastSignOutAt }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setErr('');
    try {
      const { data, error } = await supabase
        .from('erp_activity_log')
        .select('id, action, meta, created_at, project_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      const list = data || [];
      const pids = [...new Set(list.map((r) => r.project_id).filter(Boolean))];
      let nameByPid = {};
      if (pids.length > 0) {
        const CHUNK = 80;
        for (let i = 0; i < pids.length; i += CHUNK) {
          const slice = pids.slice(i, i + CHUNK);
          const { data: projs } = await supabase.from('erp_projects').select('id, name').in('id', slice);
          for (const p of projs || []) {
            if (p?.id) nameByPid[p.id] = p.name || '';
          }
        }
      }
      setRows(list.map((r) => ({ ...r, projectName: nameByPid[r.project_id] || '' })));
    } catch (e) {
      setErr(e?.message || 'Could not load activity');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      if (next && rows.length === 0 && !loading) void load();
      return next;
    });
  };

  const online = useErpPresenceOnline(userId, lastActiveAt);

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 dark:border-teal-900/35">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200/90 bg-slate-50/80 px-3 py-2 text-left text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100/90 dark:border-teal-800/45 dark:bg-[#0f1822]/90 dark:text-slate-200 dark:hover:bg-[#141c28]/95"
      >
        <span>Recent workspace activity</span>
        <span className="tabular-nums text-slate-400 dark:text-slate-500" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open ? (
        <div className="mt-2 space-y-2 rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-2.5 dark:border-teal-900/35 dark:bg-[#0a1218]/80">
          <ul className="space-y-1.5 text-[10px] text-slate-600 dark:text-slate-400">
            <li>
              <span className="font-bold text-slate-700 dark:text-slate-300">Presence: </span>
              {online ? (
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">Online now</span>
              ) : lastActiveAt ? (
                <span>Last active {formatErpRelativeTime(lastActiveAt)}</span>
              ) : (
                <span className="text-slate-500 dark:text-slate-500">No recent activity signal</span>
              )}
            </li>
            {lastSignOutAt ? (
              <li>
                <span className="font-bold text-slate-700 dark:text-slate-300">Last sign-out: </span>
                <span className="tabular-nums">{formatErpPktDateTime(lastSignOutAt)}</span>
                <span className="text-slate-400 dark:text-slate-500"> ({formatErpRelativeTime(lastSignOutAt)})</span>
              </li>
            ) : null}
          </ul>

          {err ? <p className="py-1 text-[11px] text-red-600 dark:text-red-400">{err}</p> : null}
          {loading ? (
            <p className="py-2 text-[11px] text-slate-500 dark:text-slate-500">Loading…</p>
          ) : rows.length === 0 && !err ? (
            <p className="py-2 text-[11px] text-slate-500 dark:text-slate-500">
              No logged actions yet (messages, tasks, joins, etc.).
            </p>
          ) : (
            <ul className="max-h-52 space-y-2 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
              {rows.map((r) => {
                const pn = r.projectName || '';
                const when = r.created_at ? formatErpPktDateTime(r.created_at) : '';
                return (
                  <li
                    key={r.id}
                    className="border-b border-slate-100/90 pb-2 text-[11px] leading-snug last:border-0 last:pb-0 dark:border-teal-900/30"
                  >
                    <p className="text-slate-800 dark:text-slate-200">{describeActivityRow(r.action, r.meta, pn)}</p>
                    <p className="mt-0.5 text-[10px] tabular-nums text-slate-400 dark:text-slate-500">{when}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
