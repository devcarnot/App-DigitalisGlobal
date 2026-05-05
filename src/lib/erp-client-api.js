import { supabase } from './supabase';

/**
 * Resolve a valid access JWT for Next.js ERP routes (`getErpUserFromRequest` uses
 * `Authorization: Bearer` only — cookies are not read server-side).
 *
 * Call `getUser()` first: it validates with Supabase and refreshes an expired access
 * token into the client session. Using only `getSession()` first often returns a
 * stale or empty token right after load (and matches GoTrue "Auth session missing").
 */
async function getAccessTokenForApi() {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return null;
  }

  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    return session.access_token;
  }

  const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
  if (!refErr && refreshed?.session?.access_token) {
    return refreshed.session.access_token;
  }

  ({
    data: { session },
  } = await supabase.auth.getSession());
  return session?.access_token ?? null;
}

function buildFetchInit(input, init, accessToken) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  const body = init.body;
  const isMultipart =
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof Blob !== 'undefined' && body instanceof Blob);
  if (body != null && !isMultipart && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return { ...init, headers, credentials: 'same-origin' };
}

/**
 * Attach Bearer token for Next.js ERP API routes (`getErpUserFromRequest` expects
 * `Authorization: Bearer <access_token>` — cookies are not read server-side).
 *
 * On 401, refreshes the session once and retries (handles expired JWT at request time).
 */
export async function erpAuthorizedFetch(input, init = {}) {
  let accessToken = await getAccessTokenForApi();
  if (!accessToken) {
    throw new Error('Not signed in');
  }

  let res = await fetch(input, buildFetchInit(input, init, accessToken));

  if (res.status === 401) {
    await supabase.auth.refreshSession();
    accessToken = await getAccessTokenForApi();
    if (accessToken) {
      res = await fetch(input, buildFetchInit(input, init, accessToken));
    }
  }

  return res;
}

/**
 * Built-in and custom workspace roles for assignment UI (viewer-filtered; see API).
 * @returns {Promise<{ ok: boolean, options: { id: string, label: string, builtin?: boolean }[] }>}
 */
export async function fetchErpWorkspaceRoleTypeOptions() {
  try {
    const res = await erpAuthorizedFetch('/api/erp/admin/workspace-role-types');
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(j.options)) {
      return { ok: false, options: [] };
    }
    return {
      ok: true,
      options: j.options.map((o) => ({
        id: String(o.id),
        label: String(o.label || o.id),
        builtin: Boolean(o.builtin),
      })),
    };
  } catch {
    return { ok: false, options: [] };
  }
}

/** Default selection for invite / role selects after loading workspace-role-types. */
export function resolveDefaultWorkspaceRoleInviteId(options, preferred = 'team_member') {
  const list = Array.isArray(options) ? options : [];
  if (!list.length) return preferred;
  if (list.some((o) => o?.id === preferred)) return preferred;
  return String(list[0]?.id || preferred);
}
