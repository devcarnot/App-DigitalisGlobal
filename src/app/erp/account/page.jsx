'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { erpAuthorizedFetch } from '../../../lib/erp-client-api';
import { useErpSession } from '../../../components/erp/useErpSession';
import { erpWorkspaceSubtitle, erpWorkspaceDisplayName } from '../../../lib/erp-roles';
import ErpUserAvatar from '../../../components/erp/ErpUserAvatar';
import { registerPushSubscription, unregisterPushSubscription } from '../../../lib/erp-push-client';

const inputClass =
  'w-full rounded-xl border border-cyan-200/70 bg-white/90 px-4 py-3 text-slate-900 outline-none transition-shadow focus:border-[#103D4D]/40 focus:ring-2 focus:ring-cyan-400/25';

const cardShell =
  'rounded-3xl border border-white/90 bg-white/80 backdrop-blur-md shadow-[0_12px_48px_-16px_rgba(16,61,77,0.14),0_4px_16px_-8px_rgba(15,23,42,0.06)] ring-1 ring-cyan-100/50';

const sectionEyebrow = 'text-[10px] font-bold uppercase tracking-[0.2em] text-teal-800/55';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function extFromMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'jpg';
}

export default function ErpAccountPage() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useErpSession();
  const fileRef = useRef(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileOk, setProfileOk] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [current, setCurrent] = useState('');
  const [nextPw, setNextPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [signOutOthersAfterPw, setSignOutOthersAfterPw] = useState(true);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState('');
  const [avatarErr, setAvatarErr] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [notifBusy, setNotifBusy] = useState(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushOk, setPushOk] = useState('');
  const [pushErr, setPushErr] = useState('');
  /** Avoid overwriting the form when profile refetches during editing (same user). */
  const profileFormSyncedForId = useRef(null);

  async function handleSignOut() {
    try {
      await erpAuthorizedFetch('/api/erp/session-end', { method: 'POST', body: '{}' });
    } catch {
      /* still sign out locally */
    }
    await supabase.auth.signOut();
    router.replace('/erp/login');
  }

  useEffect(() => {
    if (!profile?.id) {
      profileFormSyncedForId.current = null;
      setFullName('');
      setPhone('');
      return;
    }
    if (profileFormSyncedForId.current === profile.id) return;
    profileFormSyncedForId.current = profile.id;
    setFullName(profile.full_name != null ? String(profile.full_name) : '');
    setPhone(profile.phone != null ? String(profile.phone) : '');
  }, [profile]);

  async function handleProfileSave(e) {
    e.preventDefault();
    setProfileErr('');
    setProfileOk('');
    const uid = session?.user?.id;
    if (!uid || !supabase?.from) {
      setProfileErr('You are not signed in.');
      return;
    }
    const nameTrim = fullName.trim();
    const phoneTrim = phone.trim();
    if (nameTrim.length > 200) {
      setProfileErr('Display name must be 200 characters or fewer.');
      return;
    }
    if (phoneTrim.length > 40) {
      setProfileErr('Phone must be 40 characters or fewer.');
      return;
    }
    setProfileSaving(true);
    try {
      const { error: dbErr } = await supabase
        .from('erp_profiles')
        .update({
          full_name: nameTrim || null,
          phone: phoneTrim || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', uid);
      if (dbErr) throw new Error(dbErr.message);
      try {
        await supabase.auth.updateUser({
          data: {
            full_name: nameTrim || undefined,
            display_name: nameTrim || undefined,
          },
        });
      } catch {
        /* metadata sync optional */
      }
      setProfileOk('Profile saved.');
      refreshProfile?.();
    } catch (err) {
      setProfileErr(err?.message || 'Could not save profile.');
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setOk('');
    const email = session?.user?.email;
    if (!email) {
      setError('You are not signed in.');
      return;
    }
    if (nextPw.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (nextPw !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    if (!supabase?.auth) {
      setError('Sign-in is not configured.');
      return;
    }
    setLoading(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (signErr) {
        setError('Current password is incorrect.');
        return;
      }
      const { error: upErr } = await supabase.auth.updateUser({ password: nextPw });
      if (upErr) throw upErr;
      if (signOutOthersAfterPw) {
        const { error: soErr } = await supabase.auth.signOut({ scope: 'others' });
        if (soErr) {
          setOk(
            `Your password was updated. We could not sign out other devices (${soErr.message}). You can try again from this page or contact support.`,
          );
        } else {
          setOk('Your password was updated. Other devices have been signed out.');
        }
      } else {
        setOk('Your password was updated.');
      }
      setCurrent('');
      setNextPw('');
      setConfirm('');
    } catch (err) {
      setError(err.message || 'Could not update password.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAvatarFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !session?.user?.id || !supabase) return;

    setAvatarErr('');
    setAvatarMsg('');
    if (!ACCEPT_TYPES.includes(file.type)) {
      setAvatarErr('Use a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarErr('Image must be 2 MB or smaller.');
      return;
    }

    const uid = session.user.id;
    const ext = extFromMime(file.type);
    const path = `avatars/${uid}/${Date.now()}_profile.${ext}`;

    setAvatarBusy(true);
    try {
      const prev = profile?.avatar_path;
      if (prev) {
        await supabase.storage.from('erp-files').remove([prev]);
      }
      const { error: upErr } = await supabase.storage.from('erp-files').upload(path, file, {
        upsert: false,
        contentType: file.type || 'image/jpeg',
      });
      if (upErr) {
        setAvatarErr(upErr.message || 'Upload failed.');
        return;
      }
      const { error: dbErr } = await supabase
        .from('erp_profiles')
        .update({ avatar_path: path, updated_at: new Date().toISOString() })
        .eq('id', uid);
      if (dbErr) {
        await supabase.storage.from('erp-files').remove([path]);
        setAvatarErr(dbErr.message || 'Could not save profile.');
        return;
      }
      setAvatarMsg('Profile photo updated.');
      refreshProfile?.();
    } catch (err) {
      setAvatarErr(err?.message || 'Could not upload photo.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function patchNotificationField(field, value) {
    const uid = session?.user?.id;
    if (!uid || !supabase?.from) {
      setProfileErr('You are not signed in.');
      return;
    }
    setNotifBusy(field);
    setProfileErr('');
    try {
      const { error: dbErr } = await supabase
        .from('erp_profiles')
        .update({
          [field]: value,
          updated_at: new Date().toISOString(),
        })
        .eq('id', uid);
      if (dbErr) throw new Error(dbErr.message);
      refreshProfile?.();
    } catch (err) {
      setProfileErr(err?.message || 'Could not save notification setting.');
    } finally {
      setNotifBusy(null);
    }
  }

  async function handlePushToggle(nextOn) {
    setPushOk('');
    setPushErr('');
    if (!session?.user?.id) {
      setPushErr('You are not signed in.');
      return;
    }
    setPushBusy(true);
    try {
      if (nextOn) {
        const r = await registerPushSubscription({ erpAuthorizedFetch });
        if (!r.ok) {
          setPushErr(
            r.reason === 'missing_vapid_public_key'
              ? 'Push is not configured on the server yet.'
              : r.reason === 'permission_denied'
                ? 'Notifications permission was blocked in the browser.'
                : 'Could not enable push notifications.',
          );
          return;
        }
        await patchNotificationField('notify_push_dm', true);
        await patchNotificationField('notify_push_project_mention', true);
        setPushOk('Push notifications enabled.');
      } else {
        await unregisterPushSubscription({ erpAuthorizedFetch });
        await patchNotificationField('notify_push_dm', false);
        await patchNotificationField('notify_push_project_mention', false);
        setPushOk('Push notifications disabled.');
      }
    } catch (e) {
      setPushErr(e?.message || 'Could not update push settings.');
    } finally {
      setPushBusy(false);
    }
  }

  async function removeAvatar() {
    if (!session?.user?.id || !profile?.avatar_path) return;
    setAvatarErr('');
    setAvatarMsg('');
    setAvatarBusy(true);
    try {
      await supabase.storage.from('erp-files').remove([profile.avatar_path]);
      const { error: dbErr } = await supabase
        .from('erp_profiles')
        .update({ avatar_path: null, updated_at: new Date().toISOString() })
        .eq('id', session.user.id);
      if (dbErr) {
        setAvatarErr(dbErr.message || 'Could not update profile.');
        return;
      }
      setAvatarMsg('Profile photo removed.');
      refreshProfile?.();
    } catch (err) {
      setAvatarErr(err?.message || 'Could not remove photo.');
    } finally {
      setAvatarBusy(false);
    }
  }

  const displayLabel = profile
    ? erpWorkspaceDisplayName(profile, session?.user?.email)
    : session?.user?.email || '—';

  const sections = useMemo(
    () => [
      { key: 'profile-photo', href: '#profile-photo', label: 'Profile photo', short: 'Photo' },
      { key: 'profile-details', href: '#profile-details', label: 'Profile details', short: 'Details' },
      { key: 'notifications', href: '#notifications', label: 'Notifications', short: 'Notifications' },
      { key: 'password', href: '#password', label: 'Password', short: 'Password' },
      { key: 'sign-out', href: '#sign-out', label: 'Sign out', short: 'Sign out' },
    ],
    [],
  );

  const [activeSection, setActiveSection] = useState('profile-photo');

  useEffect(() => {
    const pickFromHash = () => {
      const raw = typeof window !== 'undefined' ? window.location.hash || '' : '';
      const k = raw.startsWith('#') ? raw.slice(1) : raw;
      if (k && sections.some((s) => s.key === k)) setActiveSection(k);
    };
    pickFromHash();
    window.addEventListener('hashchange', pickFromHash);
    return () => window.removeEventListener('hashchange', pickFromHash);
  }, [sections]);

  function goSection(key) {
    const s = sections.find((x) => x.key === key);
    if (!s) return;
    setActiveSection(key);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', s.href);
    }
  }

  return (
    <div className="max-w-6xl">
      <div className="relative overflow-hidden rounded-3xl border border-cyan-200/40 bg-gradient-to-br from-white via-cyan-50/50 to-violet-50/40 p-5 sm:p-6 mb-6 shadow-[0_20px_60px_-24px_rgba(16,61,77,0.18)] ring-1 ring-white/70">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-[#B2EBF2]/60 to-violet-300/30 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-12 left-1/4 h-32 w-64 rounded-full bg-[#103D4D]/[0.06] blur-2xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className={sectionEyebrow}>Workspace</p>
            <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-[#103D4D]">Account settings</h1>
            <p className="mt-2 text-[13px] text-slate-600">
              Signed in as <span className="font-semibold text-[#103D4D]">{session?.user?.email || '—'}</span>
            </p>
            {profile ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex max-w-full items-center rounded-full border border-cyan-200/80 bg-white/90 px-3 py-1 text-xs font-semibold text-[#103D4D] shadow-sm">
                  {displayLabel}
                </span>
                <span className="inline-flex rounded-full bg-violet-100/90 px-3 py-1 text-xs font-semibold capitalize text-violet-900 ring-1 ring-violet-200/80">
                  {erpWorkspaceSubtitle(profile)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
        {(profile?.role === 'team_member' || profile?.role === 'team_lead') && !profile?.member_team ? (
          <p className="relative mt-4 max-w-2xl text-[11px] leading-relaxed text-slate-500">
            Your workspace admin or team lead can assign your functional team (Developers, Graphic designers, or
            Marketing) from{' '}
            <Link href="/erp/admin/users" className="font-semibold text-[#103D4D] hover:underline">
              Users
            </Link>
            .
          </p>
        ) : null}
      </div>

      <div className="lg:flex lg:gap-8 lg:items-start">
        <aside className="hidden lg:block lg:w-64 lg:shrink-0">
          <div className="sticky top-6 rounded-3xl border border-cyan-200/40 bg-white/80 backdrop-blur-md shadow-[0_12px_48px_-16px_rgba(16,61,77,0.12)] ring-1 ring-white/70 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-800/55 mb-3">Account</p>
            <nav className="space-y-1.5 text-sm">
              {sections.map((i) => (
                <a
                  key={i.key}
                  href={i.href}
                  onClick={(e) => {
                    e.preventDefault();
                    goSection(i.key);
                  }}
                  className={`block rounded-xl border px-3 py-2 font-semibold transition ${
                    activeSection === i.key
                      ? 'border-cyan-200/70 bg-cyan-50/50 text-[#103D4D]'
                      : 'border-transparent text-slate-700 hover:border-cyan-200/70 hover:bg-cyan-50/40 hover:text-[#103D4D]'
                  }`}
                >
                  {i.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="lg:hidden mb-5">
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {sections.map((i) => (
                <a
                  key={i.key}
                  href={i.href}
                  onClick={(e) => {
                    e.preventDefault();
                    goSection(i.key);
                  }}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
                    activeSection === i.key
                      ? 'border-[#103D4D]/25 bg-[#103D4D] text-white'
                      : 'border-slate-200 bg-white/90 text-slate-600 hover:border-[#103D4D]/25 hover:text-[#103D4D]'
                  }`}
                >
                  {i.short}
                </a>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-12 lg:gap-8 lg:items-start">
        {activeSection === 'profile-photo' ? (
        <section id="profile-photo" className={`${cardShell} scroll-mt-24 relative overflow-hidden p-5 sm:p-6 lg:col-span-12`}>
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(178,235,242,0.45),transparent)]"
            aria-hidden
          />
          <div className="relative">
            <p className={sectionEyebrow}>Identity</p>
            <h2 className="mt-1 text-base font-bold text-[#103D4D]">Profile photo</h2>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Shown in chat, directory, and project members. JPEG, PNG, WebP, or GIF — max 2&nbsp;MB.
            </p>
            <div className="mt-5 flex flex-col items-center text-center">
              <div className="relative rounded-full p-1 ring-2 ring-cyan-200/60 ring-offset-2 ring-offset-white/90 shadow-lg shadow-cyan-900/10">
                <ErpUserAvatar
                  profile={profile}
                  email={session?.user?.email}
                  size="xl"
                  alt="Your profile photo"
                  className="!h-20 !w-20 text-base"
                />
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT_TYPES.join(',')}
                className="hidden"
                onChange={handleAvatarFile}
              />
              <div className="mt-5 flex w-full max-w-[15rem] flex-col gap-2">
                <button
                  type="button"
                  disabled={avatarBusy || !session?.user?.id}
                  onClick={() => fileRef.current?.click()}
                  className="w-full rounded-xl border border-cyan-300/70 bg-gradient-to-r from-[#103D4D] to-teal-700 px-4 py-2 text-[13px] font-semibold text-white shadow-md shadow-teal-900/15 transition hover:from-[#0d3442] hover:to-teal-800 disabled:opacity-50"
                >
                  {avatarBusy ? 'Working…' : 'Upload photo'}
                </button>
                {profile?.avatar_path ? (
                  <button
                    type="button"
                    disabled={avatarBusy}
                    onClick={() => void removeAvatar()}
                    className="w-full rounded-xl border border-rose-200/90 bg-white/90 px-4 py-2 text-[13px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>
            </div>
            {avatarMsg ? (
              <p className="mt-4 text-[13px] text-emerald-800 bg-emerald-50/90 border border-emerald-200/80 rounded-xl px-3 py-2">
                {avatarMsg}
              </p>
            ) : null}
            {avatarErr ? <p className="text-[13px] text-red-600 mt-3 text-center">{avatarErr}</p> : null}
          </div>
        </section>
        ) : null}

        {activeSection === 'profile-details' ? (
        <section id="profile-details" className={`${cardShell} scroll-mt-24 p-5 sm:p-6 lg:col-span-12`}>
          <p className={sectionEyebrow}>Details</p>
          <h2 className="mt-1 text-base font-bold text-[#103D4D]">Profile details</h2>
          <p className="mt-1 text-xs text-slate-500 mb-6 max-w-xl">
            Your name and phone appear in the workspace directory, project chat, and notifications. Sign-in email can
            only be changed by an administrator.
          </p>
          <form onSubmit={handleProfileSave} className="space-y-5">
            <div>
              <label htmlFor="erp-account-email" className="block text-xs font-semibold text-teal-900/70 mb-1.5">
                Sign-in email
              </label>
              <input
                id="erp-account-email"
                type="email"
                readOnly
                disabled
                value={session?.user?.email || ''}
                className={`${inputClass} cursor-not-allowed bg-slate-50/90 text-slate-600`}
                autoComplete="email"
              />
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="erp-account-fullname" className="block text-xs font-semibold text-teal-900/70 mb-1.5">
                  Display name
                </label>
                <input
                  id="erp-account-fullname"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  maxLength={200}
                  placeholder="Your name as others see it"
                  autoComplete="name"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="erp-account-phone" className="block text-xs font-semibold text-teal-900/70 mb-1.5">
                  Phone <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  id="erp-account-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={40}
                  placeholder="+1 …"
                  autoComplete="tel"
                  className={inputClass}
                />
              </div>
            </div>
            {profileOk ? (
              <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200/80 rounded-xl px-3 py-2">
                {profileOk}
              </p>
            ) : null}
            {profileErr ? <p className="text-sm text-red-600">{profileErr}</p> : null}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={profileSaving || !session?.user?.id}
                className="rounded-xl bg-gradient-to-r from-[#103D4D] via-teal-700 to-teal-600 px-5 py-2 text-[13px] font-semibold text-white shadow-md shadow-teal-900/20 hover:from-[#0d3442] hover:via-teal-800 disabled:opacity-50"
              >
                {profileSaving ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </form>
        </section>
        ) : null}

        {activeSection === 'notifications' ? (
        <section id="notifications" className={`${cardShell} scroll-mt-24 p-5 sm:p-6 lg:col-span-12`}>
          <p className={sectionEyebrow}>Notifications</p>
          <h2 className="mt-1 text-base font-bold text-[#103D4D]">Email, push & in-app</h2>
          <p className="mt-1 mb-6 max-w-2xl text-xs text-slate-500">
            Control how we reach you when you are offline or in another tab. Project chat in the General channel can
            notify everyone in-app; other channels only notify people who are @mentioned. You can install the workspace
            as an app from the browser for a desktop-like experience — in-app alerts use the bell in the header.
          </p>
          <div className="mb-5 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#103D4D]">Push notifications</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  For desktop OS notifications when the PWA is closed. Works for DMs and @mentions (depending on toggles below).
                </p>
              </div>
              {(() => {
                const pushEnabled =
                  profile?.notify_push_dm !== false || profile?.notify_push_project_mention !== false;
                return (
              <button
                type="button"
                disabled={pushBusy || !session?.user?.id}
                onClick={() => void handlePushToggle(!pushEnabled)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {pushBusy ? 'Working…' : pushEnabled ? 'Disable' : 'Enable'}
              </button>
                );
              })()}
            </div>
            {pushOk ? <p className="mt-3 text-[13px] text-emerald-700">{pushOk}</p> : null}
            {pushErr ? <p className="mt-3 text-[13px] text-red-600">{pushErr}</p> : null}
          </div>
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white/90">
            {[
              {
                field: 'notify_sound',
                label: 'Sound for new messages',
                desc: 'Play a short sound when a new messaging notification arrives (while the app is open).',
                get: (p) => p?.notify_sound !== false,
              },
              {
                field: 'notify_push_project_mention',
                label: 'Push: @mentions in project chat',
                desc: 'Desktop notifications when you are @mentioned (offline).',
                get: (p) => p?.notify_push_project_mention !== false,
              },
              {
                field: 'notify_push_dm',
                label: 'Push: direct messages',
                desc: 'Desktop notifications for 1:1 DMs (offline).',
                get: (p) => p?.notify_push_dm !== false,
              },
              {
                field: 'notify_email_project_mention',
                label: 'Email when @mentioned in project chat',
                desc: 'Sent when you are not active in the workspace and someone @mentions you.',
                get: (p) => p?.notify_email_project_mention !== false,
              },
              {
                field: 'notify_email_dm',
                label: 'Email for direct messages',
                desc: '1:1 DMs when you appear offline.',
                get: (p) => p?.notify_email_dm !== false,
              },
              {
                field: 'notify_in_app_project_chat',
                label: 'In-app: General channel activity',
                desc: 'Bell notifications for new messages in the project’s General channel (not @mention-only).',
                get: (p) => p?.notify_in_app_project_chat !== false,
              },
              {
                field: 'notify_in_app_mention',
                label: 'In-app: @mentions in project chat',
                desc: 'Bell when someone @mentions you in any project channel.',
                get: (p) => p?.notify_in_app_mention !== false,
              },
              {
                field: 'notify_in_app_dm',
                label: 'In-app: direct messages',
                desc: 'Bell when you receive a 1:1 DM while not in an active session.',
                get: (p) => p?.notify_in_app_dm !== false,
              },
            ].map((row) => {
              const on = profile ? row.get(profile) : true;
              const busy = notifBusy === row.field;
              return (
                <div
                  key={row.field}
                  className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#103D4D]">{row.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{row.desc}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    disabled={busy || !session?.user?.id}
                    onClick={() => void patchNotificationField(row.field, !on)}
                    className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-50 ${
                      on ? 'border-[#103D4D]/50 bg-[#103D4D]' : 'border-slate-200 bg-slate-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-7 w-7 translate-y-0.5 transform rounded-full bg-white shadow transition ${
                        on ? 'translate-x-7' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
        ) : null}

        {activeSection === 'password' ? (
        <section id="password" className={`${cardShell} scroll-mt-24 p-5 sm:p-6 lg:col-span-12`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between lg:gap-8">
            <div className="max-w-md">
              <p className={sectionEyebrow}>Security</p>
              <h2 className="mt-1 text-base font-bold text-[#103D4D]">Change password</h2>
              <p className="mt-1 text-xs text-slate-500">
                Use a strong password you do not reuse elsewhere. You will need your current password to set a new one.
              </p>
            </div>
            <form onSubmit={handleSubmit} className="w-full max-w-xl space-y-4 sm:min-w-0 sm:flex-1 lg:max-w-none lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-4 lg:space-y-0">
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-teal-900/70 mb-1.5">Current password</label>
                <input
                  type="password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  required
                  autoComplete="current-password"
                  className={inputClass}
                />
              </div>
              <div className="flex min-w-0 flex-col">
                <label htmlFor="account-new-password" className="text-xs font-semibold text-teal-900/70">
                  New password
                </label>
                <p
                  id="account-new-password-hint"
                  className="mt-0.5 text-[11px] leading-snug text-slate-500 lg:min-h-[2.75rem]"
                >
                  At least 8 characters. Use a mix you do not reuse elsewhere.
                </p>
                <input
                  id="account-new-password"
                  type="password"
                  value={nextPw}
                  onChange={(e) => setNextPw(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  aria-describedby="account-new-password-hint"
                  className={`${inputClass} mt-1.5`}
                />
              </div>
              <div className="flex min-w-0 flex-col">
                <label htmlFor="account-confirm-password" className="text-xs font-semibold text-teal-900/70">
                  Confirm new password
                </label>
                <p
                  id="account-confirm-password-hint"
                  className="mt-0.5 text-[11px] leading-snug text-slate-500 lg:min-h-[2.75rem]"
                >
                  Must match the new password above.
                </p>
                <input
                  id="account-confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  aria-describedby="account-confirm-password-hint"
                  className={`${inputClass} mt-1.5`}
                />
              </div>
              {ok ? (
                <p className="lg:col-span-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200/80 rounded-xl px-3 py-2">
                  {ok}
                </p>
              ) : null}
              {error ? <p className="lg:col-span-2 text-sm text-red-600">{error}</p> : null}
              <div className="flex gap-2.5 lg:col-span-2">
                <input
                  id="sign-out-other-devices"
                  type="checkbox"
                  checked={signOutOthersAfterPw}
                  onChange={(e) => setSignOutOthersAfterPw(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-cyan-200/80 text-[#103D4D] focus:ring-cyan-400/40"
                />
                <label htmlFor="sign-out-other-devices" className="text-xs leading-snug text-slate-600">
                  <span className="font-semibold text-teal-900/80">Sign out other devices</span>
                  <span className="block text-[11px] font-normal text-slate-500">
                    Ends sessions on other browsers and devices after you change your password. This device stays signed in.
                  </span>
                </label>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:col-span-2">
                <Link
                  href="/erp/reset-password"
                  className="order-2 text-center text-xs font-semibold text-teal-700 hover:text-[#103D4D] sm:order-1 sm:text-left"
                >
                  Forgot password
                </Link>
                <button
                  type="submit"
                  disabled={loading}
                  className="order-1 w-full rounded-xl bg-gradient-to-r from-[#103D4D] via-teal-700 to-teal-600 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-teal-900/20 hover:from-[#0d3442] hover:via-teal-800 disabled:opacity-50 sm:order-2 sm:w-auto sm:min-w-[11rem]"
                >
                  {loading ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </form>
          </div>
        </section>
        ) : null}

        {activeSection === 'sign-out' ? (
        <section id="sign-out" className={`${cardShell} scroll-mt-24 p-5 sm:p-6 lg:col-span-12`}>
          <p className={sectionEyebrow}>Session</p>
          <h2 className="mt-1 text-base font-bold text-[#103D4D]">Sign out</h2>
          <p className="mt-1 max-w-xl text-xs text-slate-500">
            End your workspace session on this device. You can sign in again anytime.
          </p>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200/80 bg-white px-4 py-2 text-[13px] font-semibold text-rose-800 shadow-sm transition hover:bg-rose-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-4 w-4 shrink-0" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
              />
            </svg>
            Sign out
          </button>
        </section>
        ) : null}
      </div>
        </div>
      </div>
    </div>
  );
}
