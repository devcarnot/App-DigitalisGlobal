'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { memberProjectsHref, memberWorkloadSliceHref } from '../../../lib/erp-member-projects-links';

function computePosition(triggerRect, menuHeight = 200) {
  if (!triggerRect) return { left: 0, top: 0 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = 196;
  const left = Math.max(8, Math.min(triggerRect.right - width, vw - width - 8));
  const spaceBelow = vh - triggerRect.bottom;
  const placeAbove = spaceBelow < menuHeight && triggerRect.top > spaceBelow;
  const top = placeAbove
    ? Math.max(8, triggerRect.top - menuHeight - 4)
    : Math.min(vh - menuHeight - 8, triggerRect.bottom + 4);
  return { left, top, width };
}

/**
 * Row actions: projects, tasks, attendance detail.
 */
export default function TeamMemberRowMenu({
  memberId,
  memberName,
  workload,
  onViewAttendance,
  onClose,
  anchorRef,
}) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 196 });

  useLayoutEffect(() => {
    const el = anchorRef?.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const h = menuRef.current?.offsetHeight || 180;
    setPosition(computePosition(rect, h));
  }, [anchorRef]);

  useEffect(() => {
    function onDoc(e) {
      const t = e.target;
      if (menuRef.current?.contains(t)) return;
      if (anchorRef?.current?.contains(t)) return;
      onClose?.();
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, onClose]);

  const items = [
    {
      kind: 'button',
      label: 'Attendance & history',
      onClick: () => {
        onViewAttendance?.();
        onClose?.();
      },
    },
    {
      kind: 'link',
      label: workload?.active ? `Active projects (${workload.active})` : 'Projects',
      href: memberWorkloadSliceHref(memberId, 'active'),
    },
    {
      kind: 'link',
      label: workload?.openTasks ? `Open tasks (${workload.openTasks})` : 'Open tasks',
      href: memberWorkloadSliceHref(memberId, 'assigned'),
    },
  ];

  if (workload?.overdue > 0) {
    items.push({
      kind: 'link',
      label: `Overdue tasks (${workload.overdue})`,
      href: memberWorkloadSliceHref(memberId, 'overdue'),
      tone: 'warn',
    });
  }
  if (workload?.dueSoon > 0) {
    items.push({
      kind: 'link',
      label: `Due this week (${workload.dueSoon})`,
      href: memberWorkloadSliceHref(memberId, 'dueSoon'),
    });
  }
  items.push({
    kind: 'link',
    label: 'All projects',
    href: memberProjectsHref(memberId, { status: 'all' }),
  });

  return createPortal(
    <div
      ref={menuRef}
      style={{ position: 'fixed', left: position.left, top: position.top, width: position.width }}
      className="z-[650] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-teal-900/55 dark:bg-[#101824]"
      role="menu"
      aria-label={`Options for ${memberName}`}
    >
      <p className="truncate px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {memberName}
      </p>
      {items.map((item) => {
        const cls = `flex w-full items-center px-3 py-2 text-left text-[12px] font-medium transition hover:bg-slate-50 dark:hover:bg-teal-950/45 ${
          item.tone === 'warn' ? 'text-amber-800 dark:text-amber-200' : 'text-slate-800 dark:text-slate-100'
        }`;
        if (item.kind === 'button') {
          return (
            <button key={item.label} type="button" role="menuitem" className={cls} onClick={item.onClick}>
              {item.label}
            </button>
          );
        }
        return (
          <Link key={item.label} href={item.href} role="menuitem" className={cls} onClick={() => onClose?.()}>
            {item.label}
          </Link>
        );
      })}
    </div>,
    document.body,
  );
}
