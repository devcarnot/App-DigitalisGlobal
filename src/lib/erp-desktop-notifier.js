import { resolveErpNotificationNavigationHref } from './erp-notification-link';

/**
 * Native OS notifications bridge.
 *
 * The web app already has an in-app toast + sidebar dropdown for every
 * `erp_notifications` row, but those only show when the user is actually
 * looking at the app. When the desktop app is open in the background (focus
 * is in a browser or another app), nothing currently surfaces a new message
 * / incoming call to the OS.
 *
 * This module bridges the same notification stream into the platform's
 * native toast surface (Windows Action Center, macOS Notification Center,
 * GNOME / KDE shell, etc.) using the standard `Notification` Web API.
 *
 * Inside the Electron shell:
 *   * `desktop/main.js` auto-grants `notifications` permission for the
 *     workspace origin and sets the AppUserModelID so Windows attributes
 *     the toast to "Digitalis Workspace" rather than "Electron".
 *   * `desktop/preload.js` exposes `__DIGITALIS_DESKTOP_BRIDGE__.focusWindow()`
 *     so clicking a toast brings the BrowserWindow to front before the
 *     in-app navigation runs.
 *
 * In a browser the same code path is used — the user is asked once for
 * permission (on a real click, to satisfy gesture requirements) and then
 * the toasts show up via the browser's notification surface.
 */

/** Visibility check: are we ACTUALLY looking at the app right now? */
function isUserPresent() {
  if (typeof document === 'undefined') return true;
  const visible = document.visibilityState === 'visible';
  // `hasFocus` distinguishes "tab visible but window not focused" (e.g. the
  // user is typing into another app while the desktop client is on a second
  // monitor). We treat that as "not present" so they still get a toast.
  let focused = true;
  try {
    focused = document.hasFocus();
  } catch {
    /* hasFocus throws in some embedded contexts */
  }
  return visible && focused;
}

/** Is the OS Notification API even available (covers Safari iOS + SSR)? */
function hasNotificationApi() {
  return typeof window !== 'undefined' && typeof window.Notification === 'function';
}

/** Are we running inside the Electron desktop shell? */
function isDesktopShell() {
  return typeof window !== 'undefined' && window.__DIGITALIS_DESKTOP__ === true;
}

/** Current permission, or `'unsupported'` for browsers without the API. */
export function getDesktopNotificationPermission() {
  if (!hasNotificationApi()) return 'unsupported';
  try {
    return window.Notification.permission;
  } catch {
    return 'denied';
  }
}

/** Pending request promise — share across callers so we don't double-prompt. */
let pendingPermissionRequest = null;

/**
 * Ask the user for notification permission. Resolves to the final permission
 * state ('granted' | 'denied' | 'default' | 'unsupported'). Safe to call
 * repeatedly; only one prompt actually fires.
 */
export async function ensureDesktopNotificationPermission() {
  if (!hasNotificationApi()) return 'unsupported';
  const current = getDesktopNotificationPermission();
  if (current === 'granted' || current === 'denied') return current;
  if (pendingPermissionRequest) return pendingPermissionRequest;
  pendingPermissionRequest = (async () => {
    try {
      // Some browsers no longer return the result via the legacy callback,
      // so we await the promise form. Falls back to the older API if needed.
      const req = window.Notification.requestPermission();
      const result = req && typeof req.then === 'function'
        ? await req
        : await new Promise((resolve) => {
            try {
              window.Notification.requestPermission(resolve);
            } catch {
              resolve('denied');
            }
          });
      return result || 'default';
    } catch {
      return 'denied';
    } finally {
      pendingPermissionRequest = null;
    }
  })();
  return pendingPermissionRequest;
}

/** Per-session de-dupe of notification ids — surface a toast at most once. */
const deliveredIds = new Set();
/** Hard cap so the set can't grow unbounded across a long session. */
const DELIVERED_ID_CAP = 500;

/**
 * Trim verbose prefixes from notification titles for the OS toast.
 *
 * The toast header already carries the workspace name ("Digitalis Workspace")
 * so prepending "Direct message from" or "Message from" to every title is
 * pure noise — `"Hamza"` + body `"hi"` reads exactly like a WhatsApp /
 * iMessage toast. We leave structured titles (`"New message in #channel"`,
 * `"Mention in <Project>"`, `"Incoming call from …"`, etc.) untouched
 * because they carry context the body alone wouldn't convey.
 */
