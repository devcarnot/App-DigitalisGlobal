/**
 * ERP workspace RBAC: module slugs and default grants by stored `erp_profiles.role`.
 * DB row `erp_workspace_role_permissions.grants` merges over these defaults (super admin UI).
 *
 * Role storage mapping (display names can be shown in UI):
 *   admin       → Super Admin
 *   team_lead   → Team Manager (same as current team lead)
 *   hr          → HR
 *   bd          → Business Developer
 *   team_member → Member
 *   client      → Client
 */

/** @typedef {'view' | 'create' | 'edit' | 'delete'} ErpRbacAction */

/** @type {ErpRbacAction[]} */
export const ERP_RBAC_ACTIONS = ['view', 'create', 'edit', 'delete'];

/**
 * @typedef {{ label: string, group: string, sort: number, description?: string }} ErpRbacModuleMeta
 * @type {Record<string, ErpRbacModuleMeta>}
 */
export const ERP_RBAC_MODULE_META = {
  dashboard: { label: 'Home / Dashboard', group: 'core', sort: 0 },
  projects: { label: 'Projects', group: 'work', sort: 1 },
  tasks: { label: 'Tasks', group: 'work', sort: 2 },
  notes: {
    label: 'Notes (Kanban)',
    group: 'work',
    sort: 3,
    description: "Personal Kanban board for what's next; visible only to its author.",
  },
  files: { label: 'Files', group: 'work', sort: 4 },
  messages: { label: 'Messages', group: 'communication', sort: 5 },
  clients: { label: 'Clients', group: 'communication', sort: 6 },
  meetings: { label: 'Meetings', group: 'communication', sort: 7 },
  members: { label: 'Members (admin)', group: 'hr', sort: 8 },
  attendance: { label: 'Attendance (self)', group: 'hr', sort: 9 },
  attendance_admin: { label: 'Attendance (admin)', group: 'hr', sort: 10 },
  leave: { label: 'Leave', group: 'hr', sort: 11 },
  remote: { label: 'Remote / time', group: 'hr', sort: 12 },
  performance: { label: 'Performance', group: 'reports', sort: 13 },
  statistics: { label: 'Statistics', group: 'reports', sort: 14 },
  finance: { label: 'Finance', group: 'reports', sort: 15 },
  inbox: { label: 'Recent activity', group: 'system', sort: 16 },
  trash: { label: 'Trash', group: 'system', sort: 17 },
  settings: { label: 'Admin settings', group: 'system', sort: 18 },
  settings_roles: { label: 'Roles & permissions', group: 'system', sort: 19 },
};

/** @param {boolean} v @param {boolean} c @param {boolean} e @param {boolean} d */
function g(v, c, e, d) {
  return { view: v, create: c, edit: e, delete: d };
}

const V = g(true, false, false, false);
const M = g(true, true, true, true);

/** Super Admin: full app; self check-in uses attendance (view); roster/tools use attendance_admin. */
const ADMIN = {
  dashboard: V,
  projects: M,
  tasks: M,
  notes: M,
  files: M,
  messages: M,
  clients: M,
  meetings: M,
  members: M,
  attendance: V,
  attendance_admin: M,
  leave: M,
  remote: M,
  performance: M,
  statistics: M,
  finance: M,
  inbox: V,
  trash: g(true, false, false, true),
  settings: g(true, true, true, true),
  settings_roles: g(true, true, true, true),
};

/** Team Manager = team_lead */
const MANAGER = {
  dashboard: V,
  projects: M,
  tasks: M,
  notes: M,
  files: M,
  messages: M,
  clients: M,
  meetings: M,
  members: g(true, true, true, false),
  attendance: V,
  attendance_admin: g(true, true, true, false),
  leave: M,
  remote: M,
  performance: M,
  statistics: M,
  finance: g(false, false, false, false),
  inbox: V,
  trash: g(false, false, false, false),
  settings: g(false, false, false, false),
  settings_roles: g(false, false, false, false),
};

