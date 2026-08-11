'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getStoredColorScheme } from '../lib/erp-color-scheme';

const features = [
  {
    title: 'Projects & delivery',
    desc: 'Track milestones, files, and updates in one shared space: built for how your team already works together.',
    cardClass:
      'border-cyan-200/70 bg-gradient-to-br from-cyan-50/90 via-white to-cyan-50/40 ring-cyan-100/60 hover:border-cyan-300/80 hover:shadow-cyan-500/10',
    iconClass: 'border-cyan-200/80 bg-gradient-to-br from-white to-cyan-50/95 text-[#103D4D] shadow-cyan-900/5',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 4.5v2.25c0 .414.164.78.44 1.06l2.12 2.12m0 0l6.19 6.19m-6.19-6.19L6.5 8.25m0 0L8.12 6.12m-1.62 1.63L3 3" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75" />
      </svg>
    ),
  },
  {
    title: 'Messages & context',
    desc: 'Project chat and DMs so feedback stays where the work is: less email drift, faster alignment.',
    cardClass:
      'border-teal-200/70 bg-gradient-to-br from-teal-50/85 via-white to-[#E0F7FA]/50 ring-teal-100/50 hover:border-teal-300/80 hover:shadow-teal-500/10',
    iconClass: 'border-teal-200/80 bg-gradient-to-br from-white to-teal-50/90 text-teal-800 shadow-cyan-900/5',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 1.268-.63 2.39-1.593 3.068a3.75 3.75 0 11-7.5 0 4.167 4.167 0 00-1.5 2.5H9.75c-.38 0-.75-.21-.93-.55a3.6 3.6 0 00-.1-.2 4.2 4.2 0 00-1.1-1.3 4.75 4.75 0 00-1.2-.9 4.8 4.8 0 00-1.6-.5 4.8 4.8 0 00-1.7.1 4.8 4.8 0 00-1.5.4 3.6 3.6 0 00-1.1.6 3.6 3.6 0 00-.9.8 3.6 3.6 0 00-.5 1" />
      </svg>
    ),
  },
  {
    title: 'Your team, your access',
    desc: 'Roles and permissions keep clients and staff in the right rooms: nothing more, nothing less.',
    cardClass:
      'border-violet-200/60 bg-gradient-to-br from-violet-50/80 via-white to-cyan-50/35 ring-violet-100/50 hover:border-violet-300/70 hover:shadow-violet-500/10',
    iconClass: 'border-violet-200/70 bg-gradient-to-br from-white to-violet-50/90 text-violet-800 shadow-cyan-900/5',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
];

const pageGutter =
  'mx-auto w-full max-w-[100vw] px-4 min-[400px]:px-5 sm:px-6 md:px-8 lg:px-10 xl:px-12 2xl:px-[100px]';

const DEFAULT_WINDOWS_DOWNLOAD_URL = '/downloads/digitalis-workspace-setup.exe';
const desktopWindowsUrl = (() => {
  const raw =
    typeof process.env.NEXT_PUBLIC_DESKTOP_WINDOWS_DOWNLOAD_URL === 'string'
      ? process.env.NEXT_PUBLIC_DESKTOP_WINDOWS_DOWNLOAD_URL.trim()
      : '';
  return raw || DEFAULT_WINDOWS_DOWNLOAD_URL;
})();

/** Mac download is opt-in until you host a .dmg (build on macOS or GitHub Actions: see desktop/README.md). */
const desktopMacUrl = (() => {
  const raw =
    typeof process.env.NEXT_PUBLIC_DESKTOP_MAC_DOWNLOAD_URL === 'string'
      ? process.env.NEXT_PUBLIC_DESKTOP_MAC_DOWNLOAD_URL.trim()
      : '';
  return raw || '';
})();

