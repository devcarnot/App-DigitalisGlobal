import { compareTaskPriority, normalizeTaskPriority } from './erp-task-priority';

/**
 * When several root rows exist (legacy data), prefer the anchor whose title matches the project name; otherwise oldest.
 * @param {{ id: string, title?: string | null, created_at?: string }[]} rootRows
 * @param {string | null | undefined} projectName
 * @returns {{ id: string, title?: string | null, created_at?: string } | null}
 */
export function pickCanonicalRootTask(rootRows, projectName) {
  const sorted = [...(rootRows || [])].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ta - tb;
  });
  if (!sorted.length) return null;
  const nm = (projectName && String(projectName).trim()) || '';
  if (nm) {
    const match = sorted.find((r) => String(r.title || '').trim() === nm);
    if (match) return match;
  }
  return sorted[0];
}

/**
 * @param {{ id: string, parent_task_id?: string | null, priority?: string, created_at?: string }[]} flatTasks
 */
export function buildTaskForest(flatTasks) {
  const list = flatTasks || [];
  const roots = list.filter((t) => !t.parent_task_id);
  const byParent = {};
  for (const t of list) {
    if (!t.parent_task_id) continue;
    const pid = t.parent_task_id;
    if (!byParent[pid]) byParent[pid] = [];
    byParent[pid].push(t);
  }
  const sortFn = (a, b) => {
    const pr = compareTaskPriority(normalizeTaskPriority(a.priority), normalizeTaskPriority(b.priority));
    if (pr !== 0) return pr;
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ta - tb;
  };
  roots.sort(sortFn);
  for (const k of Object.keys(byParent)) {
    byParent[k].sort(sortFn);
  }
  return { roots, byParent };
}

/**
 * @param {{ project_id: string }[]} flatTasks
 * @returns {Record<string, typeof flatTasks>}
 */
export function groupTasksByProjectId(flatTasks) {
  /** @type {Record<string, typeof flatTasks>} */
  const out = {};
  for (const t of flatTasks || []) {
    const pid = t.project_id;
    if (!pid) continue;
    if (!out[pid]) out[pid] = [];
    out[pid].push(t);
  }
  return out;
}
