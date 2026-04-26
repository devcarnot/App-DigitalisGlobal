'use client';

import Link from 'next/link';
import { useState } from 'react';

const features = [
  {
    title: 'Projects & delivery',
    desc: 'Track milestones, files, and updates in one shared space—built for how your team already works with Digitalis.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 4.5v2.25c0 .414.164.78.44 1.06l2.12 2.12m0 0l6.19 6.19m-6.19-6.19L6.5 8.25m0 0L8.12 6.12m-1.62 1.63L3 3" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75" />
      </svg>
    ),
  },
  {
    title: 'Messages & context',
    desc: 'Project chat and DMs so feedback stays where the work is—less email drift, faster alignment.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 1.268-.63 2.39-1.593 3.068a3.75 3.75 0 11-7.5 0 4.167 4.167 0 00-1.5 2.5H9.75c-.38 0-.75-.21-.93-.55a3.6 3.6 0 00-.1-.2 4.2 4.2 0 00-1.1-1.3 4.75 4.75 0 00-1.2-.9 4.8 4.8 0 00-1.6-.5 4.8 4.8 0 00-1.7.1 4.8 4.8 0 00-1.5.4 3.6 3.6 0 00-1.1.6 3.6 3.6 0 00-.9.8 3.6 3.6 0 00-.5 1" />
      </svg>
    ),
  },
  {
    title: 'Your team, your access',
    desc: 'Invites and roles keep clients and staff in the right rooms—nothing more, nothing less.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
];

function LogoMark() {
  const [useImg, setUseImg] = useState(true);

  return (
    <div className="flex items-center gap-2.5">
      {useImg ? (
        <img
          src="/Digitalis_logo_black.png"
          alt="Digitalis Global"
          className="h-9 w-auto max-w-[160px] object-contain object-left"
          onError={() => setUseImg(false)}
        />
      ) : (
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-extrabold tracking-tight text-[#103D4D]">Digitalis</span>
          <span className="text-sm font-medium text-slate-500">Global</span>
        </div>
      )}
      <span className="hidden sm:inline-block rounded-full border border-[#103D4D]/20 bg-[#103D4D]/[0.06] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#103D4D]">
        Workspace
      </span>
    </div>
  );
}

export default function DigitalisErpLanding() {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[min(60vh,520px)] w-[min(120vw,900px)] -translate-x-1/2 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(16,61,77,0.12),transparent_70%)]" />
        <div className="absolute right-0 top-1/3 h-72 w-72 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-[#103D4D]/5 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23103D4D' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 rounded">
            <LogoMark />
          </Link>
          <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              href="https://www.digitalisglobal.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-sm font-medium text-slate-600 transition hover:text-[#103D4D] sm:inline"
            >
              digitalisglobal.com
            </Link>
            <Link
              href="/erp/accept-invite"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-[#103D4D]"
            >
              I have an invite
            </Link>
            <Link
              href="/erp/login"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#0ea5e9] to-[#0284c7] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-500/25 transition hover:from-[#0284c7] hover:to-[#0369a1] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-5 pt-16 pb-12 sm:px-8 sm:pt-20 sm:pb-16">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#103D4D]/15 bg-white/90 px-3 py-1 text-xs font-medium text-[#103D4D] shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]" aria-hidden />
            Secure client & team portal
          </p>
          <h1 className="max-w-3xl font-sans text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.08]">
            One place for the work we ship{' '}
            <span className="bg-gradient-to-r from-[#103D4D] to-sky-600 bg-clip-text text-transparent">together</span>
            <span className="text-slate-400">.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl">
            The Digitalis workspace is where your projects, tasks, and conversations live—so you
            always know what&rsquo;s in motion without chasing threads across inboxes.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/erp/login"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#103D4D] px-8 text-base font-semibold text-white shadow-lg shadow-[#103D4D]/25 transition hover:bg-[#0c3242] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#103D4D]"
            >
              Sign in to workspace
            </Link>
            <Link
              href="/erp/accept-invite"
              className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white px-8 text-base font-semibold text-slate-800 transition hover:border-sky-300 hover:bg-sky-50/80"
            >
              Accept an invitation
            </Link>
          </div>
          <p className="mt-6 text-sm text-slate-500">
            New here? You&rsquo;ll get an email invite from your Digitalis contact before you can sign in.
          </p>
        </section>

        <section className="border-y border-slate-200/80 bg-white/60 py-14 backdrop-blur-sm sm:py-16">
          <div className="mx-auto max-w-5xl px-5 sm:px-8">
            <h2 className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              What you&rsquo;ll find inside
            </h2>
            <ul className="mt-10 grid gap-6 sm:grid-cols-3">
              {features.map((f) => (
                <li
                  key={f.title}
                  className="group rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 p-6 shadow-sm transition hover:border-sky-200 hover:shadow-md"
                >
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100 transition group-hover:bg-sky-100/80">
                    {f.icon}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.desc}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-[#103D4D] via-[#0d3545] to-[#0a2834] p-8 text-center text-white shadow-xl shadow-[#103D4D]/20 sm:p-12">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ready to jump in?</h2>
            <p className="mx-auto mt-3 max-w-lg text-sky-100/90">
              Use the link we sent you, or sign in with the email that&rsquo;s on your project.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link
                href="/erp/login"
                className="inline-flex h-12 min-w-[200px] items-center justify-center rounded-xl bg-white px-8 text-base font-bold text-[#103D4D] shadow-md transition hover:bg-sky-50"
              >
                Open sign in
              </Link>
              <Link
                href="https://www.digitalisglobal.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-sky-200/90 underline-offset-4 hover:text-white hover:underline"
              >
                Visit Digitalis Global →
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white/80 py-8 text-center text-sm text-slate-500 backdrop-blur-sm">
        <p>
          © {new Date().getFullYear()} Digitalis Global · Workspace
        </p>
        <p className="mt-1 text-xs text-slate-400">Encrypted sign-in · Your data stays in your org&rsquo;s project space</p>
      </footer>
    </div>
  );
}
