import { Resend } from 'resend';
import { getPublicSiteOrigin } from './public-site-url';

const resendApiKey = process.env.RESEND_API_KEY;

/** Public marketing / website link in transactional email footers — matches NEXT_PUBLIC_SITE_URL */
function emailMarketingHref() {
  return getPublicSiteOrigin();
}

function emailMarketingLabel() {
  const h = emailMarketingHref();
  return h.replace(/^https?:\/\//i, '').replace(/\/$/, '') || h;
}

const fromEmail =
  process.env.RESEND_FROM_EMAIL ||
  process.env.FROM_EMAIL ||
  'Digitalis Global <onboarding@resend.dev>';

function escapeAttrUrl(u) {
  return String(u ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtml(s) {
  if (s == null || typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Improves deliverability vs HTML-only; set RESEND_REPLY_TO or TO_EMAIL to a monitored inbox. */
function replyToAddress() {
  const explicit = process.env.RESEND_REPLY_TO || process.env.RESEND_REPLY_TO_EMAIL || process.env.TO_EMAIL;
  if (explicit) return explicit.trim();
  const m = String(fromEmail).match(/<([^>]+)>/);
  return m ? m[1].trim() : undefined;
}

const TRANSACTIONAL_HEADERS = {
  'Auto-Submitted': 'auto-generated',
  'X-Auto-Response-Suppress': 'OOF, AutoReply',
};

function transactionalSendOptions() {
  const reply = replyToAddress();
  const o = { headers: TRANSACTIONAL_HEADERS };
  if (reply) o.replyTo = reply;
  return o;
}

export async function sendErpInviteEmail({
  to,
  inviteUrl,
  inviterName,
  projectName,
  projectDescription = '',
  resendAttachments = [],
  skippedAttachmentNames = [],
}) {
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY missing; invite email not sent.');
    return { ok: false, error: 'Email not configured' };
  }

  const resend = new Resend(resendApiKey);
  const subject = 'You’re invited · Digitalis Global workspace';
  const safeInviter = escapeHtml(String(inviterName || 'A team admin'));
  const safeProject = projectName ? escapeHtml(String(projectName)) : '';
  const href = escapeAttrUrl(inviteUrl);
  const footerHref = escapeAttrUrl(emailMarketingHref());
  const footerLabel = escapeHtml(emailMarketingLabel());
  const projectPhrase = safeProject
    ? ` to the project <strong style="color:#0f172a;">${safeProject}</strong>`
    : ' to the <strong style="color:#0f172a;">team workspace</strong>';

  const descRaw = typeof projectDescription === 'string' ? projectDescription.trim() : '';
  const descSnippet = descRaw.slice(0, 2000);
  const safeDesc = escapeHtml(descSnippet);
  const briefBlock =
    descSnippet || (resendAttachments?.length > 0 || skippedAttachmentNames?.length > 0)
      ? `
                <tr>
                  <td style="padding:0 36px 8px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">Project brief</p>
                    ${
                      descSnippet
                        ? `<p style="margin:0;font-size:14px;line-height:1.65;color:#334155;white-space:pre-wrap;">${safeDesc}</p>`
                        : ''
                    }
                    ${
                      resendAttachments?.length > 0
                        ? `<p style="margin:${descSnippet ? '14px' : '0'} 0 0;font-size:14px;line-height:1.6;color:#475569;">We’ve attached <strong style="color:#0f172a;">${resendAttachments.length}</strong> file${resendAttachments.length === 1 ? '' : 's'} from this project (brief / reference materials).</p>`
                        : ''
                    }
                    ${
                      skippedAttachmentNames?.length > 0
                        ? `<p style="margin:12px 0 0;font-size:13px;line-height:1.55;color:#64748b;">Additional files are available in the workspace after you join: <strong style="color:#475569;">${escapeHtml(skippedAttachmentNames.join(', '))}</strong></p>`
                        : ''
                    }
                  </td>
                </tr>`
      : '';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>Workspace invitation</title>
</head>
<body style="margin:0;padding:0;background-color:#e8eef4;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#e8eef4;width:0;height:0;">
    ${safeInviter} invited you to collaborate on Digitalis Global.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#e8eef4;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
          <tr>
            <td style="padding:0;border-radius:12px 12px 0 0;overflow:hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td width="55%" bgcolor="#589CD5" style="padding:22px 26px;background-color:#589CD5;">
                    <p style="margin:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:21px;font-weight:700;letter-spacing:-0.02em;color:#ffffff;">Digitalis Global</p>
                    <p style="margin:8px 0 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.9);">Workspace invitation</p>
                  </td>
                  <td width="45%" bgcolor="#52C4C9" style="padding:22px 26px;background-color:#52C4C9;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:36px 36px 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    <p style="margin:0;font-size:15px;line-height:1.65;color:#64748b;">Hello,</p>
                    <p style="margin:20px 0 0;font-size:17px;line-height:1.6;color:#0f172a;">
                      <strong style="color:#0f172a;">${safeInviter}</strong> has invited you${projectPhrase}.
                    </p>
                    <p style="margin:18px 0 0;font-size:15px;line-height:1.65;color:#475569;">
                      Use the secure button below to set your password and open your workspace. You’ll get access to projects, team chat, and shared files.
                    </p>
                  </td>
                </tr>
                ${briefBlock}
                <tr>
                  <td style="padding:8px 36px 36px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="left" bgcolor="#589CD5" style="border-radius:10px;background-color:#589CD5;">
                          <a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 34px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Accept invitation</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
                      This link expires in <strong style="color:#475569;">7 days</strong>. If you didn’t request this, you can ignore this email—no account will be created.
                    </p>
                    <p style="margin:16px 0 0;font-size:12px;line-height:1.55;color:#94a3b8;word-break:break-all;">
                      If the button doesn’t work, copy and paste this link into your browser:<br>
                      <a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#589CD5;text-decoration:underline;">${escapeHtml(String(inviteUrl))}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:22px 28px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:1px solid #e2e8f0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0;font-size:12px;line-height:1.55;color:#94a3b8;text-align:center;">
                <strong style="color:#64748b;font-weight:600;">Digitalis Global</strong> · Full-cycle digital agency<br>
                <a href="${footerHref}" style="color:#589CD5;text-decoration:none;">${footerLabel}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const inviterPlain = String(inviterName || 'A team admin');
  const projectPlain = projectName ? String(projectName) : '';
  const textLines = [
    'Hello,',
    '',
    `${inviterPlain} invited you to collaborate on Digitalis Global${projectPlain ? ` (project: ${projectPlain})` : ''}.`,
    '',
  ];
  if (descSnippet) {
    textLines.push('— Project brief —', descSnippet, '');
  }
  if (resendAttachments?.length > 0) {
    textLines.push(
      `Attached: ${resendAttachments.length} file(s) from the project brief.`,
      ''
    );
  }
  if (skippedAttachmentNames?.length > 0) {
    textLines.push(
      `Also in the workspace after you join: ${skippedAttachmentNames.join(', ')}`,
      ''
    );
  }
  textLines.push(
    'Set your password and open your workspace. This link expires in 7 days:',
    String(inviteUrl),
    '',
    'If you did not expect this message, you can ignore it.',
    '',
    '—',
    'Digitalis Global',
    emailMarketingHref(),
  );
  const text = textLines.join('\n');

  const sendPayload = {
    from: fromEmail,
    to: [to],
    subject,
    html,
    text,
    ...transactionalSendOptions(),
  };
  if (Array.isArray(resendAttachments) && resendAttachments.length > 0) {
    sendPayload.attachments = resendAttachments;
  }

  const { data, error } = await resend.emails.send(sendPayload);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id };
}

/** Existing workspace user added to another project — no signup / invite link. */
export async function sendErpAddedToProjectEmail({
  to,
  projectName,
  inviterName,
  loginUrl,
  projectUrl,
  projectDescription = '',
  resendAttachments = [],
  skippedAttachmentNames = [],
}) {
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY missing; added-to-project email not sent.');
    return { ok: false, error: 'Email not configured' };
  }

  const resend = new Resend(resendApiKey);
  const safeProject = escapeHtml(String(projectName || 'a project'));
  const safeInviter = escapeHtml(String(inviterName || 'A team admin'));
  const loginHref = escapeAttrUrl(loginUrl);
  const openHref = escapeAttrUrl(projectUrl || loginUrl);
  const footerHref = escapeAttrUrl(emailMarketingHref());
  const footerLabel = escapeHtml(emailMarketingLabel());
  const subject = `You were added to ${String(projectName || 'a project')} · Digitalis Global`;

  const descRaw = typeof projectDescription === 'string' ? projectDescription.trim() : '';
  const descSnippet = descRaw.slice(0, 2000);
  const safeDesc = escapeHtml(descSnippet);
  const addedBriefBlock =
    descSnippet || (resendAttachments?.length > 0 || skippedAttachmentNames?.length > 0)
      ? `
                <tr>
                  <td style="padding:0 36px 8px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">Project brief</p>
                    ${
                      descSnippet
                        ? `<p style="margin:0;font-size:14px;line-height:1.65;color:#334155;white-space:pre-wrap;">${safeDesc}</p>`
                        : ''
                    }
                    ${
                      resendAttachments?.length > 0
                        ? `<p style="margin:${descSnippet ? '14px' : '0'} 0 0;font-size:14px;line-height:1.6;color:#475569;">We’ve attached <strong style="color:#0f172a;">${resendAttachments.length}</strong> file${resendAttachments.length === 1 ? '' : 's'} for this project.</p>`
                        : ''
                    }
                    ${
                      skippedAttachmentNames?.length > 0
                        ? `<p style="margin:12px 0 0;font-size:13px;line-height:1.55;color:#64748b;">Larger or extra files: open the project in the workspace — <strong style="color:#475569;">${escapeHtml(skippedAttachmentNames.join(', '))}</strong></p>`
                        : ''
                    }
                  </td>
                </tr>`
      : '';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>New project access</title>
</head>
<body style="margin:0;padding:0;background-color:#e8eef4;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#e8eef4;width:0;height:0;">
    You now have access to ${String(projectName || 'a project')} on Digitalis Global. Sign in with your existing account.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#e8eef4;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
          <tr>
            <td style="padding:0;border-radius:12px 12px 0 0;overflow:hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td width="55%" bgcolor="#589CD5" style="padding:22px 26px;background-color:#589CD5;">
                    <p style="margin:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:21px;font-weight:700;letter-spacing:-0.02em;color:#ffffff;">Digitalis Global</p>
                    <p style="margin:8px 0 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.9);">New project</p>
                  </td>
                  <td width="45%" bgcolor="#52C4C9" style="padding:22px 26px;background-color:#52C4C9;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:36px 36px 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    <p style="margin:0;font-size:15px;line-height:1.65;color:#64748b;">Hello,</p>
                    <p style="margin:20px 0 0;font-size:17px;line-height:1.6;color:#0f172a;">
                      <strong style="color:#0f172a;">${safeInviter}</strong> added you to the project <strong style="color:#0f172a;">${safeProject}</strong>.
                    </p>
                    <p style="margin:18px 0 0;font-size:15px;line-height:1.65;color:#475569;">
                      <strong style="color:#0f172a;">You already have a workspace account.</strong> Sign in with your usual email and password to open this project. You do <strong style="color:#0f172a;">not</strong> need to register again or use an invitation link.
                    </p>
                  </td>
                </tr>
                ${addedBriefBlock}
                <tr>
                  <td style="padding:8px 36px 36px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="left" bgcolor="#589CD5" style="border-radius:10px;background-color:#589CD5;">
                          <a href="${openHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 34px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Open project</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
                      Prefer the sign-in page? <a href="${loginHref}" target="_blank" rel="noopener noreferrer" style="color:#589CD5;text-decoration:underline;">Log in here</a>.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:22px 28px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:1px solid #e2e8f0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0;font-size:12px;line-height:1.55;color:#94a3b8;text-align:center;">
                <strong style="color:#64748b;font-weight:600;">Digitalis Global</strong> · Full-cycle digital agency<br>
                <a href="${footerHref}" style="color:#589CD5;text-decoration:none;">${footerLabel}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const projectPlain = String(projectName || 'a project');
  const inviterPlain = String(inviterName || 'A team admin');
  const addedTextLines = [
    'Hello,',
    '',
    `${inviterPlain} added you to the project "${projectPlain}" on Digitalis Global.`,
    '',
  ];
  if (descSnippet) {
    addedTextLines.push('— Project brief —', descSnippet, '');
  }
  if (resendAttachments?.length > 0) {
    addedTextLines.push(`Attached: ${resendAttachments.length} file(s).`, '');
  }
  if (skippedAttachmentNames?.length > 0) {
    addedTextLines.push(`Also in the workspace: ${skippedAttachmentNames.join(', ')}`, '');
  }
  addedTextLines.push(
    'You already have a workspace account. Sign in with your usual email and password.',
    'You do not need to register again or use an invitation link.',
    '',
    `Open project: ${String(projectUrl || loginUrl)}`,
    `Sign in: ${String(loginUrl)}`,
    '',
    '—',
    'Digitalis Global',
    emailMarketingHref(),
  );
  const text = addedTextLines.join('\n');

  const addedSendPayload = {
    from: fromEmail,
    to: [to],
    subject,
    html,
    text,
    ...transactionalSendOptions(),
  };
  if (Array.isArray(resendAttachments) && resendAttachments.length > 0) {
    addedSendPayload.attachments = resendAttachments;
  }

  const { data, error } = await resend.emails.send(addedSendPayload);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id };
}

/** Email project members who are not currently active in the workspace (see notify-message skip window). */
export async function sendErpNewMessageEmail({ to, projectName, senderName, snippet, projectUrl, kind = 'message' }) {
  if (!resendApiKey) {
    return { ok: false, error: 'Email not configured' };
  }

  const resend = new Resend(resendApiKey);
  const isMention = kind === 'mention';
  const subject = isMention
    ? `You were mentioned in ${projectName} · Digitalis Global`
    : `New message in ${projectName} · Digitalis Global`;
  const safeProject = escapeHtml(projectName);
  const safeSender = escapeHtml(senderName);
  const safeSnippet = escapeHtml(snippet).slice(0, 500) || '(no preview)';
  const openHref = escapeAttrUrl(projectUrl);
  const footerHref = escapeAttrUrl(emailMarketingHref());
  const footerLabel = escapeHtml(emailMarketingLabel());

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>New message</title>
</head>
<body style="margin:0;padding:0;background-color:#e8eef4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#e8eef4;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
          <tr>
            <td style="padding:0;border-radius:12px 12px 0 0;overflow:hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td width="55%" bgcolor="#589CD5" style="padding:20px 24px;background-color:#589CD5;">
                    <p style="margin:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:19px;font-weight:700;color:#ffffff;">Digitalis Global</p>
                    <p style="margin:6px 0 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.9);">Workspace</p>
                  </td>
                  <td width="45%" bgcolor="#52C4C9" style="padding:20px 24px;background-color:#52C4C9;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;padding:32px 36px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;">${isMention ? 'Mention' : 'New message'}</p>
              <p style="margin:14px 0 0;font-size:17px;line-height:1.55;color:#0f172a;">
                <strong style="color:#0f172a;">${safeSender}</strong> ${isMention ? 'mentioned you in' : 'in'} <strong style="color:#0f172a;">${safeProject}</strong>
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;">
                <tr>
                  <td style="padding:16px 18px;background-color:#f1f5f9;border-radius:10px;border:1px solid #e2e8f0;">
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">${safeSnippet}</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;">
                <tr>
                  <td align="left" bgcolor="#589CD5" style="border-radius:10px;background-color:#589CD5;">
                    <a href="${openHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Open project</a>
                  </td>
                </tr>
              </table>
              <p style="margin:22px 0 0;font-size:12px;line-height:1.55;color:#64748b;">
                ${
                  isMention
                    ? 'You’re receiving this because you were @mentioned and don’t appear to be active in the workspace right now.'
                    : 'You’re receiving this because you don’t appear to be active in the workspace right now. Open the project to reply in chat.'
                }
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:20px 28px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:1px solid #e2e8f0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;text-align:center;">
                <strong style="color:#64748b;">Digitalis Global</strong><br>
                <a href="${footerHref}" style="color:#589CD5;text-decoration:none;">${footerLabel}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    isMention
      ? `You were mentioned in ${String(projectName)} · Digitalis Global`
      : `New message in ${String(projectName)} · Digitalis Global`,
    '',
    `${String(senderName)} wrote:`,
    String(snippet || '').slice(0, 500) || '(no preview)',
    '',
    `Open project: ${String(projectUrl)}`,
    '',
    isMention
      ? 'You are receiving this because you were @mentioned and do not appear to be active in the workspace right now.'
      : 'You are receiving this because you do not appear to be active in the workspace right now.',
  ].join('\n');

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: [to],
    subject,
    html,
    text,
    ...transactionalSendOptions(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id };
}

