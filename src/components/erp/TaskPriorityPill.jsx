'use client';

import React from 'react';
import {
  ERP_TASK_PRIORITY_LABELS,
  ERP_TASK_PRIORITY_PILL_CLASS,
  normalizeTaskPriority,
} from '../../lib/erp-task-priority';

/** Read-only priority capsule (Critical = red, etc.) */
export function ReadOnlyPriorityPill({ priority, size = 'md' }) {
  const p = normalizeTaskPriority(priority);
  const sm = size === 'sm';
  return (
    <span
      className={`inline-flex w-fit max-w-max self-start items-center rounded-full border font-bold uppercase tracking-wide whitespace-nowrap shrink-0 ${
        sm ? 'px-1.5 py-0.5 text-[8px] leading-tight' : 'px-2.5 py-0.5 text-[10px]'
      } ${ERP_TASK_PRIORITY_PILL_CLASS[p]}`}
    >
      {ERP_TASK_PRIORITY_LABELS[p]}
    </span>
  );
}