const HR_ROLE = {
  dashboard: V,
  projects: g(false, false, false, false),
  tasks: g(false, false, false, false),
  notes: M,
  files: g(false, false, false, false),
  messages: M,
  clients: g(true, false, false, false),
  meetings: M,
  members: g(true, true, true, false),
  attendance: g(true, true, true, false),
  attendance_admin: g(true, true, true, false),
  leave: M,
  remote: g(true, false, false, false),
  performance: g(false, false, false, false),
  statistics: g(false, false, false, false),
  finance: g(false, false, false, false),
  inbox: V,
  trash: g(false, false, false, false),
  settings: g(false, false, false, false),
  settings_roles: g(false, false, false, false),
};

const BD_ROLE = {
  dashboard: V,
  projects: g(true, false, false, false),
  tasks: g(false, false, false, false),
  notes: g(false, false, false, false),
  files: g(true, false, false, false),
  messages: M,
  clients: M,
  meetings: M,
  members: g(false, false, false, false),
  attendance: V,
  attendance_admin: g(false, false, false, false),
  leave: g(false, false, false, false),
  remote: g(false, false, false, false),
  performance: g(true, false, false, false),
  statistics: g(false, false, false, false),
  finance: g(false, false, false, false),
  inbox: V,
  trash: g(false, false, false, false),
  settings: g(false, false, false, false),
  settings_roles: g(false, false, false, false),
};

const MEMBER = {
  dashboard: V,
  projects: g(true, false, false, false),
  tasks: g(true, true, true, false),
  notes: g(false, false, false, false),
  files: M,
  messages: M,
  clients: g(false, false, false, false),
  meetings: g(true, true, true, false),
  members: g(false, false, false, false),
  attendance: g(true, true, true, false),
  attendance_admin: g(false, false, false, false),
  leave: M,
  remote: M,
  performance: g(false, false, false, false),
  statistics: g(false, false, false, false),
  finance: g(false, false, false, false),
  inbox: V,
  trash: g(false, false, false, false),
  settings: g(false, false, false, false),
  settings_roles: g(false, false, false, false),
};

const CLIENT = {
  dashboard: V,
  projects: g(true, false, false, false),
  tasks: g(true, false, false, false),
  notes: g(false, false, false, false),
  files: g(true, false, false, false),
  messages: M,
  clients: g(false, false, false, false),
  meetings: g(true, false, false, false),
  members: g(false, false, false, false),
  attendance: g(false, false, false, false),
  attendance_admin: g(false, false, false, false),
  leave: g(false, false, false, false),
  remote: g(false, false, false, false),
  performance: g(false, false, false, false),
  statistics: g(false, false, false, false),
  finance: g(false, false, false, false),
  inbox: g(true, false, false, false),
  trash: g(false, false, false, false),
  settings: g(false, false, false, false),
  settings_roles: g(false, false, false, false),
};

/** @type {Record<string, Record<string, { view: boolean, create: boolean, edit: boolean, delete: boolean }>>} */
export const ERP_RBAC_DEFAULTS_BY_ROLE = {
  admin: ADMIN,
  team_lead: MANAGER,
  team_member: MEMBER,
  client: CLIENT,
  hr: HR_ROLE,
  bd: BD_ROLE,
};

const ALL_MODULE_KEYS = Object.keys(ERP_RBAC_MODULE_META);

/**
 * Clone defaults for a role (every known module gets a grant object).
 * @param {string | null | undefined} roleKey
 */
export function erpRbacDefaultGrantsForRole(roleKey) {
  const rk = String(roleKey || '').trim() || 'team_member';
  const src = ERP_RBAC_DEFAULTS_BY_ROLE[rk] || ERP_RBAC_DEFAULTS_BY_ROLE.team_member;
  const out = {};
  for (const key of ALL_MODULE_KEYS) {
    const base = src[key] || g(false, false, false, false);
    out[key] = { ...base };
  }
  return out;
}

