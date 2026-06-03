import { isErpMessagingNotification } from './erp-activity-feed';

/**
 * Turn stored notification links (often absolute production URLs) into in-app
 * paths so Next.js client navigation keeps `?with=` / `?group=` deep links.
 */
export function normalizeErpNotificationHref(link, origin) {
  if (link == null || link === '') return '/erp/dashboard';
  const raw = String(link).trim();
  if (!raw) return '/erp/dashboard';

  if (raw.startsWith('/erp/') || raw === '/erp') {
    return raw.startsWith('/erp') ? raw : '/erp/dashboard';
  }

  try {
    const base =
      origin ||
      (typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost');
    const u = new URL(raw, base);
    if (u.pathname.startsWith('/erp')) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
  } catch {
    /* fall through */
  }

  if (raw.includes('/erp/')) {
    const idx = raw.indexOf('/erp/');
    return raw.slice(idx);
  }

  return '/erp/dashboard';
}

/**
 * Best-effort deep link for DM / group message notifications.
 */
export function resolveErpNotificationNavigationHref(notification, origin) {
  const row = notification || {};
  const href = normalizeErpNotificationHref(row.link, origin);

  if (!isErpMessagingNotification(row)) return href;

  try {
    const base =
      origin ||
      (typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost');
    const u = new URL(href, base);
    const path = u.pathname.replace(/\/+$/, '') || u.pathname;

    if (path === '/erp/messages' || path.startsWith('/erp/messages/')) {
      if (u.searchParams.get('with') || u.searchParams.get('group')) {
        return `${u.pathname}${u.search}`;
      }
    } else {
      return href;
    }

    const linkRaw = String(row.link || '');
    if (linkRaw) {
      try {
        const fromStored = new URL(linkRaw, base);
        const withId = fromStored.searchParams.get('with');
        const groupId = fromStored.searchParams.get('group');
        if (withId) return `/erp/messages?with=${encodeURIComponent(withId)}`;
        if (groupId) return `/erp/messages?group=${encodeURIComponent(groupId)}`;
      } catch {
        const withM = linkRaw.match(/[?&]with=([^&]+)/i);
        const groupM = linkRaw.match(/[?&]group=([^&]+)/i);
        if (withM?.[1]) return `/erp/messages?with=${decodeURIComponent(withM[1])}`;
        if (groupM?.[1]) return `/erp/messages?group=${decodeURIComponent(groupM[1])}`;
      }
    }
  } catch {
    return href;
  }

  return href;
}

/**
 * @param {import('next/navigation').AppRouterInstance} router
 * @param {{ link?: string | null, title?: string | null, body?: string | null } | null | undefined} notification
 * @param {string} [origin]
 */
export function navigateToErpNotification(router, notification, origin) {
  const href = resolveErpNotificationNavigationHref(notification, origin);
  router.push(href);
}

/** Server-side: store relative ERP paths in `erp_notifications.link`. */
export function erpNotificationRelativeLink(pathnameAndSearch) {
  const raw = String(pathnameAndSearch || '').trim();
  if (!raw) return '/erp/dashboard';
  if (raw.startsWith('/erp/') || raw === '/erp') return raw;
  if (raw.startsWith('/')) return raw;
  return `/erp/${raw.replace(/^\/+/, '')}`;
}
