/** Match server throttle so duplicate tabs / remounts do not hammer the API. */
const NOTIFY_CLIENT_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * Fire-and-forget: notify the user by email after a successful password sign-in.
 * Requires RESEND_API_KEY on the server. Uses keepalive so the request still runs
 * when the client navigates away right after login (router.replace).
 *
 * Pass `userId` when known so sessionStorage dedupes retries in the same browser.
 */
export function notifyLoginAfterSignIn(accessToken, context, userId) {
  if (!accessToken || typeof window === 'undefined') return;
  const valid = ['admin', 'erp', 'invite'].includes(context) ? context : 'erp';
  const storageKey = userId ? `erp_login_notify:${userId}` : null;
  if (storageKey) {
    const now = Date.now();
    const raw = sessionStorage.getItem(storageKey);
    const last = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(last) && now - last < NOTIFY_CLIENT_WINDOW_MS) return;
  }
  const body = JSON.stringify({ context: valid });
  fetch('/api/auth/notify-login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body,
    keepalive: true,
    credentials: 'same-origin',
  })
    .then(async (res) => {
      let data = {};
      try {
        data = await res.json();
      } catch {
        /* ignore */
      }
      if (data.ok && storageKey) sessionStorage.setItem(storageKey, String(Date.now()));
    })
    .catch(() => {});
}
