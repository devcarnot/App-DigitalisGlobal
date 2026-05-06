import { getPublicSiteOriginForBrowser } from './public-site-url';

/**
 * URL for Supabase `redirectTo` on password reset. Same canonical origin as invite/email links
 * (see `getPublicSiteOriginForBrowser` / `NEXT_PUBLIC_SITE_URL`).
 */
export function getPasswordResetRedirectTo() {
  const origin = getPublicSiteOriginForBrowser();
  return origin ? `${origin}/erp/reset-password` : '';
}

/** Supabase OAuth `redirectTo` (Google, etc.). Must be listed under Supabase Auth → URL configuration → Redirect URLs. */
export function getOAuthCallbackRedirectTo() {
  const origin = getPublicSiteOriginForBrowser();
  return origin ? `${origin}/erp/auth/callback` : '';
}
