/**
 * Fire-and-forget: notify the user by email after a successful password sign-in.
 * Requires RESEND_API_KEY on the server. Uses the same Supabase session token.
 */
export function notifyLoginAfterSignIn(accessToken, context) {
  if (!accessToken || typeof window === 'undefined') return;
  const valid = ['admin', 'erp', 'invite'].includes(context) ? context : 'erp';
  fetch('/api/auth/notify-login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ context: valid }),
  }).catch(() => {});
}
