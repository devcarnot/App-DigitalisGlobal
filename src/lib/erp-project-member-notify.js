import { getPublicSiteOrigin } from './public-site-url';
import { sendErpAddedToProjectEmail } from './erp-resend';
import { downloadProjectAttachmentsForEmail } from './erp-project-attachments';
import { erpNotificationRelativeLink } from './erp-notification-link';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @param {() => Promise<{ ok: boolean, error?: string }>} fn */
async function sendTransactionalEmailWithRetries(fn, attempts = 3) {
  let lastErr = null;
  for (let a = 1; a <= attempts; a += 1) {
    const r = await fn();
    if (r.ok) return r;
    lastErr = r.error;
    if (a < attempts) await sleep(350 * a);
  }
  return { ok: false, error: lastErr };
}

async function loadProjectEmailBrief(admin, projectId) {
  const fallback = {
    projectName: 'a project',
    projectDescription: '',
    resendAttachments: [],
    skippedAttachmentNames: [],
  };
  if (!admin || !projectId) return fallback;

  const { data: project } = await admin
    .from('erp_projects')
    .select('id, name, description, description_attachments')
    .eq('id', projectId)
    .maybeSingle();

  if (!project) return fallback;

  const projectDescription = project.description ? String(project.description).trim() : '';
  const { resendAttachments, skippedNames } = await downloadProjectAttachmentsForEmail(
    admin,
    project.description_attachments,
  );

  return {
    projectName: project.name || 'a project',
    projectDescription,
    resendAttachments,
    skippedAttachmentNames: skippedNames,
  };
}

/**
 * In-app notification + optional email when a user is added to a project.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 */
export async function notifyUserAddedToProject(admin, options) {
  const {
    userId,
    projectId,
    projectName = 'a project',
    projectDescription = '',
    resendAttachments = [],
    skippedAttachmentNames = [],
    inviterUserId = null,
    inviterName = 'A team admin',
    recipientEmail = null,
    sendEmail = true,
  } = options || {};

  if (!admin || !userId || !projectId) {
    return { ok: false, notified: false, emailed: false };
  }

  const safeName = String(projectName || 'a project').trim() || 'a project';
  const inviter = String(inviterName || 'A team admin').trim() || 'A team admin';
  const title = `Added to ${safeName}`;
  const body = `${inviter} added you to ${safeName}.`;
  const link = erpNotificationRelativeLink(`/erp/projects/${projectId}`);

  const { error: notifErr } = await admin.from('erp_notifications').insert({
    user_id: userId,
    title: title.slice(0, 200),
    body: body.slice(0, 500),
    read: false,
    link,
  });

  if (notifErr) {
    console.warn('notifyUserAddedToProject notification', notifErr.message);
  }

  let emailed = false;
  if (sendEmail) {
    try {
      let to = recipientEmail ? String(recipientEmail).trim() : '';
      if (!to) {
        const { data: authData } = await admin.auth.admin.getUserById(userId);
        to = authData?.user?.email ? String(authData.user.email).trim() : '';
      }
      if (to) {
        const base = getPublicSiteOrigin().replace(/\/$/, '');
        const sendResult = await sendTransactionalEmailWithRetries(() =>
          sendErpAddedToProjectEmail({
            to,
            projectName: safeName,
            inviterName: inviter,
            loginUrl: `${base}/erp/login`,
            projectUrl: `${base}/erp/projects/${projectId}`,
            projectDescription,
            resendAttachments,
            skippedAttachmentNames,
          }),
        );
        emailed = Boolean(sendResult?.ok);
        if (!sendResult?.ok && sendResult?.error && sendResult.error !== 'Email not configured') {
          console.warn('notifyUserAddedToProject email', sendResult.error);
        }
      }
    } catch (e) {
      console.warn('notifyUserAddedToProject email', e?.message || e);
    }
  }

  return {
    ok: !notifErr,
    notified: !notifErr,
    emailed,
    emailError: sendEmail && !emailed && process.env.RESEND_API_KEY ? 'Email could not be sent' : null,
  };
}

/**
 * Notify multiple users added to the same project (skips inviter / excluded ids).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 */
export async function notifyUsersAddedToProject(admin, options) {
  const {
    userIds = [],
    projectId,
    projectName,
    projectDescription,
    resendAttachments,
    skippedAttachmentNames,
    inviterUserId = null,
    inviterName = 'A team admin',
    excludeUserIds = [],
  } = options || {};

  const exclude = new Set([...(excludeUserIds || []), inviterUserId].filter(Boolean));
  const ids = [...new Set((userIds || []).filter((id) => id && !exclude.has(id)))];
  if (!admin || !projectId || ids.length === 0) {
    return { notified: 0, emailed: 0 };
  }

  let brief = null;
  if (
    projectName == null ||
    projectDescription == null ||
    resendAttachments == null ||
    skippedAttachmentNames == null
  ) {
    brief = await loadProjectEmailBrief(admin, projectId);
  }

  const name = projectName ?? brief?.projectName ?? 'a project';
  const desc = projectDescription ?? brief?.projectDescription ?? '';
  const attachments = resendAttachments ?? brief?.resendAttachments ?? [];
  const skipped = skippedAttachmentNames ?? brief?.skippedAttachmentNames ?? [];

  let notified = 0;
  let emailed = 0;
  for (const userId of ids) {
    const result = await notifyUserAddedToProject(admin, {
      userId,
      projectId,
      projectName: name,
      projectDescription: desc,
      resendAttachments: attachments,
      skippedAttachmentNames: skipped,
      inviterUserId,
      inviterName,
      sendEmail: true,
    });
    if (result.notified) notified += 1;
    if (result.emailed) emailed += 1;
  }

  return { notified, emailed };
}
