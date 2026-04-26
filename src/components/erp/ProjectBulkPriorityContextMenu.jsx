'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { logErpActivity } from '../../lib/erp-activity-client';
import { ERP_TASK_PRIORITY_LABELS, ERP_TASK_PRIORITY_ORDER } from '../../lib/erp-task-priority';

/**
 * @param {{
 *   menu: { x: number, y: number, projectId: string, projectName: string, userId?: string } | null,
 *   onClose: () => void,
 *   onApplied?: () => void,
 *   onError?: (message: string) => void,
 * }} props
 */
export default function ProjectBulkPriorityContextMenu({ menu, onClose, onApplied, onError }) {
  const ref = useRef(null);
  const projectIdRef = useRef(null);
  projectIdRef.current = menu?.projectId ?? null;

  useEffect(() => {
    if (!menu) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    let alive = true;
    let detachAway = () => {};
    const timer = window.setTimeout(() => {
      if (!alive) return;
      const away = (e) => {
        // Only primary button: ignore right-click so opening the menu on another project still works.
        if (e.button !== 0) return;
        if (ref.current && ref.current.contains(e.target)) return;
        onClose();
      };
      window.addEventListener('mousedown', away);
      window.addEventListener('scroll', onClose, true);
      detachAway = () => {
        window.removeEventListener('mousedown', away);
        window.removeEventListener('scroll', onClose, true);
      };
    }, 10);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      detachAway();
    };
  }, [menu, onClose]);

  if (!menu || typeof document === 'undefined') return null;

  const mw = 220;
  const mh = 260;
  let left = menu.x;
  let top = menu.y;
  if (typeof window !== 'undefined') {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (left + mw > vw - 8) left = Math.max(8, vw - mw - 8);
    if (top + mh > vh - 8) top = Math.max(8, vh - mh - 8);
    if (left < 8) left = 8;
    if (top < 8) top = 8;
  }

  async function choose(priority) {
    const pid = projectIdRef.current;
    if (!pid) {
      onClose();
      return;
    }
    const { count, error: countErr } = await supabase
      .from('erp_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', pid);
    if (countErr) {
      onError?.(countErr.message || 'Could not check tasks');
      onClose();
      return;
    }
    if (!count || count < 1) {
      onError?.(
        'This project has no tasks yet. Open the project and add a task—then right-click here again to set priority for all tasks.'
      );
      onClose();
      return;
    }
    const { error } = await supabase
      .from('erp_tasks')
      .update({ priority, updated_at: new Date().toISOString() })
      .eq('project_id', pid);
    if (error) {
      onError?.(error.message || 'Could not update priorities');
    } else {
      if (menu?.userId) {
        void logErpActivity({
          projectId: pid,
          userId: menu.userId,
          action: 'bulk_task_priority_set',
          meta: {
            project_name: menu.projectName,
            priority,
            task_count: count,
          },
        });
      }
      onApplied?.();
    }
    onClose();
  }

  const node = (
    <div
      ref={ref}
      role="menu"
      aria-label="Set priority for all tasks in project"
      className="fixed z-[400] w-[min(100vw-1rem,13.75rem)] rounded-xl border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-slate-900/5"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 leading-snug">
        Priority — {menu.projectName}
      </p>
      <p className="px-3 py-1.5 text-[10px] text-slate-500 leading-snug">
        Updates every task in this project. If there are no tasks yet, add one in the workspace first.
      </p>
      {ERP_TASK_PRIORITY_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          role="menuitem"
          className="w-full text-left px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          onClick={() => choose(id)}
        >
          {ERP_TASK_PRIORITY_LABELS[id]}
        </button>
      ))}
    </div>
  );

  return createPortal(node, document.body);
}