function prettifyTitleForToast(rawTitle) {
  if (!rawTitle) return '';
  const title = String(rawTitle);
  const directDmMatch = title.match(/^Direct message from\s+(.+)$/i);
  if (directDmMatch) return directDmMatch[1].trim();
  const messageFromMatch = title.match(/^Message from\s+(.+)$/i);
  if (messageFromMatch) return messageFromMatch[1].trim();
  return title;
}

/**
 * Show a native OS notification for an inbox / activity event.
 *
 * @param {{
 *   id?: string,
 *   title: string,
 *   body?: string,
 *   link?: string,
 *   tag?: string,              // OS notification tag — same tag replaces the previous toast
 *   icon?: string,             // optional icon URL; defaults to PWA icon on the same origin
 *   requireInteraction?: boolean, // keep the toast around until clicked (use for calls)
 *   silent?: boolean,          // suppress the OS notification sound
 *   force?: boolean,           // show even if the user is currently focused on the app
 * }} payload
 * @returns {Notification | null}
 */
export function notifyDesktop(payload) {
  if (!payload || !payload.title) return null;
  if (!hasNotificationApi()) return null;
  if (getDesktopNotificationPermission() !== 'granted') return null;

  // The in-app toast covers this case; firing a second OS toast on top would
  // just be noise. Calls bypass this with `force: true`.
  if (!payload.force && isUserPresent()) return null;

  const dedupeKey = payload.id != null ? `id:${payload.id}` : `tag:${payload.tag || payload.title}`;
  if (deliveredIds.has(dedupeKey)) return null;
  deliveredIds.add(dedupeKey);
  if (deliveredIds.size > DELIVERED_ID_CAP) {
    const arr = [...deliveredIds];
    deliveredIds.clear();
    for (const k of arr.slice(-Math.floor(DELIVERED_ID_CAP / 2))) deliveredIds.add(k);
  }

  let icon = payload.icon;
  if (!icon && typeof window !== 'undefined') {
    // Prefer the PWA icon when available; the OS falls back to the app icon
    // (bound via AppUserModelID inside Electron) if this 404s.
    try {
      icon = new URL('/icons/pwa-192.png', window.location.origin).toString();
    } catch {
      /* ignore — we'll just let the OS pick */
    }
  }

  const displayTitle = prettifyTitleForToast(payload.title);

  let notification;
  try {
    notification = new window.Notification(displayTitle, {
      body: payload.body || '',
      tag: payload.tag || (payload.id != null ? `erp-${payload.id}` : undefined),
      // `renotify: true` makes Windows re-toast even if a notification with
      // the same tag is already in Action Center — important so a fresh
      // message doesn't get silently merged into a previous one the user
      // already dismissed visually.
      renotify: Boolean(payload.tag || payload.id),
      requireInteraction: Boolean(payload.requireInteraction),
      silent: Boolean(payload.silent),
      icon,
      data: {
        link: resolveErpNotificationNavigationHref(
          { link: payload.link, title: payload.title, body: payload.body },
          typeof window !== 'undefined' ? window.location.origin : undefined,
        ),
      },
    });
  } catch {
    return null;
  }

  notification.onclick = () => {
    try {
      notification.close();
    } catch {
      /* close failures are harmless */
    }
    // Bring the desktop window to the front before navigating, otherwise
    // the renderer fires the route change while the BrowserWindow is still
    // minimised / hidden behind another app.
    try {
      window.__DIGITALIS_DESKTOP_BRIDGE__?.focusWindow?.();
    } catch {
      /* preload bridge missing — browsers fall back to window.focus() */
    }
    try {
      window.focus();
    } catch {}
    const href = resolveErpNotificationNavigationHref(
      { link: payload.link, title: payload.title, body: payload.body },
      window.location.origin,
    );
    try {
      const target = new URL(href, window.location.origin);
      if (target.pathname === window.location.pathname && target.search === window.location.search) {
        return;
      }
      window.location.href = `${target.pathname}${target.search}${target.hash}`;
    } catch {
      window.location.href = href;
    }
  };

  return notification;
}

/**
 * Optional shortcut for "is this user actually away from the app right now"
 * so callers can skip work (sound playback, dashboard reloads, etc.) when
 * the user isn't watching.
 */
export function isDesktopUserAway() {
  return !isUserPresent();
}

/** Convenience flag so UI can tailor copy ("Enable desktop notifications" vs. browser). */
export function isRunningInDesktopShell() {
  return isDesktopShell();
}
