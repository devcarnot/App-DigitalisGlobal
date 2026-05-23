import { erpInvitePublicBaseUrl } from './erp-invite-server';
import { sendErpAnnouncementEmail } from './erp-resend';
import { sendPushToUser } from './erp-push-server';

const STAFF_ROLES = new Set([
  'admin',
  'team_lead',
  'team_member',
  'hr',
  'bd',
]);

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @returns {Promise<string[]>}
 */
export async function listErpStaffUserIds(admin) {
  if (!admin) return [];
  const { data, error } = await admin.from('erp_profiles').select('id, role');
  if (error) return [];
  return (data || [])
    .filter((row) => STAFF_ROLES.has(String(row.role || '').trim()))
    .map((row) => row.id)
    .filter(Boolean);
}

/**
 * Notify all internal staff about a new announcement (in-app bell, push, email).
 *
 * @param {object} args
 * @param {import('@supabase/supabase-js').SupabaseClient} args.admin
 * @param {{ id: string, title: string, body: string, created_at?: string }} args.announcement
 * @param {string} args.authorName
 * @param {string} [args.authorId]
 */
export async function broadcastErpAnnouncement({ admin, announcement, authorName, authorId }) {
  if (!admin || !announcement?.id) {
    return { recipients: 0, emailsSent: 0, notifications: 0 };
  }

  const recipientIds = (await listErpStaffUserIds(admin)).filter((id) => id !== authorId);
  if (recipientIds.length === 0) {
    return { recipients: 0, emailsSent: 0, notifications: 0 };
  }

  const base = erpInvitePublicBaseUrl().replace(/\/$/, '');
  const link = `${base}/erp/announcements?id=${encodeURIComponent(announcement.id)}`;
  const title = String(announcement.title || 'Announcement').trim();
  const bodyPreview = String(announcement.body || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);

  const notifRows = recipientIds.map((uid) => ({
    user_id: uid,
    title: `Announcement: ${title}`,
    body: `${authorName} posted a workspace announcement.`,
    link,
  }));

  const { error: notifErr } = await admin.from('erp_notifications').insert(notifRows);
  if (notifErr) {
    console.warn('[announcements] notification insert failed:', notifErr.message);
  }

  await Promise.allSettled(
    recipientIds.map((uid) =>
      sendPushToUser({
        userId: uid,
        payload: {
          title: `Announcement: ${title}`.slice(0, 100),
          body: bodyPreview.slice(0, 140) || `${authorName} posted an update.`,
          url: link,
        },
      }),
    ),
  );

  const emailResults = await Promise.allSettled(
    recipientIds.map(async (userId) => {
      try {
        const { data, error } = await admin.auth.admin.getUserById(userId);
        const email = data?.user?.email;
        if (error || !email) return { ok: false };
        return await sendErpAnnouncementEmail({
          to: email,
          title,
          body: announcement.body,
          authorName,
          announcementUrl: link,
        });
      } catch {
        return { ok: false };
      }
    }),
  );

  let emailsSent = 0;
  for (const r of emailResults) {
    if (r.status === 'fulfilled' && r.value?.ok) emailsSent += 1;
  }

  return {
    recipients: recipientIds.length,
    emailsSent,
    notifications: notifErr ? 0 : recipientIds.length,
  };
}