const desktopDownloadBtnClass =
  'inline-flex min-h-[48px] w-full shrink-0 items-center justify-center rounded-2xl border-2 border-[#103D4D]/30 bg-white/90 px-6 py-3.5 text-base font-bold text-[#103D4D] shadow-sm backdrop-blur-sm hover:border-[#103D4D]/50 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#589CD5]/45 focus-visible:ring-offset-2 sm:w-auto sm:min-w-[12rem]';

const desktopDownloadBtnCompactClass =
  'inline-flex min-h-[44px] min-w-0 max-w-[9.5rem] items-center justify-center truncate rounded-xl border border-[#103D4D]/25 bg-white/80 px-3 py-2.5 text-xs font-semibold text-[#103D4D] shadow-sm backdrop-blur-sm hover:border-[#103D4D]/40 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#589CD5]/40 focus-visible:ring-offset-2 sm:max-w-none sm:px-3.5 sm:text-sm';

function LogoMark() {
  const [useImg, setUseImg] = useState(true);

  return (
    <div className="flex items-center">
      {useImg ? (
        <img
          src="/Digitalis_logo_black.png"
          alt="Digitalis Global"
          className="h-10 w-auto max-w-[200px] object-contain object-left min-[400px]:h-11 min-[500px]:h-12 sm:h-12 md:h-14 sm:max-w-[240px] md:max-w-[280px]"
          onError={() => setUseImg(false)}
        />
      ) : (
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-extrabold tracking-tight text-[#103D4D] min-[500px]:text-4xl">Digitalis</span>
          <span className="text-base font-medium text-slate-500 min-[500px]:text-lg">Global</span>
        </div>
      )}
    </div>
  );
}

function HeroMockup() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-3 rounded-3xl bg-gradient-to-tr from-cyan-200/40 via-violet-200/30 to-teal-200/35 blur-2xl sm:-inset-4"
      />
      <div className="relative overflow-hidden rounded-2xl border-2 border-cyan-200/50 bg-gradient-to-b from-cyan-50/85 via-white to-violet-50/20 p-4 shadow-2xl shadow-cyan-900/10 ring-1 ring-cyan-200/40 sm:p-5">
          {/* Project header with real text */}
          <div className="flex items-start gap-3 rounded-xl border border-cyan-200/60 bg-white/95 p-3 shadow-sm shadow-cyan-900/5 sm:p-4">
            <div
              className="btn-logo-gradient mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg font-bold shadow-md"
              aria-hidden
            >
              D
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 sm:text-base">Q2 product launch</p>
              <p className="mt-0.5 text-xs font-medium text-slate-600 sm:text-sm">Client portal · 5 members · 3 workstreams</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-800 sm:text-xs">
                  In progress
                </span>
                <span className="text-[10px] text-slate-600 sm:text-xs">Due Jun 12</span>
              </div>
            </div>
          </div>

          {/* Metric cards: darker text & borders */}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2.5">
            <div className="rounded-lg border border-slate-300/90 bg-white p-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Open tasks</p>
              <p className="mt-1 text-xl font-extrabold text-slate-900">14</p>
              <p className="mt-0.5 text-[11px] text-slate-600">3 due this week</p>
            </div>
            <div className="rounded-lg border border-slate-300/90 bg-white p-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Unread</p>
              <p className="mt-1 text-xl font-extrabold text-slate-900">2</p>
              <p className="mt-0.5 text-[11px] text-slate-600">in project chat</p>
            </div>
            <div className="rounded-lg border border-slate-300/90 bg-white p-3 shadow-sm sm:col-span-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Activity</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-slate-500" title="away" />
                <div className="h-2 w-2 rounded-full bg-slate-500" title="away" />
                <div className="h-2 w-2 rounded-full erp-brand-fill" title="online" />
                <span className="ml-0.5 text-xs font-medium text-slate-700">3 online</span>
              </div>
            </div>
          </div>

          {/* Mini task list: readable rows */}
          <div className="mt-3 rounded-lg border border-slate-300/80 bg-slate-100/80 p-2">
            <p className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">This week</p>
            <ul className="space-y-1.5">
              <li className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs">
                <span className="font-medium text-slate-800">Homepage copy review</span>
                <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">High</span>
              </li>
              <li className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs">
                <span className="font-medium text-slate-800">Handoff to dev</span>
                <span className="shrink-0 text-[10px] font-semibold text-slate-500">Tue</span>
              </li>
            </ul>
          </div>

          {/* Message composer: darker strip */}
          <div className="mt-3 flex items-center gap-2 rounded-lg border-2 border-slate-400/50 bg-slate-800/90 px-3 py-2.5 shadow-inner sm:py-3">
            <span className="text-[11px] text-slate-300 sm:text-xs">Message the team…</span>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-teal-400/90">Send</span>
          </div>
      </div>
    </div>
  );
}

