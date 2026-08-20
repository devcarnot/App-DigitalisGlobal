/**
 * Sidebar structure: sections and items. Each item maps to one RBAC module (`module` key).
 * Visibility is `erpRbacCan(grants, module, 'view')`.
 */

import { ERP_RBAC_MODULE_META } from './erp-rbac-modules';
import { ERP_WORKSPACE_ROLE_LABELS, isErpGlobalAdmin } from './erp-roles';

/** @deprecated Use ERP_WORKSPACE_ROLE_LABELS from `./erp-roles` */
export const ERP_RBAC_ROLE_LABELS = ERP_WORKSPACE_ROLE_LABELS;

/**
 * @typedef {{ href: string, label: string, iconId: string, module: string }} ErpNavBlueprintItem
 * @typedef {{ sectionId: string, sectionTitle: string | null, items: ErpNavBlueprintItem[] }} ErpNavBlueprintSection
 */

/** @type {ErpNavBlueprintSection[]} */
export const ERP_NAV_BLUEPRINT = [
  {
    sectionId: 'overview',
    sectionTitle: null,
    items: [{ href: '/erp/dashboard', label: 'Home', iconId: 'home', module: 'dashboard' }],
  },
  {
    sectionId: 'work',
    sectionTitle: 'Work',
    items: [
      { href: '/erp/projects', label: 'Projects', iconId: 'projects', module: 'projects' },
      { href: '/erp/my-tasks', label: 'My tasks', iconId: 'folder', module: 'tasks' },
      { href: '/erp/notes', label: 'Notes', iconId: 'notes', module: 'notes' },
      { href: '/erp/files', label: 'Files', iconId: 'files', module: 'files' },
    ],
  },
  {
    sectionId: 'communication',
    sectionTitle: 'Communication',
    items: [
      { href: '/erp/messages', label: 'Messages', iconId: 'messages', module: 'messages' },
      { href: '/erp/meetings', label: 'Meetings', iconId: 'calendar', module: 'meetings' },
      { href: '/erp/reminders', label: 'Reminders', iconId: 'bell', module: 'reminders' },
      { href: '/erp/announcements', label: 'Announcements', iconId: 'megaphone', module: 'announcements' },
      { href: '/erp/admin/clients', label: 'Clients', iconId: 'clients', module: 'clients' },
    ],
  },
  {
    sectionId: 'hr',
    sectionTitle: 'HR',
    items: [
      { href: '/erp/admin/members', label: 'Members', iconId: 'users', module: 'members' },
      {
        href: '/erp/attendance',
        label: ERP_RBAC_MODULE_META.attendance.label,
        iconId: 'calendar',
        module: 'attendance',
      },
      {
        href: '/erp/team/attendance',
        label: 'Team attendance',
        iconId: 'calendar',
        module: 'attendance_admin',
        teamLeadOnly: true,
      },
      {
        href: '/erp/admin/attendance',
        label: 'Attendance administration',
        iconId: 'calendar',
        module: 'attendance_admin',
        globalAdminOnly: true,
      },
      { href: '/erp/leave', label: 'Leave', iconId: 'leave', module: 'leave' },
      { href: '/erp/remote', label: 'Remote', iconId: 'remote', module: 'remote' },
    ],
  },
  {
    sectionId: 'reports',
    sectionTitle: 'Reports',
    items: [
      { href: '/erp/admin/performance', label: 'Performance', iconId: 'performance', module: 'performance' },
      { href: '/erp/admin/statistics', label: 'Statistics', iconId: 'chart', module: 'statistics' },
      { href: '/erp/admin/finance', label: 'Finance', iconId: 'finance', module: 'finance' },
    ],
  },
  {
    sectionId: 'administration',
    sectionTitle: 'Administration',
    items: [
      {
        href: '/erp/admin/administration',
        label: 'Administration',
        iconId: 'settings',
        module: 'settings',
        modules: ['settings', 'settings_roles'],
      },
    ],
  },
  {
    sectionId: 'system',
    sectionTitle: 'System',
    items: [
      { href: '/erp/inbox', label: 'Recent Activity', iconId: 'inbox', module: 'inbox' },
      { href: '/erp/admin/invites', label: 'Invites & users', iconId: 'users', module: 'members' },
      { href: '/erp/admin/trash', label: 'Trash', iconId: 'trash', module: 'trash' },
    ],
  },
];

/**
 * @param {ErpNavBlueprintSection[]} blueprint
 * @param {(moduleKey: string) => boolean} canView
 * @param {string | undefined | null} [profileRole]
 * @returns {ErpNavBlueprintSection[]}
 */
export function erpNavFilterSections(blueprint, canView, profileRole) {
  const globalAdmin = isErpGlobalAdmin(profileRole);

  return blueprint
    .map((sec) => ({
      ...sec,
      items: sec.items.filter((it) => {
        const moduleOk = Array.isArray(it.modules) && it.modules.length
          ? it.modules.some((m) => canView(m))
          : canView(it.module);
        if (!moduleOk) return false;
        if (it.teamLeadOnly && globalAdmin) return false;
        if (it.globalAdminOnly && !globalAdmin) return false;
        return true;
      }),
    }))
    .filter((sec) => sec.items.length > 0);
}

/**
 * @param {ErpNavBlueprintSection[]} filtered
 * @returns {ErpNavBlueprintItem[]}
 */
export function erpNavFlattenItems(filtered) {
  return filtered.flatMap((sec) => sec.items);
}
