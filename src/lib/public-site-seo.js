import { getPublicSiteOrigin } from './public-site-url';

/** Google Search Console HTML tag verification for app.digitalisglobal.com */
export const GOOGLE_SITE_VERIFICATION_APP =
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ||
  process.env.GOOGLE_SITE_VERIFICATION ||
  'C3wcsYd3WdVaffWke7zlXdHo-74fOt16El09hbPlnYc';

export function getWorkspaceLandingOrigin() {
  return getPublicSiteOrigin();
}

export function getWorkspaceLandingCanonical() {
  const base = getWorkspaceLandingOrigin().replace(/\/$/, '');
  return `${base}/`;
}

/** Shared site-wide verification + PWA hints for the public workspace host. */
export function buildRootSiteMetadata() {
  return {
    verification: {
      google: GOOGLE_SITE_VERIFICATION_APP,
    },
    other: {
      'google-site-verification': GOOGLE_SITE_VERIFICATION_APP,
      'mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-title': 'Digitalis Workspace',
      'apple-mobile-web-app-status-bar-style': 'black-translucent',
    },
  };
}

/** Homepage (/) SEO — indexed landing; ERP routes stay noindex via nested layouts. */
export function buildWorkspaceLandingPageMetadata() {
  const origin = getWorkspaceLandingOrigin().replace(/\/$/, '');
  const canonical = `${origin}/`;
  const title = 'Digitalis Workspace | Client & Team Portal';
  const description =
    'Sign in to the Digitalis workspace—projects, tasks, messages, and desktop apps for teams and clients in one secure portal.';
  const ogImage = `${origin}/Digitalis_logo_black.png`;

  return {
    title: 'Workspace',
    description,
    keywords: [
      'Digitalis Global workspace',
      'Digitalis client portal',
      'Digitalis team workspace',
      'project management portal',
      'Digitalis ERP login',
      'Digitalis workspace app',
    ],
    alternates: {
      canonical,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
      },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'Digitalis Global',
      locale: 'en_US',
      type: 'website',
      images: [
        {
          url: ogImage,
          alt: 'Digitalis Global',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}
