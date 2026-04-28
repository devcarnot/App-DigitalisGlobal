import { NextResponse } from 'next/server';

/** Strip port / www.; lowercase for comparison */
function canonicalHost(headerValue) {
  if (!headerValue) return '';
  const h = String(headerValue).split(':')[0].trim().toLowerCase();
  return h.startsWith('www.') ? h.slice(4) : h;
}

/**
 * When set on production (comma-separated hosts), reject other Host headers (CSRF-ish hardening).
 * Set only on the Production env in Vercel so Preview (*.vercel.app) still works, or include those hosts.
 *
 * Example: PRODUCTION_ALLOWED_HOSTS=app.digitalisglobal.com
 */
export function middleware(request) {
  const allowlistRaw = process.env.PRODUCTION_ALLOWED_HOSTS;
  if (process.env.NODE_ENV === 'production' && typeof allowlistRaw === 'string' && allowlistRaw.trim()) {
    const allowed = allowlistRaw
      .split(',')
      .map((s) => canonicalHost(s))
      .filter(Boolean);
    if (allowed.length > 0) {
      const host = canonicalHost(request.headers.get('host'));
      if (host && !allowed.includes(host)) {
        return new NextResponse('Forbidden', { status: 403 });
      }
    }
  }

  /**
   * Development: disable caching for navigations and API responses so the browser does not
   * keep an old HTML/RSC document that references previous `/_next/static/*` chunk URLs.
   * That mismatch is the usual cause of mass 404s for layout.css, main-app.js, and page
   * chunks after HMR, `dev:clean`, or a dev-server restart while a tab stays open.
   *
   * Static assets under `/_next/static` stay cacheable for the current session.
   */
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.next();
  }
  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate, max-age=0');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
