'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { notifyLoginAfterSignIn } from '../../../lib/notify-login-client';
import ErpAuthPageShell, {
  ERP_AUTH_FIELD_CLASS,
  ERP_AUTH_FIELD_MUTED_CLASS,
  ERP_AUTH_LABEL_CLASS,
  ERP_AUTH_LINK_CLASS,
  ERP_AUTH_PRIMARY_BUTTON_CLASS,
} from '../../../components/erp/ErpAuthPageShell';
import ErpAuthFaviconLoader from '../../../components/erp/ErpAuthFaviconLoader';

function AcceptInviteFallback() {
  return (
    <ErpAuthPageShell eyebrow="Invitation">
      <div className="mt-12 flex justify-center pb-4">
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

  /** Team member / team lead: no phone on the form. Everything else (client, unknown) keeps phone. */
  const phoneOptional = inviteGlobalRole === 'team_member' || inviteGlobalRole === 'team_lead';

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
      setError('Enter a valid phone number (7–40 characters).');
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
      <ErpAuthPageShell eyebrow="Invitation">
        <div className="mt-12 flex justify-center pb-4">
          <ErpAuthFaviconLoader size={52} />
        </div>
      </ErpAuthPageShell>
    );
  }

  if (!token || valid === false) {
    return (
      <ErpAuthPageShell
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
        <p className="mt-8 text-sm text-red-600">{error || 'Invalid or expired invitation link.'}</p>
      </ErpAuthPageShell>
    );
  }

  const description =
    inviteHasProject && inviteProjectName
      ? `You're joining ${inviteProjectName}. Add your details below to access the workspace.`
      : 'Complete your details to join the workspace.';

  const footerLinks = (
    <p className="mt-6 text-center text-xs text-slate-500 leading-relaxed">
      <Link href="/erp/reset-password" className={`${ERP_AUTH_LINK_CLASS} text-[13px]`}>
        Forgot your password?
      </Link>
      <span className="text-slate-300 mx-2">·</span>
      <Link href="/erp/login" className={`${ERP_AUTH_LINK_CLASS} text-[13px]`}>
        Sign in
      </Link>
    </p>
  );

  return (
    <ErpAuthPageShell eyebrow="Invitation" title="Accept invitation" description={description} footer={footerLinks}>
      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div>
          <label htmlFor="invite-email" className={ERP_AUTH_LABEL_CLASS}>
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            readOnly
            value={inviteEmail}
            className={`mt-2 ${ERP_AUTH_FIELD_MUTED_CLASS}`}
            autoComplete="email"
          />
        </div>
        <div>
          <label htmlFor="invite-name" className={ERP_AUTH_LABEL_CLASS}>
            Full name
          </label>
          <input
            id="invite-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            minLength={2}
            className={`mt-2 ${ERP_AUTH_FIELD_CLASS}`}
            autoComplete="name"
          />
        </div>
        {!phoneOptional ? (
          <div>
            <label htmlFor="invite-phone" className={ERP_AUTH_LABEL_CLASS}>
              Phone number
            </label>
            <input
              id="invite-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              minLength={7}
              maxLength={40}
              placeholder="+92 300 1234567"
              className={`mt-2 ${ERP_AUTH_FIELD_CLASS}`}
              autoComplete="tel"
            />
          </div>
        ) : (
          <p className="rounded-xl border border-slate-200/90 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            You were invited as a <span className="font-semibold text-slate-800">team member or team lead</span> — no phone
            number is needed to join.
          </p>
        )}
        {!matchingSession ? (
          <div>
            <label htmlFor="invite-password" className={ERP_AUTH_LABEL_CLASS}>
              Password (min 8 characters)
            </label>
            <input
              id="invite-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className={`mt-2 ${ERP_AUTH_FIELD_CLASS}`}
            />
          </div>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button type="submit" disabled={submitting} className={ERP_AUTH_PRIMARY_BUTTON_CLASS}>
          {submitting ? 'Working…' : 'Join workspace'}
        </button>
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
