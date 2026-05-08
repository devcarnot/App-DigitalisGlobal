'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import {
  formatTaskDueDate,
  parseDateOnlyLocal,
  startOfLocalDay,
  taskDueColorClasses,
  taskDueStatus,
} from '../../lib/task-dates';
import { ReadOnlyPriorityPill } from './TaskPriorityPill';
import { erpModalPanelMaxWidthClass } from './ErpModalFormPrimitives';

/**
 * Modal listing every task that is currently overdue for the viewer's scope.
 *
 * Scope:
 *  - `teamScope=true`  → workspace admins: all open tasks past their due date.
 *  - `teamScope=false` → personal: tasks assigned to `userId` (legacy single
 *                        column or new multi-assignee array) past their due
 *                        date and not done/cancelled.
 *
 * Loads on first open (lazy) and refetches every time the modal is reopened
 * so the list stays consistent with whatever the user just clicked through
 * and resolved.
 */
export default function ErpOverdueTasksModal({ open, onClose, userId, teamScope = false }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tasks, setTasks] = useState([]);
  const [assigneeNamesById, setAssigneeNamesById] = useState({});

  const todayStr = useMemo(() => {
    const d = startOfLocalDay(new Date());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let query = supabase
        .from('erp_tasks')
        .select(
          'id, title, status, priority, due_date, project_id, description, assignee_id, assignee_ids, created_at, project:erp_projects(name)',
        )
        .lt('due_date', todayStr)
        .neq('status', 'done')
        .neq('status', 'cancelled')
        .order('due_date', { ascending: true })
        .limit(500);
      if (!teamScope && userId) {
        query = query.or(`assignee_id.eq.${userId},assignee_ids.cs.{${userId}}`);
      }
      const { data, error: qErr } = await query;
      if (qErr) throw new Error(qErr.message);
      const rows = data || [];
      setTasks(rows);

      // Resolve assignee display names in a single round-trip.
      const ids = new Set();
      for (const r of rows) {
        if (r.assignee_id) ids.add(r.assignee_id);
        if (Array.isArray(r.assignee_ids)) for (const id of r.assignee_ids) if (id) ids.add(id);
      }
      if (ids.size > 0) {
        const { data: profs } = await supabase
          .from('erp_profiles')
          .select('id, full_name')
          .in('id', [...ids]);
        const map = {};
        for (const p of profs || []) {
          if (p?.id) map[p.id] = p.full_name?.trim() || 'Member';
        }
        setAssigneeNamesById(map);
      } else {
        setAssigneeNamesById({});
      }
    } catch (e) {
      setError(e?.message || 'Could not load overdue tasks.');
      setTasks([]);
      setAssigneeNamesById({});
    } finally {
      setLoading(false);
    }
  }, [todayStr, teamScope, userId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const handleKey = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose?.();
    },
    [onClose],
  );
  useEffect(() => {
    if (!open) return () => {};
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, handleKey]);

  if (!open) return null;

  const total = tasks.length;
  const heading = teamScope ? 'Overdue tasks · Whole workspace' : 'Overdue tasks · Assigned to you';

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-[#103D4D]/35 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close overdue tasks"
      />
      <div
        className={`relative z-[1] flex max-h-[min(92dvh,880px)] w-full ${erpModalPanelMaxWidthClass} flex-col overflow-hidden rounded-none border border-rose-200/70 bg-white/95 shadow-[0_28px_80px_-18px_rgba(190,18,60,0.25)] backdrop-blur-xl sm:rounded-3xl`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-rose-100/80 bg-gradient-to-r from-rose-50/70 via-white to-amber-50/40 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-700/80">
              <span aria-hidden className="mr-1">
                ⏰
              </span>
              Overdue
            </p>
            <p className="mt-1 truncate text-base font-bold text-slate-900">{heading}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              {loading ? 'Loading…' : `${total} task${total === 1 ? '' : 's'} past due`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 [scrollbar-color:rgba(100,116,139,0.35)_transparent] [scrollbar-width:thin]">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-200 border-t-rose-600" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>
          ) : total === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl">
                ✅
              </div>
              <p className="text-sm font-semibold text-slate-900">Nothing overdue.</p>
              <p className="text-xs text-slate-500">
                {teamScope ? 'Your team is on top of every deadline right now.' : "You're all caught up."}
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {tasks.map((t) => {
                const due = parseDateOnlyLocal(t.due_date);
                const today = startOfLocalDay(new Date());
                const daysOverdue = due ? Math.max(1, Math.round((today - due) / 86400000)) : 0;
                const projectName = t.project?.name || 'Project';
                const assignees = (() => {
                  const ids = new Set();
                  if (t.assignee_id) ids.add(t.assignee_id);
                  if (Array.isArray(t.assignee_ids)) for (const id of t.assignee_ids) if (id) ids.add(id);
                  return [...ids].map((id) => assigneeNamesById[id] || 'Member');
                })();
                const statusLabel = String(t.status || 'open').replace(/_/g, ' ');
                return (
                  <li
                    key={t.id}
                    className="overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-sm ring-1 ring-rose-50/60"
                  >
                    <Link
                      href={`/erp/projects/${t.project_id}`}
                      onClick={onClose}
                      className="block px-4 py-3 transition hover:bg-rose-50/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <ReadOnlyPriorityPill size="sm" priority={t.priority} />
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-700">
                              {statusLabel}
                            </span>
                          </div>
                          <p className="mt-1.5 truncate text-sm font-semibold text-slate-900">{t.title}</p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">{projectName}</p>
                          {t.description ? (
                            <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-slate-600">
                              {t.description}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[11px] font-bold tabular-nums text-rose-700">
                            {daysOverdue} day{daysOverdue === 1 ? '' : 's'} overdue
                          </p>
                          {(() => {
                            const status = taskDueStatus(t.due_date);
                            const c = taskDueColorClasses(status);
                            return (
                              <p className={`mt-0.5 text-[10px] font-semibold ${c.value}`}>
                                <span className={c.label}>Due</span>{' '}
                                {t.due_date ? formatTaskDueDate(t.due_date) : '—'}
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                      {assignees.length > 0 ? (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            Assigned
                          </span>
                          {assignees.map((name, i) => (
                            <span
                              key={`${t.id}-a-${i}`}
                              className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-900 ring-1 ring-cyan-100"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2.5 text-[10px] font-medium italic text-slate-400">Unassigned</p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200/80 bg-slate-50/90 px-5 py-3">
          <p className="text-[11px] text-slate-500">
            Click any task to open its project and resolve it.
          </p>
          <Link
            href="/erp/my-tasks"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl erp-brand-fill px-4 py-2 text-[11px] font-bold text-white shadow-md"
          >
            Open My tasks →
          </Link>
        </div>
      </div>
    </div>
  );
}