/**
 * @param {Record<string, { view?: boolean, create?: boolean, edit?: boolean, delete?: boolean }>} merged
 * @param {string} moduleKey
 * @param {ErpRbacAction} action
 */
export function erpRbacCan(merged, moduleKey, action) {
  const m = merged?.[moduleKey];
  if (!m) return false;
  return Boolean(m[action]);
}

/**
 * @param {string | null | undefined} roleKey
 * @param {unknown} dbGrantsJson — partial overrides from DB
 */
export function erpRbacMergeDefaults(roleKey, dbGrantsJson) {
  const base = erpRbacDefaultGrantsForRole(roleKey);
  const patch = dbGrantsJson && typeof dbGrantsJson === 'object' ? dbGrantsJson : {};
  for (const mk of ALL_MODULE_KEYS) {
    const p = patch[mk];
    if (!p || typeof p !== 'object') continue;
    base[mk] = {
      view: Boolean(p.view),
      create: Boolean(p.create),
      edit: Boolean(p.edit),
      delete: Boolean(p.delete),
    };
  }
  return base;
}

/**
 * Apply per-user patch on top of an already merged role matrix.
 * Keys present in userPatch replace that module entirely.
 * @param {Record<string, { view: boolean, create: boolean, edit: boolean, delete: boolean }>} roleMerged
 * @param {unknown} userPatchJson
 */
export function erpRbacApplyUserGrantsPatch(roleMerged, userPatchJson) {
  const patch = userPatchJson && typeof userPatchJson === 'object' ? userPatchJson : {};
  const out = {};
  for (const mk of ALL_MODULE_KEYS) {
    const b = roleMerged?.[mk] || g(false, false, false, false);
    out[mk] = { view: b.view, create: b.create, edit: b.edit, delete: b.delete };
  }
  for (const mk of ALL_MODULE_KEYS) {
    const p = patch[mk];
    if (!p || typeof p !== 'object') continue;
    out[mk] = {
      view: Boolean(p.view),
      create: Boolean(p.create),
      edit: Boolean(p.edit),
      delete: Boolean(p.delete),
    };
  }
  return out;
}

/**
 * Store only modules where the desired matrix differs from merged role grants (no user row).
 * @param {Record<string, { view: boolean, create: boolean, edit: boolean, delete: boolean }>} roleMerged
 * @param {Record<string, { view?: boolean, create?: boolean, edit?: boolean, delete?: boolean }>} desiredFull
 */
export function erpRbacCompactUserDeltaVsRoleMerged(roleMerged, desiredFull) {
  const out = {};
  for (const mk of ALL_MODULE_KEYS) {
    const d = desiredFull?.[mk];
    if (!d || typeof d !== 'object') continue;
    const n = {
      view: Boolean(d.view),
      create: Boolean(d.create),
      edit: Boolean(d.edit),
      delete: Boolean(d.delete),
    };
    const r = roleMerged?.[mk];
    if (!r || n.view !== r.view || n.create !== r.create || n.edit !== r.edit || n.delete !== r.delete) {
      out[mk] = n;
    }
  }
  return out;
}

/**
 * Persist only overrides vs code defaults so new modules keep receiving default grants until edited.
 * @param {string | null | undefined} roleKey
 * @param {Record<string, { view?: boolean, create?: boolean, edit?: boolean, delete?: boolean }>} editedFull
 */
export function erpRbacCompactDeltaAgainstDefaults(roleKey, editedFull) {
  const defaults = erpRbacDefaultGrantsForRole(roleKey);
  const out = {};
  for (const mk of ALL_MODULE_KEYS) {
    const e = editedFull?.[mk];
    if (!e || typeof e !== 'object') continue;
    const n = {
      view: Boolean(e.view),
      create: Boolean(e.create),
      edit: Boolean(e.edit),
      delete: Boolean(e.delete),
    };
    const d = defaults[mk];
    if (n.view !== d.view || n.create !== d.create || n.edit !== d.edit || n.delete !== d.delete) {
      out[mk] = n;
    }
  }
  return out;
}
