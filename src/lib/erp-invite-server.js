import { randomUUID } from 'crypto';
import { sendErpAddedToProjectEmail, sendErpInviteEmail } from './erp-resend';
import { downloadProjectAttachmentsForEmail } from './erp-project-attachments';
import { createSupabaseAdmin } from './supabase-admin';

async function inviteBriefPayload(admin, projectRow) {
  const projectDescription = projectRow?.description ? String(projectRow.description).trim() : '';
  if (!admin) {
    return {
      projectDescription,
      resendAttachments: [],
      skippedAttachmentNames: [],
    };
  }
  const { resendAttachments, skippedNames } = await downloadProjectAttachmentsForEmail(
    admin,
    projectRow?.description_attachments
  );
  return {
    projectDescription,
    resendAttachments,
    skippedAttachmentNames: skippedNames,
  };
}

/** Map invitation global_role to erp_project_members.role */
function inviteGlobalRoleToProjectRole(globalRole) {
  if (globalRole === 'team_lead') return 'project_lead';
  if (globalRole === 'client') return 'client';
  return 'member';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry Resend sends — short bursts of invites can hit rate limits or transient errors.
 * @param {() => Promise<{ ok: boolean, error?: string }>} fn
 */
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

/**
 * Resolve auth user id by email. GoTrue often returns lastPage: 0 when Link headers are
 * missing; the old logic then stopped after page 1 and missed most users.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} normalizedEmail lowercased
 */
async function findAuthUserIdByEmail(admin, normalizedEmail) {
  const target = normalizedEmail.toLowerCase();
  try {
    const { data: rpcId, error: rpcErr } = await admin.rpc('erp_lookup_auth_user_id_by_email', {
      _email: target,
    });
    if (!rpcErr && rpcId) return rpcId;
  } catch {
    /* Migration 017 not applied — fall back to listUsers */
  }

  let page = 1;
  const perPage = 1000;
  const maxPages = 500;
  for (let i = 0; i < maxPages; i += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const users = data?.users;
    if (!users?.length) return null;
    for (const u of users) {
      if (u.email && String(u.email).toLowerCase() === target) return u.id;
    }
    const fullPage = users.length >= perPage;
    if (!fullPage) return null;
    const lastPage = Number(data?.lastPage);
    if (Number.isFinite(lastPage) && lastPage > 0 && page >= lastPage) return null;
    page += 1;
  }
  return null;
}

/** Base URL used in invite emails (accept-invite link). */
export function erpInvitePublicBaseUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.FRONTEND_URL,
    process.env.API_PUBLIC_URL,
  ];
  for (const raw of candidates) {
    if (raw && String(raw).trim()) {
      return String(raw).replace(/\/$/, '');
    }
  }
  if (process.env.VERCEL_URL) {
    const v = process.env.VERCEL_URL;
    return v.startsWith('http') ? v : `https://${v}`;
  }
  return 'http://localhost:3000';
}