/** Direct message — emailed when the recipient is not active in the workspace (see /api/erp/notify-dm). */
export async function sendErpDirectMessageEmail({ to, senderName, snippet, messagesUrl }) {
  if (!resendApiKey) {
    return { ok: false, error: 'Email not configured' };
  }

  const resend = new Resend(resendApiKey);
  const safeSender = escapeHtml(senderName);
  const safeSnippet = escapeHtml(snippet).slice(0, 500) || '(no preview)';
  const openHref = escapeAttrUrl(messagesUrl);
  const footerHref = escapeAttrUrl(emailMarketingHref());
  const footerLabel = escapeHtml(emailMarketingLabel());
  const subject = `Direct message from ${String(senderName || 'Someone')} · Digitalis Global`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>Direct message</title>
</head>
<body style="margin:0;padding:0;background-color:#e8eef4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#e8eef4;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
          <tr>
            <td style="padding:0;border-radius:12px 12px 0 0;overflow:hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td width="55%" bgcolor="#0f766e" style="padding:20px 24px;background-color:#0f766e;">
                    <p style="margin:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:19px;font-weight:700;color:#ffffff;">Digitalis Global</p>
                    <p style="margin:6px 0 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.9);">Messages</p>
                  </td>
                  <td width="45%" bgcolor="#14b8a6" style="padding:20px 24px;background-color:#14b8a6;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;padding:32px 36px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;">Direct message</p>
              <p style="margin:14px 0 0;font-size:17px;line-height:1.55;color:#0f172a;">
                <strong style="color:#0f172a;">${safeSender}</strong> sent you a message
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;">
                <tr>
                  <td style="padding:16px 18px;background-color:#f1f5f9;border-radius:10px;border:1px solid #e2e8f0;">
                    <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">${safeSnippet}</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;">
                <tr>
                  <td align="left" bgcolor="#0f766e" style="border-radius:10px;background-color:#0f766e;">
                    <a href="${openHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Open messages</a>
                  </td>
                </tr>
              </table>
              <p style="margin:22px 0 0;font-size:12px;line-height:1.55;color:#64748b;">
                You’re receiving this because you don’t appear to be active in the workspace right now. Sign in to reply.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:20px 28px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:1px solid #e2e8f0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;text-align:center;">
                <strong style="color:#64748b;">Digitalis Global</strong><br>
                <a href="${footerHref}" style="color:#0f766e;text-decoration:none;">${footerLabel}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Direct message from ${String(senderName || 'Someone')} · Digitalis Global`,
    '',
    String(snippet || '').slice(0, 500) || '(no preview)',
    '',
    `Open messages: ${String(messagesUrl)}`,
    '',
    'You are receiving this because you do not appear to be active in the workspace right now.',
  ].join('\n');

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: [to],
    subject,
    html,
    text,
    ...transactionalSendOptions(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id };
}

/** Notify assignee by email when someone assigns them to a task (ERP workspace). */
export async function sendErpTaskAssignedEmail({ to, taskTitle, projectName, assignerName, projectUrl }) {
  if (!resendApiKey) {
    return { ok: false, error: 'Email not configured' };
  }

  const resend = new Resend(resendApiKey);
  const safeProject = escapeHtml(projectName);
  const safeTask = escapeHtml((taskTitle || 'Task').slice(0, 200));
  const safeAssigner = escapeHtml(assignerName);
  const openHref = escapeAttrUrl(projectUrl);
  const footerHref = escapeAttrUrl(emailMarketingHref());
  const footerLabel = escapeHtml(emailMarketingLabel());
  const subject = `You've been assigned a task · ${String(projectName || 'Project')} · Digitalis Global`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>Task assigned</title>
</head>
<body style="margin:0;padding:0;background-color:#e8eef4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#e8eef4;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
          <tr>
            <td style="padding:0;border-radius:12px 12px 0 0;overflow:hidden;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td width="55%" bgcolor="#103D4D" style="padding:20px 24px;background-color:#103D4D;">
                    <p style="margin:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:19px;font-weight:700;color:#ffffff;">Digitalis Global</p>
                    <p style="margin:6px 0 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.9);">Workspace</p>
                  </td>
                  <td width="45%" bgcolor="#0d9488" style="padding:20px 24px;background-color:#0d9488;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;padding:32px 36px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;">Task assignment</p>
              <p style="margin:14px 0 0;font-size:17px;line-height:1.55;color:#0f172a;">
                <strong style="color:#0f172a;">${safeAssigner}</strong> assigned you to a task in <strong style="color:#0f172a;">${safeProject}</strong>.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:20px;">
                <tr>
                  <td style="padding:16px 18px;background-color:#f1f5f9;border-radius:10px;border:1px solid #e2e8f0;">
                    <p style="margin:0;font-size:14px;font-weight:700;color:#0f172a;line-height:1.4;">${safeTask}</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;">
                <tr>
                  <td align="left" bgcolor="#103D4D" style="border-radius:10px;background-color:#103D4D;">
                    <a href="${openHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Open project</a>
                  </td>
                </tr>
              </table>
              <p style="margin:22px 0 0;font-size:12px;line-height:1.55;color:#64748b;">
                Open the project in your workspace to view the task and collaborate with your team.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:20px 28px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:1px solid #e2e8f0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;text-align:center;">
                <strong style="color:#64748b;">Digitalis Global</strong><br>
                <a href="${footerHref}" style="color:#103D4D;text-decoration:none;">${footerLabel}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `You've been assigned a task in ${String(projectName)} · Digitalis Global`,
    '',
    `${String(assignerName)} assigned you to:`,
    String(taskTitle || 'Task').slice(0, 200),
    '',
    `Open project: ${String(projectUrl)}`,
    '',
    'You are receiving this because you were assigned to a task in the workspace.',
  ].join('\n');

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: [to],
    subject,
    html,
    text,
    ...transactionalSendOptions(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id };
}

