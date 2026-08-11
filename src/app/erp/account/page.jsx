'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { erpAuthorizedFetch } from '../../../lib/erp-client-api';
import { useErpSession } from '../../../components/erp/useErpSession';
import { erpWorkspaceSubtitle, erpWorkspaceDisplayName } from '../../../lib/erp-roles';
import ErpUserAvatar from '../../../components/erp/ErpUserAvatar';
import { registerPushSubscription, unregisterPushSubscription } from '../../../lib/erp-push-client';
import {
  ERP_DARK_ACCOUNT_CARD,
  ERP_DARK_ACCOUNT_HERO,
  ERP_DARK_PRIMARY_BUTTON,
  ERP_DARK_SOLID_CARD,
  ERP_DARK_PILL_PRIMARY,
  ERP_DARK_PILL_VIOLET,
} from '../../../lib/erp-dark-surfaces';
import { ERP_MAX_UPLOAD_BYTES, ERP_MAX_UPLOAD_MB } from '../../../lib/erp-upload-limits';

const inputClass =
  'w-full rounded-xl border border-cyan-200/70 bg-white/90 px-4 py-3 text-slate-900 outline-none transition-shadow focus:border-[#103D4D]/40 focus:ring-2 focus:ring-cyan-400/25 dark:border-teal-800/55 dark:bg-[#0a121a] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-500/45 dark:focus:ring-teal-500/25';

/** Main content sections: glass in light; matte teal/slate in `.dark` (no gradient bleed). */
const cardShell = `rounded-3xl border border-white/90 bg-white/80 backdrop-blur-md shadow-[0_12px_48px_-16px_rgba(16,61,77,0.14),0_4px_16px_-8px_rgba(15,23,42,0.06)] ring-1 ring-cyan-100/50 ${ERP_DARK_ACCOUNT_CARD}`;

/** Secondary inner blocks (notifications push row, list shell). */
const innerWell = `rounded-2xl border border-slate-200/80 bg-white/90 ${ERP_DARK_SOLID_CARD}`;

const sectionEyebrow =
  'text-[10px] font-bold uppercase tracking-[0.2em] text-teal-800/55 dark:text-teal-500/85';

/** Page hero: light gradient; `.dark`: flat teal/slate (no glossy band). */
const accountHeroShell = `relative overflow-hidden rounded-3xl border border-cyan-200/40 bg-gradient-to-br from-white via-cyan-50/50 to-violet-50/40 p-5 sm:p-6 mb-6 shadow-[0_20px_60px_-24px_rgba(16,61,77,0.18)] ring-1 ring-white/70 ${ERP_DARK_ACCOUNT_HERO}`;

