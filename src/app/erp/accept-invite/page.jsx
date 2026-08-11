'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { notifyLoginAfterSignIn } from '../../../lib/notify-login-client';
import { erpWorkspaceRoleTitle } from '../../../lib/erp-roles';
import ErpAuthPageShell, {
  ERP_AUTH_FIELD_MUTED_ICON_CLASS,
  ERP_AUTH_FIELD_WITH_ICON_CLASS,
  ERP_AUTH_LINK_CLASS,
  ERP_AUTH_PASSWORD_WITH_ICON_CLASS,
  ERP_AUTH_PRIMARY_BUTTON_CLASS,
  ErpAuthInputGroup,
} from '../../../components/erp/ErpAuthPageShell';
import ErpAuthFaviconLoader from '../../../components/erp/ErpAuthFaviconLoader';

function IconMail() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function InviteMetaPill({ children, onDark = true }) {
  const cls = onDark
    ? 'border-white/30 bg-white/10 text-white'
    : 'border-cyan-200/80 bg-cyan-50/90 text-cyan-900';
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${cls}`}>
      {children}
    </span>
  );
}

function AcceptInviteFallback() {
  return (
    <ErpAuthPageShell variant="invite" eyebrow="Invitation" title="Accept invitation">
      <div className="flex justify-center py-16">
        <ErpAuthFaviconLoader size={52} />
      </div>
    </ErpAuthPageShell>
  );
}

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [valid, setValid] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteHasProject, setInviteHasProject] = useState(null);
  const [inviteProjectName, setInviteProjectName] = useState(null);
  /** @type {string | null} */
  const [inviteGlobalRole, setInviteGlobalRole] = useState(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [matchingSession, setMatchingSession] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    if (!token) {
      setValid(false);
      return;
    }
    fetch(`/api/erp/invitations/validate?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        setValid(data.valid === true);
        if (typeof data.email === 'string') setInviteEmail(data.email);
        if (data.valid === true) {
          setInviteHasProject(Boolean(data.hasProject));
          setInviteProjectName(typeof data.projectName === 'string' ? data.projectName : null);
          setInviteGlobalRole(typeof data.globalRole === 'string' ? data.globalRole : null);
        }
        if (!data.valid) setError(data.error || 'Invalid invitation');
      })
      .catch(() => setValid(false));
  }, [token]);

  useEffect(() => {
    if (valid !== true || !inviteEmail) {
      setSessionChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      const invited = inviteEmail.trim().toLowerCase();
      const current = session?.user?.email?.trim().toLowerCase();
      setMatchingSession(Boolean(session?.access_token && current && current === invited));
      setSessionChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [valid, inviteEmail]);

  const phoneOptional = inviteGlobalRole === 'team_member' || inviteGlobalRole === 'team_lead';
  const isClientInvite = inviteGlobalRole === 'client';
  const isClientTeamInvite = inviteGlobalRole === 'client_team_member';
  const roleLabel = inviteGlobalRole ? erpWorkspaceRoleTitle(inviteGlobalRole) : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!token) return;

    const nameTrim = fullName.trim();
    const phoneTrim = phone.trim();
    if (nameTrim.length < 2) {
      setError('Enter your full name (at least 2 characters).');
      return;
    }
    if (!phoneOptional && (phoneTrim.length < 7 || phoneTrim.length > 40)) {
      setError('Enter a valid phone number (7 to 40 characters).');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        token,
        fullName: nameTrim,
        phone: phoneOptional ? '' : phoneTrim,
      };

      const headers = { 'Content-Type': 'application/json' };
      if (matchingSession) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setError('Your session expired. Sign in with the invited email, or use the password field below after signing out.');
          return;
        }
        headers.Authorization = `Bearer ${session.access_token}`;
      } else {
        if (!password || password.length < 8) {
          setError('Password must be at least 8 characters.');
          return;
        }
        payload.password = password;
      }

      const res = await fetch('/api/erp/invitations/accept', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not accept invite');
        return;
      }

      if (matchingSession) {
        const {
          data: { session: sessMatch },
        } = await supabase.auth.getSession();
        if (sessMatch?.access_token) {
          await fetch('/api/erp/me/sync-invite-role', {
            method: 'POST',
            headers: { Authorization: `Bearer ${sessMatch.access_token}` },
          }).catch(() => {});
        }
        router.replace('/erp/dashboard?joined=1');
        return;
      }

      const { data: signData, error: signErr } = await supabase.auth.signInWithPassword({
        email: data.email,
        password,
      });
      if (signErr) {
        router.replace('/erp/login?invited=1');
        return;
      }
      if (signData.session?.access_token) {
        await fetch('/api/erp/me/sync-invite-role', {
          method: 'POST',
          headers: { Authorization: `Bearer ${signData.session.access_token}` },
        }).catch(() => {});
        notifyLoginAfterSignIn(signData.session.access_token, 'invite', signData.user?.id);
        router.replace('/erp/dashboard');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (valid === null || (valid === true && !sessionChecked)) {
    return (
      <ErpAuthPageShell variant="invite" eyebrow="Invitation" title="Accept invitation">
        <div className="flex justify-center py-16">
          <ErpAuthFaviconLoader size={52} />
        </div>
      </ErpAuthPageShell>
    );
  }

  if (!token || valid === false) {
    return (
      <ErpAuthPageShell
        variant="invite"
        eyebrow="Invitation"
        title="This link isn’t valid"
        footer={
          <p className="mt-8 text-center text-sm text-slate-600">
            <Link href="/erp/login" className={ERP_AUTH_LINK_CLASS}>
              Go to sign in
            </Link>
          </p>
        }
      >
        <div className="rounded-2xl border border-rose-200/90 bg-rose-50/80 px-4 py-3 text-sm text-rose-800">
          {error || 'Invalid or expired invitation link.'}
        </div>
      </ErpAuthPageShell>
    );
  }

  const heroDescription = isClientTeamInvite
    ? inviteHasProject && inviteProjectName
      ? `You’re joining ${inviteProjectName} as client team. You can help with project chat and tasks for your organization.`
      : 'You’re joining as client team. You can help with project chat and tasks in the projects you’re added to.'
    : isClientInvite
      ? inviteHasProject && inviteProjectName
        ? `You’re joining ${inviteProjectName} as a client partner. Set up your account to follow progress, tasks, and updates.`
        : 'You’re joining as a client. Set up your account to follow projects, tasks, and team updates in one place.'
      : inviteHasProject && inviteProjectName
      ? `You’re joining ${inviteProjectName}. Create your account to start collaborating with the team.`
      : 'Create your account and start working with your team in one secure workspace.';

  const inviteMeta = (
    <>
      {roleLabel ? <InviteMetaPill tone="role">{roleLabel}</InviteMetaPill> : null}
      {inviteHasProject && inviteProjectName ? (
        <InviteMetaPill tone="project">{inviteProjectName}</InviteMetaPill>
      ) : null}
    </>
  );

  const footerLinks = (
    <p className="mt-8 text-center text-[13px] text-slate-500 leading-relaxed">
      <Link href="/erp/reset-password" className={ERP_AUTH_LINK_CLASS}>
        Forgot your password?
      </Link>
      <span className="mx-2 text-slate-300">·</span>
      <Link href="/erp/login" className={ERP_AUTH_LINK_CLASS}>
        Sign in
      </Link>
    </p>
  );

  return (
    <ErpAuthPageShell
      variant="invite"
      eyebrow="Workspace invitation"
      title="You’re invited"
      description={heroDescription}
      inviteMeta={inviteMeta}
      footer={footerLinks}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {matchingSession ? (
          <div className="rounded-2xl border border-cyan-200/80 bg-gradient-to-r from-cyan-50/90 to-teal-50/50 px-4 py-3.5 text-sm text-cyan-950 shadow-sm ring-1 ring-cyan-100/80">
            <p className="font-semibold text-[#103D4D]">Already signed in</p>
            <p className="mt-1 text-cyan-900/80">
              You’re logged in as <span className="font-semibold">{inviteEmail}</span>. Confirm your name below to join
              no new password needed.
            </p>
          </div>
        ) : null}

        <ErpAuthInputGroup id="invite-email" label="Work email" icon={<IconMail />}>
          <input
            id="invite-email"
            type="email"
            readOnly
            value={inviteEmail}
            className={ERP_AUTH_FIELD_MUTED_ICON_CLASS}
            autoComplete="email"
          />
        </ErpAuthInputGroup>

        <ErpAuthInputGroup id="invite-name" label="Full name" icon={<IconUser />}>
          <input
            id="invite-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            minLength={2}
            placeholder="Your name"
            className={ERP_AUTH_FIELD_WITH_ICON_CLASS}
            autoComplete="name"
          />
        </ErpAuthInputGroup>

        {!phoneOptional ? (
          <ErpAuthInputGroup
            id="invite-phone"
            label="Phone number"
            icon={<IconPhone />}
            hint={isClientInvite ? 'We use this only for important project updates.' : undefined}
          >
            <input
              id="invite-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              minLength={7}
              maxLength={40}
              placeholder="+92 300 1234567"
              className={ERP_AUTH_FIELD_WITH_ICON_CLASS}
              autoComplete="tel"
            />
          </ErpAuthInputGroup>
        ) : (
          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 text-xs leading-relaxed text-slate-600">
            Invited as <span className="font-semibold text-slate-800">team member or manager</span>: phone number is not
            required.
          </div>
        )}

        {!matchingSession ? (
          <ErpAuthInputGroup id="invite-password" label="Create password" icon={<IconLock />} hint="At least 8 characters">
            <input
              id="invite-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••"
              className={ERP_AUTH_PASSWORD_WITH_ICON_CLASS}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </ErpAuthInputGroup>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-rose-200/90 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-800">
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={submitting} className={ERP_AUTH_PRIMARY_BUTTON_CLASS}>
          {submitting ? (
            <span className="inline-flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
              Setting up…
            </span>
          ) : (
            'Join workspace'
          )}
        </button>

        <p className="text-center text-[11px] leading-relaxed text-slate-400">
          By continuing you agree to use this workspace for your organisation’s projects.
        </p>
      </form>
    </ErpAuthPageShell>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<AcceptInviteFallback />}>
      <AcceptInviteForm />
    </Suspense>
  );
}
