/** Default shortcuts shown in the mobile Quick (+) fan. */
export const MOBILE_QUICK_ACTIONS_DEFAULT = [
  '/erp/my-tasks',
  '/erp/notes',
  '/erp/announcements',
  '/erp/inbox',
];

/** Fixed bottom bar: not available in quick actions. */
export const MOBILE_BOTTOM_BAR_HREFS = new Set(['/erp/dashboard', '/erp/messages', '/erp/projects']);

export const MOBILE_QUICK_MAX = 8;
export const MOBILE_QUICK_MIN = 1;

export function mobileQuickActionsStorageKey(userId) {
  return userId ? `erp_mobile_quick_actions_${userId}` : 'erp_mobile_quick_actions';
}

/**
 * @param {string[]} hrefs
 * @param {Set<string> | undefined} allowedHrefs
 */
export function sanitizeMobileQuickActionHrefs(hrefs, allowedHrefs) {
  const seen = new Set();
  const out = [];
  for (const raw of hrefs || []) {
    const h = String(raw || '').trim();
    if (!h || MOBILE_BOTTOM_BAR_HREFS.has(h)) continue;
    if (allowedHrefs && !allowedHrefs.has(h)) continue;
    if (seen.has(h)) continue;
    seen.add(h);
    out.push(h);
    if (out.length >= MOBILE_QUICK_MAX) break;
  }
  if (out.length >= MOBILE_QUICK_MIN) return out;
  return sanitizeMobileQuickActionHrefs(MOBILE_QUICK_ACTIONS_DEFAULT, allowedHrefs);
}

export function loadMobileQuickActionHrefs(userId, allowedHrefs) {
  if (typeof window === 'undefined') {
    return sanitizeMobileQuickActionHrefs(MOBILE_QUICK_ACTIONS_DEFAULT, allowedHrefs);
  }
  try {
    const raw = localStorage.getItem(mobileQuickActionsStorageKey(userId));
    if (!raw) return sanitizeMobileQuickActionHrefs(MOBILE_QUICK_ACTIONS_DEFAULT, allowedHrefs);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return sanitizeMobileQuickActionHrefs(MOBILE_QUICK_ACTIONS_DEFAULT, allowedHrefs);
    }
    return sanitizeMobileQuickActionHrefs(parsed, allowedHrefs);
  } catch {
    return sanitizeMobileQuickActionHrefs(MOBILE_QUICK_ACTIONS_DEFAULT, allowedHrefs);
  }
}

export function saveMobileQuickActionHrefs(userId, hrefs) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(mobileQuickActionsStorageKey(userId), JSON.stringify(hrefs));
}
