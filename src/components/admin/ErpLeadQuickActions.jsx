'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

function Badge({ count }) {
  if (!count || count <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-sky-600 px-1 text-[9px] font-bold leading-none text-white dark:bg-sky-500">
      {count > 99 ? '99+' : count}
    </span>
  );
}

function IconBtn({ label, count, disabled, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={
        'relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100'
      }
    >
      {children}
      <Badge count={count} />
    </button>
  );
}

/**
 * GHL-style quick action icons on a lead card.
 */
export default function ErpLeadQuickActions({
  lead,
  summary,
  canEdit,
  activityPopoverOpen,
  activityPopover,
  onCall,
  onEmail,
  onNote,
  onTask,
  onMeeting,
  onToggleActivity,
}) {
  const popRef = useRef(null);

  useEffect(() => {
    if (!activityPopoverOpen) return;
    function onDoc(e) {
      const el = popRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      onToggleActivity?.(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [activityPopoverOpen, onToggleActivity]);

  const s = summary || lead?.activity_summary || {};

  return (
    <div
      className="mt-2.5 flex flex-wrap items-center gap-0.5 border-t border-slate-100 pt-2 dark:border-teal-900/45"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <IconBtn label="Call" disabled={!lead?.phone} onClick={onCall}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
        </svg>
      </IconBtn>

      <IconBtn label="Email" disabled={!lead?.email} count={s.emails} onClick={onEmail}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M22 6l-10 7L2 6" />
        </svg>
      </IconBtn>

      <IconBtn label="Add note" disabled={!canEdit} count={s.notes} onClick={onNote}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
      </IconBtn>

      <IconBtn label="Add task" disabled={!canEdit} count={s.tasks} onClick={onTask}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
      </IconBtn>

      <IconBtn label="Book follow-up" disabled={!canEdit} count={s.meetings} onClick={onMeeting}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </IconBtn>

      <div className="relative">
        <IconBtn label="Activity" count={s.total} onClick={(e) => onToggleActivity?.(!activityPopoverOpen, e)}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
        </IconBtn>
        {activityPopoverOpen && activityPopover
          ? typeof document !== 'undefined'
            ? createPortal(
                <div ref={popRef} className="fixed z-[240]" style={activityPopover.style}>
                  {activityPopover.content}
                </div>,
                document.body,
              )
            : null
          : null}
      </div>
    </div>
  );
}
