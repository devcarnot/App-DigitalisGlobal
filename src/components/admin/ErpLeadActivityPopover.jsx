'use client';

import React from 'react';
import { crmActivityTypeLabel, formatCrmActivityWhen } from '../../lib/erp-crm-activities';
import { ERP_DARK_MENU_PORTAL } from '../../lib/erp-dark-surfaces';

function activityIcon(type) {
  switch (type) {
    case 'call':
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
        </svg>
      );
    case 'email':
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 4h16v16H4z" />
          <path d="M22 6l-10 7L2 6" />
        </svg>
      );
    case 'note':
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
      );
    case 'task':
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
      );
    case 'meeting':
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case 'stage_change':
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M7 7h10v10" />
          <path d="M7 17L17 7" />
        </svg>
      );
    default:
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      );
  }
}

/**
 * Popover listing recent CRM activities for a lead card (GHL-style).
 */
export default function ErpLeadActivityPopover({ activities = [], loading = false, onViewAll }) {
  return (
    <div
      className={`w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-slate-200/90 bg-white py-2 shadow-xl ring-1 ring-black/5 ${ERP_DARK_MENU_PORTAL}`}
      role="dialog"
      aria-label="Recent activity"
    >
      <div className="border-b border-slate-100 px-3 pb-2 dark:border-teal-900/45">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recent activity</p>
      </div>
      <div className="max-h-64 overflow-y-auto [scrollbar-width:thin]">
        {loading ? (
          <p className="px-3 py-4 text-center text-xs text-slate-500 dark:text-slate-400">Loading…</p>
        ) : activities.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-slate-500 dark:text-slate-400">No activity yet. Log a call, note, or task.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-teal-900/35">
            {activities.map((a) => (
              <li key={a.id} className="flex gap-2.5 px-3 py-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {activityIcon(a.activity_type)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{a.title}</p>
                  <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    {crmActivityTypeLabel(a.activity_type)} · {formatCrmActivityWhen(a.created_at)}
                  </p>
                  {a.body ? (
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-[11px] text-slate-600 dark:text-slate-400">{a.body}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {onViewAll ? (
        <div className="border-t border-slate-100 px-2 pt-1 dark:border-teal-900/45">
          <button
            type="button"
            onClick={onViewAll}
            className="w-full rounded-lg px-2 py-2 text-left text-xs font-bold text-indigo-700 hover:bg-indigo-50 dark:text-violet-200 dark:hover:bg-violet-950/40"
          >
            View full timeline →
          </button>
        </div>
      ) : null}
    </div>
  );
}
