'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { erpWorkspaceDisplayName, erpWorkspaceSubtitle } from '../../lib/erp-roles';
import ErpBodyPortal from './ErpBodyPortal';
import { ErpAvatarWithOnline } from './ErpOnlineIndicator';
import ErpUserAvatar from './ErpUserAvatar';

function IconAccount({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 5.25a3 3 0 11-6 0 3 3 0 016 0zM4.5 19.125a7.125 7.125 0 0114.25 0"
      />
    </svg>
  );
}

/**
 * Account menu: avatar opens dropdown; Account settings only when that item is chosen.
 * @param {'icon' | 'compact' | 'mobileHeader'} [layout]
 */
export default function ErpUserMenuPopover({
  profile,
  email,
  open,
  onOpenChange,
  onSignOut,
  layout = 'icon',
  accountActive = false,
}) {
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();
  const isCompact = layout === 'compact';
  const isMobileHeader = layout === 'mobileHeader';
  const panelWidth = 184;
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });

  const updatePanelPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = isCompact || isMobileHeader
      ? Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8))
      : Math.max(8, rect.right - panelWidth);
    setPanelPos({ top: rect.bottom + 6, left });
  }, [isCompact, isMobileHeader]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPos();
    window.addEventListener('resize', updatePanelPos);
    window.addEventListener('scroll', updatePanelPos, true);
    return () => {
      window.removeEventListener('resize', updatePanelPos);
      window.removeEventListener('scroll', updatePanelPos, true);
    };
  }, [open, updatePanelPos]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  const menuPanel = open ? (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-label="Account actions"
      style={{ top: panelPos.top, left: panelPos.left, width: panelWidth }}
      className={`fixed overflow-hidden rounded-xl border border-cyan-200/60 bg-white/95 p-1.5 shadow-[0_16px_40px_-10px_rgba(16,61,77,0.22)] backdrop-blur-xl dark:border-teal-900/55 dark:bg-[#0a121a] dark:shadow-black/50 dark:[background-image:none] ${
        isMobileHeader ? 'z-[210]' : 'z-[120]'
      }`}
    >
      <Link
        href="/erp/account"
        onClick={() => onOpenChange(false)}
        className="flex w-full items-center gap-2 rounded-lg border border-cyan-200/70 bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-[#103D4D] shadow-sm hover:border-cyan-300 hover:bg-cyan-50/80 dark:border-teal-900/45 dark:bg-[#101820] dark:text-slate-200 dark:hover:border-teal-800/55 dark:hover:bg-[#141d28]"
      >
        <IconAccount className="h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-300/85" />
        Account settings
      </Link>
      <button
        type="button"
        onClick={() => {
          onOpenChange(false);
          void onSignOut();
        }}
        className="mt-1 flex w-full items-center gap-2 rounded-lg border border-rose-200/70 bg-white/90 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:border-rose-300 hover:bg-rose-50/80 hover:text-rose-800 dark:border-rose-900/40 dark:bg-[#101820] dark:text-rose-300/90 dark:hover:border-rose-800/50 dark:hover:bg-rose-950/25 dark:hover:text-rose-200"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0 text-red-500 dark:text-rose-400" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
          />
        </svg>
        Sign out
      </button>
      <Link
        href="/"
        onClick={() => onOpenChange(false)}
        className="mt-1 flex w-full items-center gap-2 rounded-lg border border-teal-200/80 bg-gradient-to-r from-teal-50/90 to-white px-2.5 py-1.5 text-[11px] font-medium text-[#103D4D] shadow-sm hover:border-teal-300 hover:bg-teal-50/80 dark:border-teal-900/45 dark:bg-[#101820] dark:text-teal-200/90 dark:hover:border-teal-800/55 dark:hover:bg-[#141d28] dark:[background-image:none]"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-300/85" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
          />
        </svg>
        Main site
      </Link>
    </div>
  ) : null;

  const chevron = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 shrink-0 opacity-50" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );

  const avatarNode = (
    <ErpAvatarWithOnline
      presenceUserId={profile?.id}
      lastActiveAt={profile?.last_active_at}
      size="sm"
    >
      <ErpUserAvatar
        profile={profile}
        email={email}
        size={isMobileHeader ? 'lg' : 'sm'}
        className={
          isMobileHeader
            ? '!h-11 !w-11 shrink-0 !text-sm !ring-0 !shadow-none'
            : '!h-8 !w-8 shrink-0 !text-[10px] !ring-0 !shadow-none'
        }
        imgClassName="!ring-0"
        alt=""
      />
    </ErpAvatarWithOnline>
  );

  return (
    <div
      className={`relative shrink-0 ${isCompact || isMobileHeader ? 'min-w-0 max-w-full flex-1' : ''}`}
      ref={wrapRef}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        className={
          isMobileHeader
            ? 'flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-90'
            : isCompact
              ? `flex min-w-0 max-w-full items-center gap-2 rounded-xl border px-2 py-1.5 text-left shadow-sm transition active:scale-[0.99] ${
                  accountActive || open
                    ? 'border-cyan-300/70 bg-gradient-to-br from-cyan-50/90 via-white to-violet-50/40 text-[#103D4D] shadow-cyan-900/10 dark:border-teal-700/55 dark:bg-[#0d141c] dark:text-cyan-100 dark:shadow-black/30 dark:[background-image:none]'
                    : 'border-cyan-200/40 bg-gradient-to-br from-white via-cyan-50/40 to-violet-50/30 text-slate-800 hover:border-cyan-300/60 hover:shadow-md dark:border-teal-800/40 dark:bg-[#0a0f14] dark:text-white dark:hover:border-teal-700/50 dark:[background-image:none]'
                }`
              : 'relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-cyan-200/80 bg-white shadow-md shadow-cyan-900/10 ring-2 ring-white transition hover:border-cyan-300 hover:shadow-lg dark:border-slate-600 dark:bg-slate-800 dark:ring-slate-900 dark:shadow-black/30 dark:hover:border-slate-500'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        aria-label={isCompact || isMobileHeader ? 'Open profile menu' : 'Open account menu'}
      >
        {isMobileHeader ? (
          <>
            {avatarNode}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 truncate text-[15px] font-bold text-slate-900 dark:text-white">
                {erpWorkspaceDisplayName(profile, email)}
                {chevron}
              </span>
              <span className="block truncate text-[12px] font-medium text-slate-500 dark:text-slate-400">
                {erpWorkspaceSubtitle(profile)}
              </span>
            </span>
          </>
        ) : isCompact ? (
          <>
            {avatarNode}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold leading-tight text-[#103D4D] dark:text-white">
                {erpWorkspaceDisplayName(profile, email)}
              </span>
              <span className="block truncate text-[10px] font-medium capitalize leading-tight text-teal-800/65 dark:text-teal-200/80">
                {erpWorkspaceSubtitle(profile)}
              </span>
            </span>
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
                open
                  ? 'border-teal-700/55 bg-[#101820] text-cyan-200 dark:border-teal-600/60 dark:bg-[#141d28]'
                  : 'border-cyan-200/70 bg-white/90 text-teal-700 dark:border-teal-800/55 dark:bg-[#101820] dark:text-teal-300/85'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.25}
                className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </span>
          </>
        ) : (
          <ErpUserAvatar
            profile={profile}
            email={email}
            size="sm"
            className="!h-10 !w-10 !ring-0 !shadow-none"
            imgClassName="!ring-0 !shadow-none"
            alt=""
          />
        )}
      </button>

      {menuPanel ? <ErpBodyPortal>{menuPanel}</ErpBodyPortal> : null}
    </div>
  );
}