/** Split textarea / pasted list into unique valid emails. */
export function parseEmailList(text) {
  if (!text || typeof text !== 'string') return [];
  const chunks = text.split(/[\n,;]+/);
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const seen = new Set();
  const out = [];
  for (const chunk of chunks) {
    const e = chunk.trim().toLowerCase();
    if (!e || !re.test(e) || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

/**
 * Insert invitation row and send Resend email.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function createInvitationAndSendEmail({ supabase, user, profile, email, globalRole, projectId }) {
  const base = erpInvitePublicBaseUrl().replace(/\/$/, '');
  const inviterName = profile.full_name || user.email || 'Digitalis';

  let projectName = null;
  let inviteBrief = {
    projectDescription: '',
    resendAttachments: [],
    skippedAttachmentNames: [],
  };

  if (projectId) {
    const { data: projAccess, error: projErr } = await supabase
      .from('erp_projects')
      .select('id, name, description, description_attachments')
      .eq('id', projectId)
      .maybeSingle();

    if (projErr || !projAccess) {
      return {
        ok: false,
        step: 'database',
        error: projErr?.message || 'Project not found or you do not have access',
        email,
      };
    }

    projectName = projAccess.name || null;
    const admin = createSupabaseAdmin();
    inviteBrief = await inviteBriefPayload(admin, projAccess);

    if (admin) {
      const authUserId = await findAuthUserIdByEmail(admin, email);
      if (authUserId) {
        const { data: existingProfile } = await admin
          .from('erp_profiles')
          .select('id')
          .eq('id', authUserId)
          .maybeSingle();

        if (existingProfile) {
          const { data: existingMember } = await admin
            .from('erp_project_members')
            .select('user_id')
            .eq('project_id', projectId)
            .eq('user_id', authUserId)
            .maybeSingle();

          if (existingMember) {
            return { ok: true, email, flow: 'already_project_member', expiresAt: null };
          }

          const projectRole = inviteGlobalRoleToProjectRole(globalRole);
          const { error: memErr } = await admin.from('erp_project_members').insert({
            project_id: projectId,
            user_id: authUserId,
            role: projectRole,
          });

          if (memErr) {
            if (memErr.code === '23505') {
              return { ok: true, email, flow: 'already_project_member', expiresAt: null };
            }
            return { ok: false, step: 'database', error: memErr.message, email };
          }

          const loginUrl = `${base}/erp/login`;
          const projectUrl = `${base}/erp/projects/${projectId}`;
          const sendResult = await sendTransactionalEmailWithRetries(() =>
            sendErpAddedToProjectEmail({
              to: email,
              projectName,
              inviterName,
              loginUrl,
              projectUrl,
              projectDescription: inviteBrief.projectDescription,
              resendAttachments: inviteBrief.resendAttachments,
              skippedAttachmentNames: inviteBrief.skippedAttachmentNames,
            }),
          );

          if (!sendResult.ok) {
            let errMsg = sendResult.error || 'Email could not be sent';
            if (!process.env.RESEND_API_KEY) {
              errMsg =
                'RESEND_API_KEY is not set (add to .env.local for local dev, or Vercel for production). The user was added to the project — they can sign in; fix env to send email next time.';
            }
            return {
              ok: false,
              step: 'email',
              error: errMsg,
              email,
              flow: 'existing_user_project_added',
              memberAdded: true,
            };
          }

          return {
            ok: true,
            email,
            flow: 'existing_user_project_added',
            expiresAt: null,
          };
        }
      }
    }
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: insErr } = await supabase.from('erp_invitations').insert({
    email,
    token,
    global_role: globalRole,
    project_id: projectId || null,
    invited_by: user.id,
    expires_at: expiresAt,
  });

  if (insErr) {
    return { ok: false, step: 'database', error: insErr.message, email };
  }

  const inviteUrl = `${base}/erp/accept-invite?token=${encodeURIComponent(token)}`;

  const sendResult = await sendTransactionalEmailWithRetries(() =>
    sendErpInviteEmail({
      to: email,
      inviteUrl,
      inviterName,
      projectName,
      projectDescription: inviteBrief.projectDescription,
      resendAttachments: inviteBrief.resendAttachments,
      skippedAttachmentNames: inviteBrief.skippedAttachmentNames,
    }),
  );

  if (!sendResult.ok) {
    let errMsg = sendResult.error || 'Email could not be sent';
    if (!process.env.RESEND_API_KEY) {
      errMsg =
        'RESEND_API_KEY is not set (add to .env.local for local dev, or Vercel for production). Invitation was still saved — resend email from Resend dashboard or fix env and invite again.';
    }
    return {
      ok: false,
      step: 'email',
      error: errMsg,
      email,
      invitationCreated: true,
      inviteUrl,
    };
  }

  return { ok: true, email, expiresAt };
}
