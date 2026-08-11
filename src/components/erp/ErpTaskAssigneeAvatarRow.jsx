'use client';

import ErpUserAvatar from './ErpUserAvatar';

/** Deduped assignee UUIDs (`assignee_id` + `assignee_ids`). */
export function assigneeUidList(task) {
  const ids = [];
  const seen = new Set();
  const add = (id) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  add(task?.assignee_id);
  if (Array.isArray(task?.assignee_ids)) for (const id of task.assignee_ids) add(id);
  return ids;
}

/** Stacked avatars: pass `avatarProfileFor` from workspace/dashboard roster lookups. */
export function ErpTaskAssigneeAvatarRow({ uids, avatarProfileFor }) {
  if (!uids.length || typeof avatarProfileFor !== 'function') return null;
  const shown = uids.slice(0, 3);
  const extra = uids.length - shown.length;
  const title = uids.map((uid) => avatarProfileFor(uid)?.full_name || String(uid).slice(0, 8)).join(', ');
  return (
    <span className="inline-flex shrink-0 items-center -space-x-1.5 pr-0.5" title={title}>
      {shown.map((uid) => (
        <ErpUserAvatar
          key={uid}
          profile={avatarProfileFor(uid)}
          alt=""
          size="sm"
          className="!h-6 !w-6 !text-[8px] !shadow-sm !ring-1 !ring-slate-200/80 dark:!ring-teal-900/55"
          imgClassName="!border !border-white/90 dark:!border-slate-700"
        />
      ))}
      {extra > 0 ? (
        <span className="z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[9px] font-bold text-slate-600 ring-2 ring-white dark:border-teal-800 dark:bg-[#1f2934] dark:text-slate-300 dark:ring-[#151f28]">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