const MAX_AVATAR_BYTES = ERP_MAX_UPLOAD_BYTES;
const ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Profile photo row: flex centering; min-w-0 + no shrink-0 so grid cells never overlap at zoom. */
const avatarPhotoActionBtnShell =
  'relative z-0 flex h-11 min-h-11 w-full max-w-full min-w-0 flex-row items-center justify-center gap-2 overflow-hidden rounded-xl border px-3 text-center text-[13px] font-semibold leading-tight transition-all duration-200 [-webkit-tap-highlight-color:transparent] sm:text-sm disabled:pointer-events-none disabled:opacity-50';

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
  const [photoDropActive, setPhotoDropActive] = useState(false);
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
  const [avatarLightboxOpen, setAvatarLightboxOpen] = useState(false);
  /** `null` = loading or closed; empty string = load failed; otherwise signed URL */
  const [avatarLightboxSrc, setAvatarLightboxSrc] = useState(null);
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

  async function processAvatarFile(file) {
    if (!file || !session?.user?.id || !supabase) return;

    setAvatarErr('');
    setAvatarMsg('');
    if (!ACCEPT_TYPES.includes(file.type)) {
      setAvatarErr('Use a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarErr(`Image must be ${ERP_MAX_UPLOAD_MB} MB or smaller.`);
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

  function handleAvatarFile(e) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    void processAvatarFile(file);
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
      setAvatarLightboxOpen(false);
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
    : session?.user?.email || 'n/a';

  const sections = useMemo(
    () => [
      { key: 'profile-details', href: '#profile-details', label: 'Profile details', short: 'Details' },
      { key: 'notifications', href: '#notifications', label: 'Notifications', short: 'Notifications' },
      { key: 'password', href: '#password', label: 'Password', short: 'Password' },
      { key: 'sign-out', href: '#sign-out', label: 'Sign out', short: 'Sign out' },
    ],
    [],
  );

  const [activeSection, setActiveSection] = useState('profile-details');

  useEffect(() => {
    const pickFromHash = () => {
      const raw = typeof window !== 'undefined' ? window.location.hash || '' : '';
      const k = raw.startsWith('#') ? raw.slice(1) : raw;
      const normalized = k === 'profile-photo' ? 'profile-details' : k;
      if (normalized && sections.some((s) => s.key === normalized)) setActiveSection(normalized);
    };
    pickFromHash();
    window.addEventListener('hashchange', pickFromHash);
    return () => window.removeEventListener('hashchange', pickFromHash);
  }, [sections]);

  useEffect(() => {
    if (!avatarLightboxOpen) {
      setAvatarLightboxSrc(null);
      return;
    }
    const path = profile?.avatar_path;
    if (!path) {
      setAvatarLightboxOpen(false);
      return;
    }
    let alive = true;
    setAvatarLightboxSrc(null);
    void (async () => {
      const { data, error } = await supabase.storage.from('erp-files').createSignedUrl(path, 3600);
      if (!alive) return;
      if (error || !data?.signedUrl) setAvatarLightboxSrc('');
      else setAvatarLightboxSrc(data.signedUrl);
    })();
    return () => {
      alive = false;
    };
  }, [avatarLightboxOpen, profile?.avatar_path]);

  useEffect(() => {
    if (!avatarLightboxOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setAvatarLightboxOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [avatarLightboxOpen]);

  function goSection(key) {
    const s = sections.find((x) => x.key === key);
    if (!s) return;
    setActiveSection(key);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', s.href);
    }
  }

  return (
    <>
    <div className="w-full min-w-0 max-w-none">
      <div className={accountHeroShell}>
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-[#B2EBF2]/60 to-violet-300/30 blur-3xl dark:opacity-25"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-12 left-1/4 h-32 w-64 rounded-full bg-[#103D4D]/[0.06] blur-2xl dark:opacity-30"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className={sectionEyebrow}>Workspace</p>
            <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-[#103D4D] dark:text-teal-100">
              Account settings
            </h1>
            <p className="mt-2 text-[13px] text-slate-600 dark:text-slate-400">
              Signed in as{' '}
              <span className="font-semibold text-[#103D4D] dark:text-teal-200">{session?.user?.email || 'n/a'}</span>
            </p>
            {profile ? (
              <div className="mt-3 flex flex-wrap items-stretch gap-2">
                <span
                  className={`inline-flex h-8 min-h-8 max-w-full items-center justify-center rounded-full border border-cyan-200/80 bg-white/90 px-3 py-0 text-xs font-semibold leading-none text-[#103D4D] shadow-sm ${ERP_DARK_PILL_PRIMARY}`}
                >
                  {displayLabel}
                </span>
                <span
                  className={`inline-flex h-8 min-h-8 max-w-full items-center justify-center rounded-full bg-violet-100/90 px-3 py-0 text-xs font-semibold capitalize leading-none text-violet-900 ring-1 ring-violet-200/80 ${ERP_DARK_PILL_VIOLET}`}
                >
                  {erpWorkspaceSubtitle(profile)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
        {(profile?.role === 'team_member' || profile?.role === 'team_lead') && !profile?.member_team ? (
          <p className="relative mt-4 max-w-2xl text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Your workspace admin or team lead can assign your functional team (Developers, Graphic designers, or
            Marketing) from{' '}
            <Link href="/erp/admin/users" className="font-semibold text-[#103D4D] hover:underline dark:text-teal-300">
              Users
            </Link>
            .
          </p>
        ) : null}
      </div>

      <div className="lg:flex lg:gap-8 lg:items-start">
        <aside className="hidden lg:block lg:w-64 lg:shrink-0">
          <div
            className={`sticky top-6 rounded-3xl border border-cyan-200/40 bg-white/80 p-4 shadow-[0_12px_48px_-16px_rgba(16,61,77,0.12)] ring-1 ring-white/70 backdrop-blur-md ${ERP_DARK_ACCOUNT_CARD}`}
          >
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-teal-800/55 dark:text-teal-500/85">
              Account
            </p>
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
                      ? 'border-cyan-200/70 bg-cyan-50/50 text-[#103D4D] dark:border-teal-600/55 dark:bg-[#143240] dark:text-teal-50'
                      : 'border-transparent text-slate-700 hover:border-cyan-200/70 hover:bg-cyan-50/40 hover:text-[#103D4D] dark:text-slate-200 dark:hover:border-teal-800/50 dark:hover:bg-white/[0.08] dark:hover:text-white'
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
                      ? 'border-[#103D4D]/25 erp-brand-fill text-white dark:border-teal-600/50 dark:text-teal-50'
                      : 'border-slate-200 bg-white/90 text-slate-600 hover:border-[#103D4D]/25 hover:text-[#103D4D] dark:border-teal-800/50 dark:bg-[#101a22] dark:text-slate-300 dark:hover:border-teal-600/40 dark:hover:text-teal-200'
                  }`}
                >
                  {i.short}
                </a>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-12 lg:gap-8 lg:items-start">
        {activeSection === 'profile-details' ? (
        <section id="profile-details" className={`${cardShell} scroll-mt-24 relative overflow-hidden p-6 sm:p-7 lg:col-span-12`}>
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(178,235,242,0.45),transparent)] dark:hidden"
            aria-hidden
          />
          <div className="relative">
            <div className="grid min-w-0 gap-5 lg:grid-cols-2 lg:gap-6">
              <div className={`flex min-w-0 w-full flex-col rounded-2xl border border-cyan-200/70 bg-white/92 p-4 shadow-sm dark:border-teal-900/45 dark:bg-[#0d1720]`}>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPT_TYPES.join(',')}
                  className="hidden"
                  onChange={handleAvatarFile}
                />
                <div
                  role="button"
                  tabIndex={avatarBusy || !session?.user?.id ? -1 : 0}
                  aria-label="Upload profile photo"
                  aria-busy={avatarBusy}
                  aria-disabled={avatarBusy || !session?.user?.id}
                  onKeyDown={(e) => {
                    if (avatarBusy || !session?.user?.id) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileRef.current?.click();
                    }
                  }}
                  onClick={() => {
                    if (!avatarBusy && session?.user?.id) fileRef.current?.click();
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPhotoDropActive(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    const next = e.relatedTarget;
                    if (next && e.currentTarget.contains(next)) return;
                    setPhotoDropActive(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPhotoDropActive(false);
                    const f = e.dataTransfer.files?.[0];
                    void processAvatarFile(f);
                  }}
                  className={`relative w-full rounded-2xl border-2 border-dashed px-6 py-8 text-center outline-none transition-all duration-200 sm:px-8 sm:py-10 focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0e1824] ${avatarBusy ? 'cursor-wait opacity-[0.82]' : 'cursor-pointer'} ${
                    photoDropActive
                      ? 'scale-[1.01] border-teal-500 bg-teal-50/90 shadow-[0_24px_52px_-24px_rgba(16,61,77,0.35)] dark:border-teal-400 dark:bg-teal-500/10 dark:shadow-[0_24px_48px_-20px_rgba(0,0,0,0.5)]'
                      : 'border-slate-200/95 bg-white shadow-[0_8px_30px_-14px_rgba(15,23,42,0.14)] hover:border-teal-300/80 hover:shadow-[0_14px_35px_-16px_rgba(16,61,77,0.25)] dark:border-teal-800/55 dark:bg-[#0b151e] dark:shadow-black/35 dark:hover:border-teal-600/55 dark:hover:bg-[#0f1b25]'
                  }`}
                >
                  <div className="pointer-events-none flex flex-col items-center">
                    <div className="relative">
                      {profile?.avatar_path ? (
                        <button
                          type="button"
                          disabled={avatarBusy}
                          title="View full size"
                          aria-label="View profile photo full size"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!avatarBusy) setAvatarLightboxOpen(true);
                          }}
                          className="pointer-events-auto relative cursor-zoom-in rounded-full border-0 bg-transparent p-0 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-teal-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-wait disabled:opacity-70 dark:focus-visible:ring-teal-400/50 dark:focus-visible:ring-offset-[#0e1824]"
                        >
                          <div
                            className={`rounded-full p-[3px] transition-all duration-200 ${photoDropActive ? 'shadow-lg shadow-teal-500/30' : 'shadow-lg shadow-slate-900/10 dark:shadow-black/50'}`}
                            style={{
                              background:
                                'linear-gradient(135deg, rgba(45,212,191,0.55) 0%, rgba(16,61,77,0.85) 50%, rgba(56,189,248,0.45) 100%)',
                            }}
                          >
                            <div className="rounded-full bg-white p-[2px] dark:bg-[#0e1824]">
                              <ErpUserAvatar
                                profile={profile}
                                email={session?.user?.email}
                                size="xl"
                                alt=""
                                className="!h-[5.75rem] !w-[5.75rem] text-xl sm:!h-24 sm:!w-24 sm:text-2xl"
                              />
                            </div>
                          </div>
                        </button>
                      ) : (
                        <div className="relative">
                          <div
                            className={`rounded-full p-[3px] transition-all duration-200 ${photoDropActive ? 'shadow-lg shadow-teal-500/30' : 'shadow-lg shadow-slate-900/10 dark:shadow-black/50'}`}
                            style={{
                              background:
                                'linear-gradient(135deg, rgba(45,212,191,0.55) 0%, rgba(16,61,77,0.85) 50%, rgba(56,189,248,0.45) 100%)',
                            }}
                          >
                            <div className="rounded-full bg-white p-[2px] dark:bg-[#0e1824]">
                              <ErpUserAvatar
                                profile={profile}
                                email={session?.user?.email}
                                size="xl"
                                alt=""
                                className="!h-[5.75rem] !w-[5.75rem] text-xl sm:!h-24 sm:!w-24 sm:text-2xl"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      <span
                        className="absolute -bottom-0.5 -right-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-white bg-slate-900 text-white shadow-md dark:border-[#121f28] dark:bg-white dark:text-slate-900"
                        aria-hidden
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                          />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </span>
                    </div>
                    <p className="mt-5 max-w-[14rem] text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                      {avatarBusy ? 'Uploading…' : photoDropActive ? 'Drop to replace' : 'Click or drop'}
                    </p>
                    <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                      <span className="font-medium text-[#103D4D] dark:text-teal-300">Replace</span> your workspace
                      avatar
                    </p>
                  </div>
                </div>

                <div className={profile?.avatar_path
                  ? 'mt-4 grid min-w-0 grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 min-[700px]:grid-cols-3 min-[700px]:gap-3 [&>button]:min-w-0 min-[480px]:[grid-template-columns:repeat(2,minmax(0,1fr))] min-[700px]:[grid-template-columns:repeat(3,minmax(0,1fr))]'
                  : 'mt-4 flex min-w-0 flex-col gap-2.5 min-[520px]:flex-row min-[520px]:flex-wrap min-[520px]:justify-end'}>
                  <button
                    type="button"
                    disabled={avatarBusy || !session?.user?.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileRef.current?.click();
                    }}
                    className={`${avatarPhotoActionBtnShell} erp-brand-fill border-transparent text-white shadow-md shadow-sky-700/20 hover:shadow-lg ${
                      profile?.avatar_path ? '' : 'w-full min-[520px]:w-auto min-[520px]:min-w-[11rem]'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="pointer-events-none h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5 5 5M12 5v12" />
                    </svg>
                    <span className="min-w-0 text-pretty">{avatarBusy ? 'Working…' : 'Choose image'}</span>
                  </button>
                  {profile?.avatar_path ? (
                    <button
                      type="button"
                      disabled={avatarBusy}
                      onClick={(e) => {
                        e.stopPropagation();
                        setAvatarLightboxOpen(true);
                      }}
                    className={`${avatarPhotoActionBtnShell} border-cyan-200/90 bg-white text-[#103D4D] shadow-sm hover:border-cyan-300 hover:bg-cyan-50 dark:border-teal-700/55 dark:bg-teal-950/40 dark:text-teal-100 dark:hover:border-teal-600 dark:hover:bg-teal-900/35`}
                    >
                      <svg viewBox="0 0 24 24" className="pointer-events-none h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3A1.5 1.5 0 001.5 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25z" />
                      </svg>
                      <span className="min-w-0 text-pretty">View photo</span>
                    </button>
                  ) : null}
                  {profile?.avatar_path ? (
                    <button
                      type="button"
                      disabled={avatarBusy}
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeAvatar();
                      }}
                    className={`${avatarPhotoActionBtnShell} border-slate-200/95 bg-white text-slate-600 shadow-sm hover:border-rose-300/70 hover:bg-rose-50/90 hover:text-rose-700 dark:border-slate-600/80 dark:bg-[#101923] dark:text-slate-300 dark:hover:border-rose-500/45 dark:hover:bg-rose-950/35 dark:hover:text-rose-200`}
                    >
                      <svg viewBox="0 0 24 24" className="pointer-events-none h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                      <span className="min-w-0 text-pretty">Remove</span>
                    </button>
                  ) : null}
                </div>
                {avatarMsg ? (
                  <p className="mt-4 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800/45 dark:bg-emerald-950/40 dark:text-emerald-200">
                    {avatarMsg}
                  </p>
                ) : null}
                {avatarErr ? (
                  <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">{avatarErr}</p>
                ) : null}
              </div>

              <div className={`rounded-2xl border border-slate-200/80 bg-white/92 p-5 sm:p-6 shadow-sm ${ERP_DARK_SOLID_CARD}`}>
              <form onSubmit={handleProfileSave} className="flex h-full flex-col gap-5">
                <div>
                  <label
                    htmlFor="erp-account-email"
                    className="mb-1.5 block text-xs font-semibold text-teal-900/70 dark:text-teal-400/85"
                  >
                    Sign-in email
                  </label>
                  <input
                    id="erp-account-email"
                    type="email"
                    readOnly
                    disabled
                    value={session?.user?.email || ''}
                    className={`${inputClass} min-w-0 cursor-not-allowed bg-slate-50/90 text-slate-600 dark:bg-[#050a10]/90 dark:text-slate-400`}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label htmlFor="erp-account-fullname" className="mb-1.5 block text-xs font-semibold text-teal-900/70 dark:text-teal-400/85">
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
                  <label htmlFor="erp-account-phone" className="mb-1.5 block text-xs font-semibold text-teal-900/70 dark:text-teal-400/85">
                    Phone <span className="font-normal text-slate-400 dark:text-slate-500">(optional)</span>
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
                {profileOk ? (
                  <p className="rounded-xl border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800/45 dark:bg-emerald-950/40 dark:text-emerald-200">
                    {profileOk}
                  </p>
                ) : null}
                {profileErr ? <p className="text-sm text-red-600 dark:text-red-400">{profileErr}</p> : null}
                <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={profileSaving || !session?.user?.id}
                    className={`rounded-xl px-5 py-2 text-[13px] font-semibold transition ${ERP_DARK_PRIMARY_BUTTON}`}
                  >
                    {profileSaving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </form>
              </div>
            </div>
          </div>
        </section>
        ) : null}

        {activeSection === 'notifications' ? (
        <section id="notifications" className={`${cardShell} scroll-mt-24 p-5 sm:p-6 lg:col-span-12`}>
          <p className={sectionEyebrow}>Notifications</p>
          <h2 className="mt-1 text-base font-bold text-[#103D4D] dark:text-teal-100">Email, push & in-app</h2>
          <p className="mt-1 mb-6 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
            Control how we reach you when you are offline or in another tab. Project chat in the General channel can
            notify everyone in-app; other channels only notify people who are @mentioned. You can install the workspace
            as an app from the browser for a desktop-like experience: in-app alerts use the bell in the header.
          </p>
          <div className={`mb-5 px-4 py-4 ${innerWell}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#103D4D] dark:text-teal-100">Push notifications</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
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
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-teal-800/55 dark:bg-[#0f1820] dark:text-slate-200 dark:hover:bg-[#152830]"
              >
                {pushBusy ? 'Working…' : pushEnabled ? 'Disable' : 'Enable'}
              </button>
                );
              })()}
            </div>
            {pushOk ? <p className="mt-3 text-[13px] text-emerald-700 dark:text-emerald-300">{pushOk}</p> : null}
            {pushErr ? <p className="mt-3 text-[13px] text-red-600 dark:text-red-400">{pushErr}</p> : null}
          </div>
          <div className={`divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white/90 dark:divide-teal-900/35 ${ERP_DARK_SOLID_CARD}`}>
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
                    <p className="text-sm font-semibold text-[#103D4D] dark:text-teal-100">{row.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{row.desc}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    disabled={busy || !session?.user?.id}
                    onClick={() => void patchNotificationField(row.field, !on)}
                    className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-teal-500/30 ${
                      on
                        ? 'border-[#103D4D]/50 erp-brand-fill dark:border-teal-700/55'
                        : 'border-slate-200 bg-slate-200 dark:border-slate-600 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-7 w-7 translate-y-0.5 transform rounded-full bg-white shadow transition dark:bg-slate-200 ${
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
              <h2 className="mt-1 text-base font-bold text-[#103D4D] dark:text-teal-100">Change password</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Use a strong password you do not reuse elsewhere. You will need your current password to set a new one.
              </p>
            </div>
            <form onSubmit={handleSubmit} className="w-full max-w-xl space-y-4 sm:min-w-0 sm:flex-1 lg:max-w-none lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-4 lg:space-y-0">
              <div className="lg:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-teal-900/70 dark:text-teal-400/85">Current password</label>
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
                <label htmlFor="account-new-password" className="text-xs font-semibold text-teal-900/70 dark:text-teal-400/85">
                  New password
                </label>
                <p
                  id="account-new-password-hint"
                  className="mt-0.5 text-[11px] leading-snug text-slate-500 lg:min-h-[2.75rem] dark:text-slate-400"
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
                <label htmlFor="account-confirm-password" className="text-xs font-semibold text-teal-900/70 dark:text-teal-400/85">
                  Confirm new password
                </label>
                <p
                  id="account-confirm-password-hint"
                  className="mt-0.5 text-[11px] leading-snug text-slate-500 lg:min-h-[2.75rem] dark:text-slate-400"
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
                <p className="lg:col-span-2 rounded-xl border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800/45 dark:bg-emerald-950/40 dark:text-emerald-200">
                  {ok}
                </p>
              ) : null}
              {error ? <p className="lg:col-span-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
              <div className="flex gap-2.5 lg:col-span-2">
                <input
                  id="sign-out-other-devices"
                  type="checkbox"
                  checked={signOutOthersAfterPw}
                  onChange={(e) => setSignOutOthersAfterPw(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-cyan-200/80 text-[#103D4D] focus:ring-cyan-400/40 dark:border-teal-700/60 dark:bg-[#0f1820] dark:text-teal-400 dark:focus:ring-teal-500/35"
                />
                <label htmlFor="sign-out-other-devices" className="text-xs leading-snug text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-teal-900/80 dark:text-teal-300/90">Sign out other devices</span>
                  <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                    Ends sessions on other browsers and devices after you change your password. This device stays signed in.
                  </span>
                </label>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:col-span-2">
                <Link
                  href="/erp/reset-password"
                  className="order-2 text-center text-xs font-semibold text-teal-700 hover:text-[#103D4D] dark:text-teal-400 dark:hover:text-teal-200 sm:order-1 sm:text-left"
                >
                  Forgot password
                </Link>
                <button
                  type="submit"
                  disabled={loading}
                  className={`order-1 w-full rounded-xl py-2.5 text-[13px] font-semibold shadow-lg transition disabled:opacity-50 sm:order-2 sm:w-auto sm:min-w-[11rem] ${ERP_DARK_PRIMARY_BUTTON}`}
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
          <h2 className="mt-1 text-base font-bold text-[#103D4D] dark:text-teal-100">Sign out</h2>
          <p className="mt-1 max-w-xl text-xs text-slate-500 dark:text-slate-400">
            End your workspace session on this device. You can sign in again anytime.
          </p>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200/80 bg-white px-4 py-2 text-[13px] font-semibold text-rose-800 shadow-sm transition hover:bg-rose-50 dark:border-rose-900/55 dark:bg-rose-950/35 dark:text-rose-200 dark:hover:bg-rose-950/55"
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
    {avatarLightboxOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            role="presentation"
            onClick={() => setAvatarLightboxOpen(false)}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={(e) => {
                e.stopPropagation();
                setAvatarLightboxOpen(false);
              }}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-lg transition hover:bg-white/20"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Profile photo"
              className="relative max-h-[90vh] max-w-[min(96vw,56rem)]"
              onClick={(e) => e.stopPropagation()}
            >
              {avatarLightboxSrc === null ? (
                <div className="flex min-h-[12rem] min-w-[12rem] items-center justify-center rounded-2xl bg-white/5 px-8 text-sm font-medium text-white/90">
                  Loading…
                </div>
              ) : avatarLightboxSrc === '' ? (
                <div className="rounded-2xl border border-white/20 bg-white/10 px-6 py-8 text-center text-sm text-white/90">
                  Could not load this image. Try again in a moment.
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL, not a static import
                <img
                  src={avatarLightboxSrc}
                  alt="Your profile photo"
                  className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl ring-1 ring-white/10"
                />
              )}
            </div>
          </div>,
          document.body,
        )
      : null}
    </>
  );
}
