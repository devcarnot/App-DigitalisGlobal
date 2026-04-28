/**
 * Fire-and-forget: notify the user by email after a successful workspace sign-in.
 * Requires RESEND_API_KEY on the server. Uses keepalive so the request still runs
 * when the client navigates away right after login (router.replace).
 */
export function notifyLoginAfterSignIn(accessToken, context) {
  if (!accessToken || typeof window === 'undefined') return;
  const valid = ['admin', 'erp', 'invite'].includes(context) ? context : 'erp';
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
  }).catch(() => {});
}