export default function DigitalisErpLanding() {
  /** ERP dark mode is stored on `<html>`: keep the public marketing page always light. */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
    return () => {
      const stored = getStoredColorScheme();
      if (stored === 'dark') root.classList.add('dark');
      else root.classList.remove('dark');
    };
  }, []);

  return (
    <div className="digitalis-marketing-landing min-h-screen overflow-x-hidden bg-[#f8fafc] text-slate-800">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(178,235,242,0.28),transparent_70%)]" />
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 70% 55% at 0% 15%, rgba(196, 181, 253, 0.1), transparent 52%),
              radial-gradient(ellipse 65% 50% at 100% 10%, rgba(165, 243, 252, 0.2), transparent 50%),
              radial-gradient(ellipse 50% 40% at 50% 100%, rgba(204, 251, 241, 0.22), transparent 55%)
            `,
          }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-[55%] opacity-40"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='64' height='64' viewBox='0 0 64 64' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.6' fill='%2322d3ee' fill-opacity='0.08'/%3E%3C/svg%3E")`,
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div className="relative z-0 text-slate-800">
        <header className="relative z-10">
          <div className={`${pageGutter} pt-3 sm:pt-4`}>
            <div className="flex min-h-[3.5rem] items-center justify-between gap-3 rounded-2xl border border-cyan-200/60 bg-gradient-to-r from-white/95 via-cyan-50/40 to-violet-50/25 px-3 py-2.5 shadow-[0_8px_30px_-8px_rgba(16,61,77,0.12),0_0_0_1px_rgba(178,235,242,0.35)] backdrop-blur-md min-[400px]:min-h-14 min-[400px]:px-4 min-[400px]:py-3 sm:px-5">
              <Link
                href="/"
                className="min-w-0 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#589CD5]/40 rounded-lg"
              >
                <LogoMark />
              </Link>
              <nav className="flex shrink-0 items-center gap-2 min-[400px]:gap-2.5">
                {desktopWindowsUrl ? (
                  <a href={desktopWindowsUrl} rel="noopener noreferrer" className={desktopDownloadBtnCompactClass}>
                    Windows app
                  </a>
                ) : null}
                {desktopMacUrl ? (
                  <a href={desktopMacUrl} rel="noopener noreferrer" className={desktopDownloadBtnCompactClass}>
                    Mac app
                  </a>
                ) : null}
                <Link
                  href="/erp/login"
                  className="btn-logo-gradient inline-flex min-h-[44px] min-w-[4.5rem] items-center justify-center rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-2 sm:px-5"
                >
                  Sign in
                </Link>
              </nav>
            </div>
          </div>
        </header>

        <section className={`relative z-10 pb-14 pt-6 sm:pb-20 sm:pt-8 lg:pb-28 lg:pt-10 ${pageGutter}`}>
          <div className="grid items-center gap-10 sm:gap-12 lg:grid-cols-2 lg:gap-16 lg:pt-2 xl:gap-20">
            <div className="flex min-w-0 flex-col items-center sm:items-start sm:text-left">
              <p className="mb-4 inline-flex w-fit max-w-full items-center gap-2 rounded-full border border-cyan-200/70 bg-gradient-to-r from-cyan-50/95 to-teal-50/60 px-3 py-1.5 text-left text-xs font-semibold text-[#103D4D] shadow-sm shadow-cyan-900/5 min-[400px]:px-4 min-[400px]:py-1.5">
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Secure client &amp; team portal
              </p>
              <h1 className="w-full text-balance text-center text-3xl font-extrabold leading-[1.1] tracking-tight text-slate-900 min-[400px]:text-4xl sm:text-left sm:text-5xl lg:text-6xl lg:leading-[1.05] xl:text-[3.35rem]">
                One place for the work we ship{' '}
                <span
                  className="inline-block bg-clip-text text-transparent"
                  style={{ backgroundImage: 'var(--gradient-primary)' }}
                >
                  together
                </span>
                <span className="text-slate-400">.</span>
              </h1>
              <p className="mt-5 max-w-3xl text-center text-base leading-relaxed text-slate-600 sm:mt-6 sm:text-left sm:text-lg lg:max-w-2xl lg:text-xl">
                The Digitalis workspace is where your projects, tasks, and conversations live: so you
                always know what&rsquo;s in motion without chasing threads across inboxes.
              </p>
              <div className="mt-8 flex w-full max-w-md flex-col gap-3 self-center sm:mt-10 sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-start sm:gap-3">
                <Link
                  href="/erp/login"
                  className="btn-logo-gradient group inline-flex min-h-[48px] w-full min-w-0 shrink-0 items-center justify-center rounded-2xl px-6 py-3.5 text-base font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-2 sm:w-auto sm:px-8"
                >
                  Sign in to workspace
                  <span className="ml-2 inline-block transition group-hover:translate-x-0.5" aria-hidden>
                    →
                  </span>
                </Link>
                {desktopWindowsUrl ? (
                  <a href={desktopWindowsUrl} rel="noopener noreferrer" className={desktopDownloadBtnClass}>
                    Download for Windows
                  </a>
                ) : null}
                {desktopMacUrl ? (
                  <a href={desktopMacUrl} rel="noopener noreferrer" className={desktopDownloadBtnClass}>
                    Download for Mac
                  </a>
                ) : null}
              </div>
              <p className="mt-6 max-w-xl text-center text-sm text-slate-500 sm:mt-8 sm:text-left">
                First time? Your Digitalis contact sends access by email: use that to get started, then sign in here anytime.
              </p>
            </div>
            <div className="mx-auto w-full min-w-0 sm:max-w-lg lg:mx-0 lg:max-w-none">
              <HeroMockup />
            </div>
          </div>
        </section>
      </div>

      <main>
        <section className="relative border-t border-slate-200/80 bg-white/70 py-12 backdrop-blur-sm sm:py-16 md:py-20">
          <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />
          <div className="pointer-events-none absolute inset-0 top-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_0%,rgba(178,235,242,0.5),transparent_58%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_100%_100%,rgba(196,181,253,0.2),transparent_50%)]" />
          <div className={pageGutter}>
            <div className="mx-auto max-w-4xl text-center lg:max-w-5xl">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-teal-800/90 min-[400px]:text-sm min-[400px]:tracking-[0.22em]">
                Inside the workspace
              </h2>
              <p className="mt-3 erp-brand-text text-2xl font-extrabold tracking-tight min-[400px]:text-3xl sm:mt-4 sm:text-4xl">
                Everything your project needs, in sync
              </p>
            </div>
            <ul className="mt-10 grid grid-cols-1 gap-4 min-[500px]:grid-cols-2 min-[500px]:gap-5 lg:mt-12 xl:grid-cols-3 xl:gap-6">
              {features.map((f) => (
                <li
                  key={f.title}
                  className={`group relative overflow-hidden rounded-2xl p-6 shadow-sm ring-1 transition duration-300 min-[500px]:rounded-3xl min-[500px]:p-7 hover:-translate-y-1 hover:shadow-lg sm:p-7 ${f.cardClass}`}
                >
                  <div
                    className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-br from-cyan-200/25 to-violet-200/20 opacity-40 blur-2xl transition group-hover:opacity-80"
                    aria-hidden
                  />
                  <div
                    className={`relative mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border shadow-sm transition group-hover:scale-105 min-[500px]:mb-5 min-[500px]:h-14 min-[500px]:w-14 min-[500px]:rounded-2xl ${f.iconClass}`}
                  >
                    {f.icon}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 min-[500px]:text-xl">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 min-[500px]:mt-2.5 min-[500px]:text-[15px]">
                    {f.desc}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={`py-12 sm:py-16 md:py-20 ${pageGutter}`}>
          <div className="relative overflow-hidden rounded-2xl border-2 border-cyan-200/50 bg-gradient-to-br from-white via-cyan-50/50 to-[#E0F7FA]/40 p-6 text-center shadow-[0_20px_50px_-20px_rgba(16,61,77,0.15),0_0_0_1px_rgba(178,235,242,0.4)] min-[500px]:rounded-3xl sm:p-10 md:p-14">
            <div
              className="pointer-events-none absolute -left-16 top-0 h-52 w-52 rounded-full bg-cyan-200/35 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-20 -right-10 h-52 w-52 rounded-full bg-violet-200/25 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute top-1/2 left-1/2 h-32 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-100/30 blur-2xl"
              aria-hidden
            />
            <div className="relative px-0 sm:px-2">
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900 min-[400px]:text-2xl sm:text-3xl">Ready to jump in?</h2>
              <p className="mx-auto mt-3 max-w-2xl text-pretty text-sm text-slate-600 min-[400px]:text-base">
                Sign in with the email that&rsquo;s on your project. Need access? Your Digitalis contact can add you.
              </p>
              <div className="mt-8 flex w-full max-w-sm flex-col items-stretch justify-center gap-3 min-[400px]:mx-auto sm:mt-10 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-5">
                <Link
                  href="/erp/login"
                  className="btn-logo-gradient inline-flex min-h-[48px] w-full min-w-0 items-center justify-center rounded-2xl px-6 text-base font-bold min-[400px]:min-w-[200px] sm:w-auto"
                >
                  Open sign in
                </Link>
                {desktopWindowsUrl ? (
                  <a
                    href={desktopWindowsUrl}
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border-2 border-[#103D4D]/35 bg-white/95 px-6 text-base font-bold text-[#103D4D] shadow-sm hover:border-[#103D4D]/55 hover:bg-white min-[400px]:min-w-[200px] sm:w-auto"
                  >
                    Windows (.exe)
                  </a>
                ) : null}
                {desktopMacUrl ? (
                  <a
                    href={desktopMacUrl}
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border-2 border-[#103D4D]/35 bg-white/95 px-6 text-base font-bold text-[#103D4D] shadow-sm hover:border-[#103D4D]/55 hover:bg-white min-[400px]:min-w-[200px] sm:w-auto"
                  >
                    Mac (.dmg)
                  </a>
                ) : null}
                <Link
                  href="https://www.digitalisglobal.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[48px] py-3 text-sm font-semibold text-[#589CD5] underline decoration-[#589CD5]/40 underline-offset-4 transition hover:text-[#3d7fb8] sm:min-h-0 sm:py-0"
                >
                  Visit Digitalis Global →
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer
        className={`border-t border-slate-200/80 bg-white/90 py-8 backdrop-blur-sm sm:py-10 ${pageGutter}`}
      >
        <div className="text-center text-sm text-slate-500">
          <p className="font-medium text-slate-600">© {new Date().getFullYear()} Digitalis Global · Workspace</p>
          <p className="mt-1.5 max-w-2xl text-pretty text-xs text-slate-500 sm:mx-auto">
            Encrypted sign-in · Your data stays in your org&rsquo;s project space
          </p>
        </div>
      </footer>
    </div>
  );
}
