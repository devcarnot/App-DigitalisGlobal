/** Deep links to Projects grid filtered for one workspace member. */
export function memberProjectsHref(userId, extra = {}) {
  if (!userId) return '/erp/projects';
  const p = new URLSearchParams({ member: String(userId) });
  if (extra.status) p.set('status', extra.status);
  if (extra.deadline) p.set('deadline', extra.deadline);
  if (extra.taskDue) p.set('taskDue', extra.taskDue);
  return `/erp/projects?${p.toString()}`;
}

export function memberWorkloadSliceHref(userId, slice) {
  if (!userId) return '/erp/projects';
  if (slice === 'all') return memberProjectsHref(userId, { status: 'all' });
  if (slice === 'completed') return memberProjectsHref(userId, { status: 'completed' });
  if (slice === 'active') return memberProjectsHref(userId, { status: 'active' });
  if (slice === 'overdue') return memberProjectsHref(userId, { status: 'active', taskDue: 'overdue' });
  if (slice === 'dueSoon') return memberProjectsHref(userId, { status: 'active', taskDue: 'due7' });
  if (slice === 'assigned') return memberProjectsHref(userId, { status: 'active' });
  return '/erp/projects';
}
