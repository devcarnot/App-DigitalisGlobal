import webpush from 'web-push';
import { createSupabaseAdmin } from './supabase-admin';

function getVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  const subject = process.env.VAPID_SUBJECT || 'mailto:info@digitalisglobal.com';
  return { publicKey, privateKey, subject };
}

export function vapidPublicKey() {
  return getVapid().publicKey || '';
}

export function isPushConfigured() {
  const v = getVapid();
  return Boolean(v.publicKey && v.privateKey);
}

function initWebPush() {
  const { publicKey, privateKey, subject } = getVapid();
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

/**
 * Send a push notification to all subscriptions for a user.
 * Removes dead subscriptions (410/404) best-effort.
 */
export async function sendPushToUser({ userId, payload }) {
  if (!userId) return { ok: false, sent: 0, reason: 'no_user' };
  if (!initWebPush()) return { ok: false, sent: 0, reason: 'push_not_configured' };

  const admin = createSupabaseAdmin();
  if (!admin) return { ok: false, sent: 0, reason: 'server_misconfigured' };

  const { data: subs, error } = await admin
    .from('erp_push_subscriptions')
    .select('id, endpoint, subscription')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(10);

  if (error || !subs?.length) return { ok: true, sent: 0, reason: 'no_subscriptions' };

  let sent = 0;
  for (const row of subs) {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify(payload));
      sent += 1;
    } catch (e) {
      const status = e?.statusCode || e?.status || null;
      if (status === 404 || status === 410) {
        await admin.from('erp_push_subscriptions').delete().eq('id', row.id);
      }
    }
  }
  return { ok: true, sent };
}

