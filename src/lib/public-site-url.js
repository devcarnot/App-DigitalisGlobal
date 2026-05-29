/**
 * Canonical public origin for absolute URLs used in emails, notifications, Supabase redirects,
 * and ERP invite links (`/erp/accept-invite`, `/erp/projects/...`, etc.).
 *
 * Production (ERP / workspace): set NEXT_PUBLIC_SITE_URL=https://app.digitalisglobal.com (no trailing slash).
 * That origin is used for invites, notifications, password reset redirectTo, etc. Marketing often stays on www — keep those separate.
 * Supabase Auth redirect allowlist must include https://app.digitalisglobal.com/erp/reset-password (and preview URLs if used).
 */

/** @param {string} raw */
function stripTrailingSlashes(raw) {
  return String(raw).trim().replace(/\/+$/, '');
}

/**
 * Resolve site origin from environment (server and client bundles).
 * Order matches legacy `erpInvitePublicBaseUrl`: explicit site URL first, then common aliases, Vercel, localhost.
 */
export function getPublicSiteOrigin() {
  const candidates = [
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SITE_URL : undefined,
    typeof process !== 'undefined' ? process.env.FRONTEND_URL : undefined,
    typeof process !== 'undefined' ? process.env.API_PUBLIC_URL : undefined,
  ];
  for (const raw of candidates) {
    if (raw && String(raw).trim()) {
      return stripTrailingSlashes(raw);
    }
  }
  if (typeof process !== 'undefined' && process.env.VERCEL_URL) {
    const v = process.env.VERCEL_URL;
    const full = v.startsWith('http') ? v : `https://${v}`;
    return stripTrailingSlashes(full);
  }
  return 'http://localhost:3000';
}

/**
 * Browser: use the current page origin for auth redirects (OAuth, password reset) so
 * local dev works even when NEXT_PUBLIC_SITE_URL points at production. Server-side
 * email/invite links still use getPublicSiteOrigin() / NEXT_PUBLIC_SITE_URL.
 */
export function getPublicSiteOriginForBrowser() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const current = stripTrailingSlashes(window.location.origin);
    const env =
      typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SITE_URL
        ? stripTrailingSlashes(String(process.env.NEXT_PUBLIC_SITE_URL))
        : '';
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(current)) {
      return current;
    }
    if (env) return env;
    return current;
  }
  return getPublicSiteOrigin();
}

/**
 * Public marketing website origin (separate from the workspace app).
 *
 * Pages like `/blog`, `/blog/[slug]`, and `/careers/job/[slug]` are *published*
 * from this admin app but they LIVE on the marketing site — they're not routes
 * inside Next.js here. Use this helper anywhere we need to link to a public
 * page from inside the admin/ERP UI.
 *
 * Configurable via NEXT_PUBLIC_MARKETING_SITE_URL. Defaults to the production
 * marketing origin so links work in dev/preview without extra env setup.
 */
export function getMarketingSiteOrigin() {
  const env =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MARKETING_SITE_URL
      ? stripTrailingSlashes(String(process.env.NEXT_PUBLIC_MARKETING_SITE_URL))
      : '';
  return env || 'https://www.digitalisglobal.com';
}