const LOGIN_CONTEXT_COPY = {
  admin: {
    headline: 'Admin dashboard',
    lead: 'You successfully signed in to the Digitalis admin panel.',
    badge: 'Admin',
  },
  erp: {
    headline: 'Workspace',
    lead: 'You signed in to your Digitalis Global workspace — messaging, files, and projects.',
    badge: 'Workspace',
  },
  invite: {
    headline: 'Welcome aboard',
    lead: 'You signed in after accepting your invitation. Your Digitalis Global workspace access is active.',
    badge: 'Workspace',
  },
};

/**
 * Security-style login alert with modern layout (Resend HTML).
 */
export async function sendLoginNotificationEmail({ to, context, formattedWhen, ip, userAgent }) {
  if (!resendApiKey) {
    return { ok: false, error: 'Email not configured' };
  }

  const copy = LOGIN_CONTEXT_COPY[context] || LOGIN_CONTEXT_COPY.erp;
  const safeTo = escapeHtml(to);
  const safeWhen = escapeHtml(formattedWhen || '');
  const safeIp = ip ? escapeHtml(ip) : null;
  const safeUa = userAgent
    ? escapeHtml(userAgent.slice(0, 120)) + (userAgent.length > 120 ? '…' : '')
    : null;

  const resend = new Resend(resendApiKey);
  const subject = `Security alert: new sign-in · ${copy.headline} · Digitalis Global`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 0 20px;">
              <p style="margin:0;font-size:24px;font-weight:800;letter-spacing:-0.03em;line-height:1.2;color:#ea580c;">New sign-in detected</p>
              <p style="margin:12px 0 0;font-size:15px;line-height:1.55;color:#3f3f46;">We recorded a successful sign-in to your Digitalis account. <strong style="color:#18181b;">If this was you, you can ignore this email.</strong> If not, secure your account right away.</p>
              <p style="margin:16px 0 0;font-size:13px;color:#71717a;">Activity as of ${safeWhen}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:14px;border:2px solid #fb923c;background:#ffffff;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
                <tr>
                  <td style="padding:18px 20px 14px;border-bottom:1px solid #f4f4f5;">
                    <p style="margin:0;font-size:10px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#a1a1aa;">Security notice</p>
                    <p style="margin:8px 0 0;font-size:17px;font-weight:700;color:#ea580c;letter-spacing:-0.02em;">${escapeHtml(copy.headline)}</p>
                    <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#52525b;">${escapeHtml(copy.lead)}</p>
                    <p style="margin:10px 0 0;font-size:11px;font-family:ui-monospace,Menlo,Consolas,monospace;color:#a1a1aa;">context · ${escapeHtml(copy.badge).toLowerCase()}_sign_in</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;background:#fafafa;border-bottom:1px solid #f4f4f5;">
                    <p style="margin:0 0 6px;font-size:10px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#71717a;">Account</p>
                    <p style="margin:0;font-size:15px;font-weight:600;color:#18181b;word-break:break-all;">${safeTo}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;background:#fafafa;border-bottom:1px solid #f4f4f5;">
                    <p style="margin:0 0 6px;font-size:10px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#71717a;">Network</p>
                    <p style="margin:0;font-size:13px;font-family:ui-monospace,Menlo,monospace;color:#3f3f46;">${safeIp || 'Not available'}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;background:#fafafa;">
                    <p style="margin:0 0 6px;font-size:10px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#71717a;">Device / browser</p>
                    <p style="margin:0;font-size:12px;line-height:1.5;color:#52525b;">${safeUa || 'Not available'}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 0 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:12px;border:1px solid #e4e4e7;background:#ffffff;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0;font-size:12px;line-height:1.6;color:#52525b;"><strong style="color:#18181b;">Not you?</strong> Reset your password and tell your administrator. Unauthorized access can expose your data.</p>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0;font-size:11px;line-height:1.5;color:#a1a1aa;text-align:center;">Automated security message · Digitalis Global</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Security alert: new sign-in · ${copy.headline} · Digitalis Global`,
    '',
    copy.lead,
    '',
    `Account: ${to}`,
    `Time: ${formattedWhen || 'unknown'}`,
    `IP: ${ip || 'Not available'}`,
    `Device: ${userAgent ? userAgent.slice(0, 200) : 'Not available'}`,
    '',
    'If this was you, you can ignore this email. If not, reset your password and contact your administrator.',
  ].join('\n');

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: [to],
    subject,
    html,
    text,
    ...transactionalSendOptions(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id };
}
