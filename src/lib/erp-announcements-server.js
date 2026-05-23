import { erpInvitePublicBaseUrl } from './erp-invite-server';
import { isErpClientSideRole } from './erp-roles';
import { sendErpAnnouncementEmail } from './erp-resend';
import { sendPushToUser } from './erp-push-server';

const EMAIL_BATCH = 8;

/**
 * Resolve the best delivery address for a workspace user (contact_email first).
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{ id: string, contact_email?: string | null }} profile
 */
export async function resolveErpUserDeliveryEmail(admin, profile) {
  const contact = profile?.contact_email && String(profile.contact_email).trim();
  if (contact) return contact;
  if (!admin?.auth?.admin?.getUserById || !profile?.id) return null;
  try {
    const { data, error } = await admin.auth.admin.getUserById(profile.id);
    if (error || !data?.user?.email) return null;
    return String(data.user.email).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Internal staff = everyone who is not a client-side workspace role.
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 */
export async function listErpStaffProfiles(admin) {
  if (!admin) return [];
  const { data, error } = await admin
    .from('erp_profiles')
    .select('id, role, contact_email, full_name');
  if (error) {
    console.warn('[announcements] could not load staff profiles:', error.message);
    return [];
  }
  return (data || []).filter((row) => !isErpClientSideRole(row.role));
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
    return {
      recipients: 0,
      emailsSent: 0,
      emailsFailed: 0,
      emailsSkippedNoAddress: 0,
      notifications: 0,
    };
  }

  const staffProfiles = await listErpStaffProfiles(admin);
  const recipientProfiles = staffProfiles.filter((p) => p.id && p.id !== authorId);
  const recipientIds = recipientProfiles.map((p) => p.id);

  if (recipientIds.length === 0) {
    return {
      recipients: 0,
      emailsSent: 0,
      emailsFailed: 0,
      emailsSkippedNoAddress: 0,
      notifications: 0,
    };
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

  let emailsSent = 0;
  let emailsFailed = 0;
  let emailsSkippedNoAddress = 0;
  /** @type {string[]} */
  const emailErrors = [];

  for (let i = 0; i < recipientProfiles.length; i += EMAIL_BATCH) {
    const batch = recipientProfiles.slice(i, i + EMAIL_BATCH);
    const results = await Promise.all(
      batch.map(async (profile) => {
        const to = await resolveErpUserDeliveryEmail(admin, profile);
        if (!to) {
          return { ok: false, reason: 'no_email', userId: profile.id };
        }
        const result = await sendErpAnnouncementEmail({
          to,
          title,
          body: announcement.body,
          authorName,
          announcementUrl: link,
        });
        return { ...result, userId: profile.id, to };
      }),
    );

    for (const result of results) {
      if (result.ok) {
        emailsSent += 1;
      } else if (result.reason === 'no_email') {
        emailsSkippedNoAddress += 1;
      } else {
        emailsFailed += 1;
        if (result.error && emailErrors.length < 5) {
          emailErrors.push(String(result.error));
        }
        console.warn('[announcements] email failed:', result.userId, result.error || result.reason);
      }
    }
  }

  return {
    recipients: recipientIds.length,
    emailsSent,
    emailsFailed,
    emailsSkippedNoAddress,
    notifications: notifErr ? 0 : recipientIds.length,
    emailErrors,
  };
}
