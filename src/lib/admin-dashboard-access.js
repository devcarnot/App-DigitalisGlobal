/**
 * /admin (marketing dashboard) is restricted to specific Supabase auth emails.
 * Set NEXT_PUBLIC_ADMIN_DASHBOARD_EMAILS=one@corp.com,other@corp.com (comma-separated, case-insensitive).
 * If unset, only info@digitalisglobal.com is allowed.
 */
export function getAllowedAdminDashboardEmails() {
  const raw = process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_EMAILS;
  if (typeof raw === 'string' && raw.trim() !== '') {
    return raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }
  return ['info@digitalisglobal.com'];
}

export function isEmailAllowedForAdminDashboard(email) {
  if (!email || typeof email !== 'string') return false;
  const norm = email.trim().toLowerCase();
  return getAllowedAdminDashboardEmails().includes(norm);
}
