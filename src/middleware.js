import { NextResponse } from 'next/server';

/**
 * Development: disable caching for navigations and API responses so the browser does not
 * keep an old HTML/RSC document that references previous `/_next/static/*` chunk URLs.
 * That mismatch is the usual cause of mass 404s for layout.css, main-app.js, and page
 * chunks after HMR, `dev:clean`, or a dev-server restart while a tab stays open.
 *
 * Static assets under `/_next/static` stay cacheable for the current session.
 */
export function middleware() {
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
