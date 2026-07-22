/**
 * Emails that may self-provision (or claim) an ERP `admin` profile without an invite.
 * Merges server env vars with the same defaults used for /admin dashboard access.
 */
export function getErpPortalAdminEmails() {
  const set = new Set(['info@digitalisglobal.com']);

  for (const key of ['ERP_PORTAL_ADMIN_EMAILS', 'ERP_ADMIN_EMAILS']) {
    const raw = process.env[key];
    if (typeof raw === 'string' && raw.trim()) {
      for (const e of raw.split(',')) {
        const norm = e.trim().toLowerCase();
        if (norm) set.add(norm);
      }
    }
  }

  const dashRaw = process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_EMAILS;
  if (typeof dashRaw === 'string' && dashRaw.trim()) {
    for (const e of dashRaw.split(',')) {
      const norm = e.trim().toLowerCase();
      if (norm) set.add(norm);
    }
  }

  return [...set];
}

export function isErpPortalAdminEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return getErpPortalAdminEmails().includes(email.trim().toLowerCase());
}
