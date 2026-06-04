'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState, useRef, useId } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import {
  erpWorkspaceDisplayName,
  erpWorkspaceSubtitle,
  isErpPrimaryClientRole,
} from '../../lib/erp-roles';
import { ERP_NAV_BLUEPRINT, erpNavFilterSections, erpNavFlattenItems } from '../../lib/erp-nav-rbac';
import { useErpSession } from './useErpSession';
import { ErpAvatarWithOnline } from './ErpOnlineIndicator';
import ErpUserAvatar from './ErpUserAvatar';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { getPublicSiteOriginForBrowser } from '../../lib/public-site-url';
import { ErpBreadcrumbProvider } from './ErpBreadcrumbContext';
import ErpBreadcrumbs from './ErpBreadcrumbs';
import ErpColorSchemeToggle from './ErpColorSchemeToggle';
import ErpNotificationsPopover from './ErpNotificationsPopover';
import ErpNotificationsMobileSheet from './ErpNotificationsMobileSheet';
import { ErpShellNotificationsProvider } from './ErpShellNotificationsContext';
import ErpUserMenuPopover from './ErpUserMenuPopover';
import ErpBodyPortal from './ErpBodyPortal';
import { ErpPresenceProvider } from './ErpPresenceContext';
import ErpRealtimeWorkspaceBridge from './ErpRealtimeWorkspaceBridge';
import {
  isErpMessagingNotification,
  isErpIncomingCallNotification,
  isErpCallSignalNotification,
  ERP_CALL_MISSED_PREFIX,
  ERP_CALL_MISSED_GROUP_PREFIX,
} from '../../lib/erp-activity-feed';
import { isLeaveWorkspaceNotification } from '../../lib/erp-notification-leave';
import {
  navigateToErpNotification,
  normalizeErpNotificationHref,
  resolveErpNotificationNavigationHref,
} from '../../lib/erp-notification-link';
import { useErpLeaveNotificationModal } from '../../hooks/useErpLeaveNotificationModal';
import {
  ensureDesktopNotificationPermission,
  notifyDesktop,
} from '../../lib/erp-desktop-notifier';
import {
  loadMobileQuickActionHrefs,
  MOBILE_BOTTOM_BAR_HREFS,
  MOBILE_QUICK_ACTIONS_DEFAULT,
  saveMobileQuickActionHrefs,
  sanitizeMobileQuickActionHrefs,
} from '../../lib/erp-mobile-quick-actions';
import { ERP_VOICE_ASSISTANT_ENABLED } from '../../lib/erp-voice/erp-voice-config';

const ErpFloatingProjectTimer = dynamic(() => import('./ErpFloatingProjectTimer'), { ssr: false });
const ErpVoiceAssistant = dynamic(() => import('./ErpVoiceAssistant'), { ssr: false });
const ErpGlobalSearch = dynamic(() => import('./ErpGlobalSearch'), { ssr: false, loading: () => null });
const ErpMobileNavSheet = dynamic(() => import('./ErpMobileNavSheet'), { ssr: false, loading: () => null });
const ErpMobileMenuDrawer = dynamic(() => import('./ErpMobileMenuDrawer'), { ssr: false, loading: () => null });
const ErpMobileQuickActionsEditor = dynamic(() => import('./ErpMobileQuickActionsEditor'), {
  ssr: false,
  loading: () => null,
});

const SIDEBAR_COLLAPSED_KEY = 'erp_sidebar_collapsed';

function useMinLgViewport() {
  const [minLg, setMinLg] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setMinLg(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return minLg;
}

function tryPlayNotifBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 660;
    g.gain.value = 0.035;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.12);
    setTimeout(() => {
      try {
        ctx.close();
      } catch {}
    }, 250);
    return true;
  } catch {
    return false;
  }
}

/**
 * Two-tone "ring-ring" using the WebAudio oscillator. Returns a stop() handle.
 * Plays a 1.2s pattern every 3s until stop() is called.
 */
function startRingTone() {
  let ctx = null;
  let timer = null;
  let stopped = false;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return () => {};
    ctx = new AudioCtx();
    const playPair = () => {
      if (stopped || !ctx) return;
      const t0 = ctx.currentTime;
      [0, 0.6].forEach((offset) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 480;
        g.gain.setValueAtTime(0, t0 + offset);
        g.gain.linearRampToValueAtTime(0.06, t0 + offset + 0.04);
        g.gain.linearRampToValueAtTime(0, t0 + offset + 0.4);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t0 + offset);
        o.stop(t0 + offset + 0.42);
      });
    };
    playPair();
    timer = window.setInterval(playPair, 3000);
  } catch {
    /* ignore */
  }
  return () => {
    stopped = true;
    if (timer) {
      try {
        window.clearInterval(timer);
      } catch {}
      timer = null;
    }
    if (ctx) {
      try {
        ctx.close();
      } catch {}
      ctx = null;
    }
  };
}

function IconMenuGrid({ className = 'h-6 w-6' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM13.5 6A2.25 2.25 0 0115.75 3.75H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z"
      />
    </svg>
  );
}

/** House icon for mobile bottom nav “Home”. */
function IconHome({ className = 'h-6 w-6' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125h4.125a1.125 1.125 0 001.125-1.125v-4.875a1.125 1.125 0 011.125-1.125h3a1.125 1.125 0 011.125 1.125v4.875c0 .621.504 1.125 1.125 1.125h4.125a1.125 1.125 0 001.125-1.125V9.75"
      />
    </svg>
  );
}

/** Stacked “boards” / portfolio — distinct from the four-square grid used elsewhere. */
function IconProjects({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.5 6.75a.75.75 0 01.75-.75h13.5a.75.75 0 01.75.75v3.75a.75.75 0 01-.75.75H5.25a.75.75 0 01-.75-.75V6.75zm0 7.5a.75.75 0 01.75-.75h9a.75.75 0 01.75.75v3.75a.75.75 0 01-.75.75h-9a.75.75 0 01-.75-.75v-3.75zm12.75-2.25a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v6a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75v-6z"
      />
    </svg>
  );
}
function IconFolder({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  );
}

function IconInbox({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 13.5h3m-3 0v4.125A2.625 2.625 0 004.875 20.25h14.25a2.625 2.625 0 002.625-2.625V13.5m-18.75 0h18.75m-19.5-3.75v-.375A2.625 2.625 0 015.25 6.75h13.5a2.625 2.625 0 012.625 2.625v.375m-19.5 0h19.5M9.75 6.75v-.375A2.625 2.625 0 0112.375 3.75h.75a2.625 2.625 0 012.625 2.625V6.75m-6 0h6"
      />
    </svg>
  );
}

function IconMessages({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 00.447-.894V6.741c0-.852-.654-1.547-1.467-1.547H5.25c-.813 0-1.467.695-1.467 1.547v7.5z"
      />
    </svg>
  );
}

function IconChart({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function IconFinance({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 18.75a60.07 60.07 0 0115.797 2.547c.79.167 1.65-.006 2.28-.53l2.1-1.68a2.25 2.25 0 001.002-3.84L16.5 15a2.25 2.25 0 00-2.122 0l-.002.002-.002-.002A60.07 60.07 0 0112 12c-.714 0-1.42.055-2.115.16M7.5 15.75c-.712 0-1.35-.158-1.845-.43-.494-.27-.855-.647-1.086-1.086-.224-.43-.319-.92-.319-1.484V9a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 9v3.744c0 .564-.095 1.054-.319 1.485-.231.439-.592.816-1.086 1.086-.495.272-1.133.43-1.845.43M7.5 15.75c.564 0 1.054.095 1.485.319.439.231.816.592 1.086 1.086M7.5 15.75V18a2.25 2.25 0 002.25 2.25h9A2.25 2.25 0 0019.5 18v-2.25m-12 0h.008v.008H7.5v-.008z"
      />
    </svg>
  );
}

function IconCalendar({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5a2.25 2.25 0 012.25 2.25v7.5"
      />
    </svg>
  );
}

function IconLeave({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
      />
    </svg>
  );
}

/** Sticky note with a folded corner — used for the Notes Kanban board. */
function IconNotes({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-7.5A2.25 2.25 0 0017.25 4.5H6.75A2.25 2.25 0 004.5 6.75v10.5A2.25 2.25 0 006.75 19.5h7.5"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25l-5.25 5.25v-3a2.25 2.25 0 012.25-2.25h3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 8.25h7.5M8.25 11.25h7.5M8.25 14.25h3" />
    </svg>
  );
}

/** Monitor + signal — remote / WFH (distinct from leave clipboard). */
function IconRemote({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 13.5h8.25m-8.25 0V19.5A2.25 2.25 0 004.5 21h15a2.25 2.25 0 002.25-2.25V13.5m-19.5 0V4.875A2.625 2.625 0 015.25 2.25h13.5a2.625 2.625 0 012.625 2.625V13.5m-19.5 0h19.5M8.25 21H15"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.25 8.25v6m3-3h-6"
      />
    </svg>
  );
}

function IconPerformance({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 00-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 00-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  );
}

function IconUsers({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />
    </svg>
  );
}

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

function IconClients({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm4.5 3.75a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
      />
    </svg>
  );
}

function IconFiles({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 6.75A2.25 2.25 0 0018 4.5H9.621a2.25 2.25 0 00-1.591.659L5.25 7.939A2.25 2.25 0 003.75 9.53V18A2.25 2.25 0 006 20.25h12A2.25 2.25 0 0020.25 18V6.75z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 14.25h7.5M8.25 16.5h7.5" />
    </svg>
  );
}

function IconTrash({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}

function IconSettings({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconMegaphone({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.34 15.84l-3.66 3.66a1.125 1.125 0 01-1.591-1.591l3.66-3.66m2.34-2.34l3.66-3.66a1.125 1.125 0 011.591 1.591l-3.66 3.66M6.75 19.5H9a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 009 4.5H6.75A2.25 2.25 0 004.5 6.75v10.5A2.25 2.25 0 006.75 19.5z"
      />
    </svg>
  );
}

const ERP_NAV_ICON_MAP = {
  home: IconHome,
  projects: IconProjects,
  folder: IconFolder,
  notes: IconNotes,
  files: IconFiles,
  messages: IconMessages,
  clients: IconClients,
  users: IconUsers,
  calendar: IconCalendar,
  leave: IconLeave,
  remote: IconRemote,
  performance: IconPerformance,
  chart: IconChart,
  finance: IconFinance,
  inbox: IconInbox,
  megaphone: IconMegaphone,
  trash: IconTrash,
  settings: IconSettings,
};

/** Single active item: longest matching href wins (avoids two highlights when paths share a prefix). */
function getActiveNavHref(pathname, items) {
  if (!pathname || !items?.length) return null;
  let best = null;
  let bestLen = -1;
  for (const item of items) {
    const h = item.href;
    if (!h) continue;
    const exact = pathname === h;
    const child = pathname.startsWith(`${h}/`);
    if (exact || child) {
      if (h.length > bestLen) {
        bestLen = h.length;
        best = h;
      }
    }
  }
  return best;
}

/** Active tab for the mobile bottom bar (longest-prefix match per destination). */
function isMobileBottomNavActive(pathname, href) {
  const p = pathname || '';
  if (href === '/erp/dashboard') return p === '/erp/dashboard' || p.startsWith('/erp/dashboard/');
  if (href === '/erp/projects') return p === '/erp/projects' || p.startsWith('/erp/projects/');
  if (href === '/erp/messages') return p === '/erp/messages' || p.startsWith('/erp/messages/');
  if (href === '/erp/account') return p === '/erp/account' || p.startsWith('/erp/account/');
  return false;
}

/** Split unread counts by destination: Projects vs Messages vs Recent Activity. */
function splitNotificationUnreadForNav(notifications) {
  let inboxUnread = 0;
  let messagesUnread = 0;
  let projectsUnread = 0;
  for (const n of notifications || []) {
    if (n.read) continue;
    const link = typeof n.link === 'string' ? n.link : '';
    if (link.includes('/erp/messages')) {
      messagesUnread += 1;
      continue;
    }
    if (link.includes('/erp/projects/') && link.includes('channel=')) {
      projectsUnread += 1;
      continue;
    }
    inboxUnread += 1;
  }
  return { inboxUnread, messagesUnread, projectsUnread };
}

export default function ErpShell({ children }) {
  const pathname = usePathname();
  const isProjectsListPage = pathname === '/erp/projects';
  const searchParams = useSearchParams();
  const router = useRouter();
  const isLgViewport = useMinLgViewport();
  const { profile, session, refreshProfile, erpCan } = useErpSession();
  const { leaveModalEl, openLeaveFromNotificationRow } = useErpLeaveNotificationModal({
    viewerRole: profile?.role,
    userId: session?.user?.id,
  });
  const soundUnlockedRef = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const wasOnTeamAdminRef = useRef(false);
  /** Main workspace column scroll (not window) — persist across app switches / bfcache. */
  const mainScrollRef = useRef(null);
  const sidebarNavScrollRef = useRef(null);
  const pathnameForScrollRef = useRef(typeof pathname === 'string' ? pathname : '');
  /** Live pathname accessible from long-lived callbacks (e.g. realtime notification
   *  channel) without forcing them to re-subscribe on every navigation. */
  const pathnameRef = useRef(typeof pathname === 'string' ? pathname : '');
  useEffect(() => {
    pathnameRef.current = typeof pathname === 'string' ? pathname : '';
  }, [pathname]);
  /** Same pattern for the notify_sound preference — the realtime notification
   *  channel needs the latest value on every event but must not resubscribe
   *  when the user toggles the setting. */
  const notifySoundRef = useRef(profile?.notify_sound !== false);
  useEffect(() => {
    notifySoundRef.current = profile?.notify_sound !== false;
  }, [profile?.notify_sound]);

  useEffect(() => {
    const p = typeof pathname === 'string' ? pathname : '';
    const onTeamAdminPage =
      p.startsWith('/erp/admin/members') ||
      p.startsWith('/erp/admin/invites') ||
      p.startsWith('/erp/admin/users');
    if (wasOnTeamAdminRef.current && !onTeamAdminPage) {
      refreshProfile?.();
    }
    wasOnTeamAdminRef.current = onTeamAdminPage;
  }, [pathname, refreshProfile]);

  useEffect(() => {
    const p = typeof pathname === 'string' ? pathname : '';
    const prev = pathnameForScrollRef.current;
    pathnameForScrollRef.current = p;
    const el = mainScrollRef.current;
    if (prev && prev !== p && el) {
      try {
        sessionStorage.setItem(`erp:mainScroll:${prev}`, String(el.scrollTop));
      } catch {
        /* ignore */
      }
    }
    requestAnimationFrame(() => {
      const node = mainScrollRef.current;
      if (!node) return;
      try {
        const y = sessionStorage.getItem(`erp:mainScroll:${p}`);
        if (y != null) {
          const n = parseInt(y, 10);
          if (!Number.isNaN(n)) node.scrollTop = n;
        }
      } catch {
        /* ignore */
      }
    });
  }, [pathname]);

  useEffect(() => {
    const save = () => {
      if (document.visibilityState !== 'hidden') return;
      const el = mainScrollRef.current;
      const p = pathnameForScrollRef.current;
      if (!el || !p) return;
      try {
        sessionStorage.setItem(`erp:mainScroll:${p}`, String(el.scrollTop));
      } catch {
        /* ignore */
      }
    };
    document.addEventListener('visibilitychange', save);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('visibilitychange', save);
      window.removeEventListener('pagehide', save);
    };
  }, []);

  useEffect(() => {
    const onShow = (e) => {
      if (!e.persisted) return;
      const el = mainScrollRef.current;
      const p = pathnameForScrollRef.current;
      if (!el || !p) return;
      try {
        const y = sessionStorage.getItem(`erp:mainScroll:${p}`);
        if (y != null) {
          const n = parseInt(y, 10);
          if (!Number.isNaN(n)) el.scrollTop = n;
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      soundUnlockedRef.current = true;
      // Same gesture also unlocks the native notification surface: browsers
      // gate `Notification.requestPermission()` behind a user activation, so
      // the very first click / keypress after sign-in is our window to ask.
      // Inside the Electron shell this resolves to "granted" instantly via
      // the permission handler in `desktop/main.js`; in browsers the user
      // sees the standard permission prompt once.
      try {
        void ensureDesktopNotificationPermission();
      } catch {
        /* ignore — best-effort */
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  const filteredNavSections = useMemo(
    () => erpNavFilterSections(ERP_NAV_BLUEPRINT, (mod) => erpCan(mod, 'view')),
    [erpCan],
  );

  const filteredNavFlat = useMemo(() => erpNavFlattenItems(filteredNavSections), [filteredNavSections]);

  const navLabelForRole = useCallback(
    (item) => {
      if (item?.href === '/erp/my-tasks' && isErpPrimaryClientRole(profile?.role)) return 'Task';
      return item?.label || '';
    },
    [profile?.role],
  );

  const activeNavHref = useMemo(() => getActiveNavHref(pathname, filteredNavFlat), [pathname, filteredNavFlat]);

  const mobileNavSections = useMemo(
    () =>
      filteredNavSections.map((sec) => ({
        ...sec,
        items: sec.items.map((item) => ({
          ...item,
          label: navLabelForRole(item),
        })),
      })),
    [filteredNavSections, navLabelForRole],
  );

  const homeActive = isMobileBottomNavActive(pathname, '/erp/dashboard');
  const messagesActive = isMobileBottomNavActive(pathname, '/erp/messages');
  const projectsActive = isMobileBottomNavActive(pathname, '/erp/projects');
  const profileActive = isMobileBottomNavActive(pathname, '/erp/account');
  const canViewMessages = erpCan('messages', 'view');
  const canViewProjects = erpCan('projects', 'view');

  const mobileNavAllowedHrefs = useMemo(
    () => new Set(filteredNavFlat.map((item) => item.href)),
    [filteredNavFlat],
  );

  const [mobileQuickHrefs, setMobileQuickHrefs] = useState(MOBILE_QUICK_ACTIONS_DEFAULT);
  const [mobileQuickEditOpen, setMobileQuickEditOpen] = useState(false);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    setMobileQuickHrefs(loadMobileQuickActionHrefs(uid, mobileNavAllowedHrefs));
  }, [session?.user?.id, mobileNavAllowedHrefs]);

  const mobileQuickFanItems = useMemo(() => {
    const byHref = new Map();
    for (const sec of mobileNavSections) {
      for (const item of sec.items) {
        byHref.set(item.href, item);
      }
    }
    return mobileQuickHrefs.map((href) => byHref.get(href)).filter(Boolean);
  }, [mobileNavSections, mobileQuickHrefs]);

  const quickNavActive = mobileQuickHrefs.some((href) => isMobileBottomNavActive(pathname, href));

  const mobileMenuSections = useMemo(() => {
    const skip = new Set([...MOBILE_BOTTOM_BAR_HREFS, ...mobileQuickHrefs]);
    return mobileNavSections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((item) => !skip.has(item.href)),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [mobileNavSections, mobileQuickHrefs]);

  const mobileQuickEditorPool = useMemo(() => {
    const skip = new Set(MOBILE_BOTTOM_BAR_HREFS);
    const out = [];
    const seen = new Set();
    for (const sec of mobileNavSections) {
      for (const item of sec.items) {
        if (skip.has(item.href) || seen.has(item.href)) continue;
        seen.add(item.href);
        out.push(item);
      }
    }
    return out;
  }, [mobileNavSections]);

  /** Mobile: messages routes use a fixed viewport column (inbox, new message, thread). */
  const mobileMessagesPage = useMemo(() => pathname?.startsWith('/erp/messages') ?? false, [pathname]);

  const mobileDashboardPage = pathname === '/erp/dashboard';

  /** Mobile: open DM/group thread → hide shell header & breadcrumbs for full-screen chat */
  const mobileMessagesThread = useMemo(() => {
    if (!mobileMessagesPage) return false;
    const w = searchParams?.get('with');
    const g = searchParams?.get('group');
    return Boolean(w || g);
  }, [mobileMessagesPage, searchParams]);

  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    document.documentElement.setAttribute('data-erp-shell', '');
    return () => document.documentElement.removeAttribute('data-erp-shell');
  }, []);

  /**
   * Stack of toast notifications shown in the bottom-right. Each entry has its own
   * auto-dismiss timer so a burst of notifications doesn't lose any.
   */
  const [toasts, setToasts] = useState([]);
  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const pushToast = useCallback((t) => {
    if (!t || !t.id) return;
    setToasts((prev) => {
      if (prev.some((x) => x.id === t.id)) return prev;
      const next = [...prev, t];
      // Cap visible toasts to 5; oldest non-ephemeral falls off first.
      if (next.length > 5) {
        const idx = next.findIndex((x) => !x.ephemeral);
        if (idx >= 0 && idx < next.length - 5) next.splice(idx, 1);
        else next.splice(0, next.length - 5);
      }
      return next;
    });
  }, []);
  /**
   * Backwards-compat shim: existing call-sites still use `setToast({...})`. Treat any
   * truthy call as "push a new toast", and `setToast(null)` as "dismiss all".
   */
  const setToast = useCallback(
    (value) => {
      if (!value) {
        setToasts([]);
        return;
      }
      pushToast(value);
    },
    [pushToast],
  );

  useEffect(() => {
    const onAppToast = (e) => {
      const d = e.detail;
      if (!d?.id) return;
      pushToast({
        id: d.id,
        title: d.title,
        body: d.body,
        link: d.link || null,
        tone: d.tone || 'info',
        ephemeral: d.ephemeral !== false,
        durationMs: d.durationMs,
      });
    };
    window.addEventListener('erp-app-toast', onAppToast);
    return () => window.removeEventListener('erp-app-toast', onAppToast);
  }, [pushToast]);

  /** Incoming-call ringing banner. `null` when nothing is ringing. */
  const [incomingCall, setIncomingCall] = useState(null);
  const incomingCallStopRef = useRef(null);
  const incomingCallTimeoutRef = useRef(null);
  const [mobileQuickOpen, setMobileQuickOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileOverlayOpen = mobileQuickOpen || mobileMenuOpen || mobileQuickEditOpen;
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const toastSeenRef = useRef(new Set());
  const unreadCount = useMemo(() => (notifications || []).filter((n) => !n.read).length, [notifications]);
  const { inboxUnread, messagesUnread, projectsUnread } = useMemo(
    () => splitNotificationUnreadForNav(notifications),
    [notifications],
  );

  useEffect(() => {
    setMobileQuickOpen(false);
    setMobileMenuOpen(false);
    setMobileQuickEditOpen(false);
    setNotifOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOverlayOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMobileQuickOpen(false);
        setMobileMenuOpen(false);
        setMobileQuickEditOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOverlayOpen]);

  /**
   * Each toast in the stack gets its own auto-dismiss timer keyed on its id, so adding a
   * new toast doesn't reset the timer of the older ones already on screen.
   */
  const toastTimersRef = useRef(new Map());
  useEffect(() => {
    const timers = toastTimersRef.current;
    const liveIds = new Set(toasts.map((t) => t.id));
    for (const [id, handle] of timers) {
      if (!liveIds.has(id)) {
        clearTimeout(handle);
        timers.delete(id);
      }
    }
    for (const t of toasts) {
      if (timers.has(t.id)) continue;
      const ms = t.durationMs ?? (t.ephemeral ? 4500 : 8000);
      const handle = setTimeout(() => {
        timers.delete(t.id);
        dismissToast(t.id);
      }, ms);
      timers.set(t.id, handle);
    }
    return undefined;
  }, [toasts, dismissToast]);

  const reloadNotificationsFromDb = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) {
      setNotifications([]);
      return;
    }
    const { data } = await supabase
      .from('erp_notifications')
      .select('id, title, body, read, link, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(25);
    setNotifications(data || []);
  }, [session?.user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onReload = () => {
      void reloadNotificationsFromDb();
    };
    window.addEventListener('erp-notifications-reload', onReload);
    return () => window.removeEventListener('erp-notifications-reload', onReload);
  }, [reloadNotificationsFromDb]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const loadNotifs = () => reloadNotificationsFromDb();
    void loadNotifs();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void loadNotifs();
    }, 180_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadNotifs();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [session?.user?.id, reloadNotificationsFromDb]);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!notifOpen || !uid) return;

    setNotifications((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));

    let cancelled = false;
    (async () => {
      const { error } = await supabase
        .from('erp_notifications')
        .update({ read: true })
        .eq('user_id', uid)
        .eq('read', false);
      if (cancelled || !error) return;
      const { data } = await supabase
        .from('erp_notifications')
        .select('id, title, body, read, link, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(25);
      if (!cancelled && data) setNotifications(data);
    })();

    return () => {
      cancelled = true;
    };
  }, [notifOpen, session?.user?.id]);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;

    const channel = supabase
      .channel(`erp-notifs-sidebar-${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'erp_notifications',
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          setNotifications((prev) => {
            if (prev.some((n) => n.id === row.id)) return prev;
            const item = {
              id: row.id,
              title: row.title,
              body: row.body,
              read: row.read,
              link: row.link,
              created_at: row.created_at,
            };
            return [item, ...prev].slice(0, 25);
          });

          // Incoming call: hijack into the ringing banner instead of the regular toast.
          if (isErpIncomingCallNotification(row)) {
            if (toastSeenRef.current.has(row.id)) return;
            toastSeenRef.current.add(row.id);
            let callerId = '';
            let groupId = '';
            let audioOnly = false;
            try {
              const parsed = new URL(row.link, getPublicSiteOriginForBrowser());
              callerId = parsed.searchParams.get('with') || '';
              groupId = parsed.searchParams.get('group') || '';
              audioOnly = parsed.searchParams.get('audio') === '1';
            } catch {}
            setIncomingCall({
              id: row.id,
              title: row.title,
              body: row.body,
              link: row.link,
              callerId,
              groupId,
              audioOnly,
              isGroup: Boolean(groupId),
            });
            // OS-level toast for the call so the user notices even when
            // the desktop app is behind the browser / another app. Calls
            // are urgent — keep the toast pinned (`requireInteraction`),
            // force-show even when the window is focused (an incoming
            // call is more important than the in-app ringing banner
            // alone), and reuse one tag so consecutive rings replace.
            notifyDesktop({
              id: row.id,
              title: row.title || 'Incoming call',
              body: row.body || 'Tap to answer',
              link: row.link || '/erp/messages?join=1',
              tag: 'erp-incoming-call',
              requireInteraction: true,
              force: true,
            });
            return;
          }

          // Ephemeral toast for caller-side signals (decline / no-answer). Don't beep, don't
          // persist as a popup beyond a few seconds — the row stays in the dropdown for history.
          if (isErpCallSignalNotification(row)) {
            if (toastSeenRef.current.has(row.id)) return;
            toastSeenRef.current.add(row.id);
            setToast({
              id: row.id,
              title: row.title,
              body: row.body,
              link: row.link || '/erp/messages',
              ephemeral: true,
            });
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('erp-call-signal', {
                  detail: { title: row.title, link: row.link || '' },
                }),
              );
            }
            return;
          }

          // In-app sound (WhatsApp-style) for messaging notifications.
          if (
            typeof window !== 'undefined' &&
            soundUnlockedRef.current &&
            notifySoundRef.current &&
            isErpMessagingNotification(row)
          ) {
            tryPlayNotifBeep();
          }

          if (typeof window !== 'undefined' && pathnameRef.current?.startsWith('/erp/dashboard')) {
            window.dispatchEvent(new CustomEvent('erp-dashboard-reload'));
          }

          if (toastSeenRef.current.has(row.id)) return;
          toastSeenRef.current.add(row.id);
          if (toastSeenRef.current.size > 200) {
            const arr = [...toastSeenRef.current];
            toastSeenRef.current = new Set(arr.slice(-120));
          }

          // Show a toast for every notification — no per-page suppression.
          setToast({
            id: row.id,
            title: row.title,
            body: row.body,
            link: row.link || '/erp/dashboard',
          });

          // Mirror to the OS notification surface when the window isn't
          // focused (desktop app in the background, second monitor, other
          // tab). The notifier itself bails when the user is present, so
          // we just feed it every event and let it decide.
          //
          // We tag messaging events by sender link so consecutive DMs from
          // the same person collapse into a single toast (WhatsApp style)
          // instead of stacking up. Non-messaging notifications get a
          // unique tag per row so unrelated events don't replace each
          // other.
          {
            const link = normalizeErpNotificationHref(row.link, getPublicSiteOriginForBrowser());
            let tag = `erp-notif-${row.id}`;
            if (isErpMessagingNotification(row)) {
              tag = `erp-msg:${link}`;
            }
            notifyDesktop({
              id: row.id,
              title: row.title || 'Digitalis Workspace',
              body: row.body || '',
              link,
              tag,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'erp_notifications',
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const row = payload.new;
          if (!row?.id) return;
          setNotifications((prev) => {
            const idx = prev.findIndex((n) => n.id === row.id);
            if (idx < 0) return prev;
            const next = [...prev];
            const cur = next[idx];
            next[idx] = {
              ...cur,
              read: row.read ?? cur.read,
              title: row.title ?? cur.title,
              body: row.body ?? cur.body,
              link: row.link ?? cur.link,
            };
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // pathname intentionally NOT in deps — we read it via pathnameRef so this
    // realtime channel is set up once per user session and doesn't churn on
    // every navigation. profile?.notify_sound is also read via the fresh
    // closure value on each event (updates within the effect lifetime through
    // React's re-render → the effect won't rebuild for it, but the callback
    // captures the latest setState identities which is sufficient).
  }, [session?.user?.id]);

  /** Mark the original ringing row as read + optionally rewrite its title to "Missed call from X". */
  const finalizeIncomingCallRow = useCallback(
    async (call, { markAsMissed }) => {
      if (!call?.id) return;
      try {
        if (markAsMissed) {
          const isGroup = call.isGroup;
          const original = String(call.title || '');
          let nextTitle = original;
          if (isGroup) {
            nextTitle = original.replace(/^Incoming group call from /, ERP_CALL_MISSED_GROUP_PREFIX);
          } else {
            nextTitle = original.replace(/^Incoming call from /, ERP_CALL_MISSED_PREFIX);
          }
          await supabase
            .from('erp_notifications')
            .update({ title: nextTitle, body: 'You missed this call.', read: false })
            .eq('id', call.id);
        } else {
          await supabase.from('erp_notifications').update({ read: true }).eq('id', call.id);
        }
      } catch {
        /* best-effort */
      }
      try {
        if (typeof window !== 'undefined' && navigator?.serviceWorker?.ready) {
          const reg = await navigator.serviceWorker.ready;
          const open = await reg.getNotifications({ tag: undefined });
          (open || []).forEach((n) => {
            const u = (n.data && n.data.url) || '';
            if (u && call.link && u === call.link) n.close();
          });
        }
      } catch {}
    },
    [],
  );

  /** POST a decline/missed signal back to the caller. Best-effort — never blocks UI. */
  const sendCallSignal = useCallback(async (call, kind) => {
    if (!call?.callerId && !call?.groupId) return;
    try {
      await erpAuthorizedFetch('/api/erp/calls/signal', {
        method: 'POST',
        body: JSON.stringify({
          callerId: call.callerId,
          kind,
          audioOnly: Boolean(call.audioOnly),
          ...(call.groupId ? { groupId: call.groupId } : {}),
        }),
      });
    } catch {
      /* ignore */
    }
  }, []);

  /** Start/stop ringtone + 35s auto-miss whenever incomingCall changes. */
  useEffect(() => {
    if (!incomingCall) {
      if (incomingCallStopRef.current) {
        try {
          incomingCallStopRef.current();
        } catch {}
        incomingCallStopRef.current = null;
      }
      if (incomingCallTimeoutRef.current) {
        try {
          window.clearTimeout(incomingCallTimeoutRef.current);
        } catch {}
        incomingCallTimeoutRef.current = null;
      }
      return undefined;
    }
    if (
      typeof window !== 'undefined' &&
      soundUnlockedRef.current &&
      profile?.notify_sound !== false
    ) {
      incomingCallStopRef.current = startRingTone();
    }
    const callRef = incomingCall;
    incomingCallTimeoutRef.current = window.setTimeout(() => {
      void sendCallSignal(callRef, 'missed');
      void finalizeIncomingCallRow(callRef, { markAsMissed: true });
      setIncomingCall(null);
    }, 35_000);
    return () => {
      if (incomingCallStopRef.current) {
        try {
          incomingCallStopRef.current();
        } catch {}
        incomingCallStopRef.current = null;
      }
      if (incomingCallTimeoutRef.current) {
        try {
          window.clearTimeout(incomingCallTimeoutRef.current);
        } catch {}
        incomingCallTimeoutRef.current = null;
      }
    };
  }, [incomingCall, profile?.notify_sound, sendCallSignal, finalizeIncomingCallRow]);

  const answerIncomingCall = useCallback(() => {
    if (!incomingCall) return;
    const call = incomingCall;
    setIncomingCall(null);
    void finalizeIncomingCallRow(call, { markAsMissed: false });
    navigateToErpNotification(router, { link: call.link || '/erp/messages?join=1' }, getPublicSiteOriginForBrowser());
  }, [incomingCall, router, finalizeIncomingCallRow]);

  const declineIncomingCall = useCallback(() => {
    if (!incomingCall) return;
    const call = incomingCall;
    setIncomingCall(null);
    void sendCallSignal(call, 'decline');
    void finalizeIncomingCallRow(call, { markAsMissed: false });
  }, [incomingCall, sendCallSignal, finalizeIncomingCallRow]);

  /** Service-worker push action routing: when the user clicks Answer/Decline on an OS push. */
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator?.serviceWorker) return undefined;
    function onMsg(e) {
      const msg = e?.data;
      if (!msg || msg.type !== 'erp-notification-click') return;
      if (!msg.url || typeof msg.url !== 'string') return;
      if (msg.action === 'decline') return;
      try {
        router.push(resolveErpNotificationNavigationHref({ link: msg.url }, getPublicSiteOriginForBrowser()));
      } catch {}
    }
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [router]);

  async function handleSignOut() {
    try {
      await erpAuthorizedFetch('/api/erp/session-end', { method: 'POST', body: '{}' });
    } catch {
      /* still sign out locally */
    }
    await supabase.auth.signOut();
    router.replace('/erp/login');
  }

  function closeMobileOverlays() {
    setMobileQuickOpen(false);
    setMobileMenuOpen(false);
    setMobileQuickEditOpen(false);
  }

  const openMobileQuickEditor = useCallback(() => {
    setMobileQuickOpen(false);
    setMobileMenuOpen(false);
    setMobileQuickEditOpen(true);
  }, []);

  const closeMobileQuickEditor = useCallback(() => {
    setMobileQuickEditOpen(false);
  }, []);

  const saveMobileQuickEditor = useCallback(
    (hrefs) => {
      const uid = session?.user?.id;
      const sanitized = sanitizeMobileQuickActionHrefs(hrefs, mobileNavAllowedHrefs);
      setMobileQuickHrefs(sanitized);
      if (uid) saveMobileQuickActionHrefs(uid, sanitized);
      setMobileQuickEditOpen(false);
    },
    [session?.user?.id, mobileNavAllowedHrefs],
  );

  const asideW =
    'w-[min(18rem,88vw)] max-w-[280px] lg:max-w-none ' +
    (sidebarCollapsed ? 'lg:w-[4.5rem]' : 'lg:w-64');
  const mainAsideOffset = sidebarCollapsed ? 'lg:ml-[4.5rem]' : 'lg:ml-64';

  const shellNotificationsValue = useMemo(
    () => ({
      notifications: notifications || [],
      unreadCount,
      notifOpen,
      setNotifOpen: (v) => {
        setNotifOpen(v);
        if (v) {
          setUserMenuOpen(false);
          setMobileQuickOpen(false);
          setMobileMenuOpen(false);
        }
      },
      onLeaveNotificationClick: (row) => void openLeaveFromNotificationRow(row),
      onNavigate: closeMobileOverlays,
    }),
    [notifications, unreadCount, notifOpen, openLeaveFromNotificationRow],
  );

  return (
    <ErpPresenceProvider userId={session?.user?.id}>
    <ErpBreadcrumbProvider>
    <ErpShellNotificationsProvider value={shellNotificationsValue}>
    <ErpRealtimeWorkspaceBridge userId={session?.user?.id} />
    <div className="relative flex h-[100dvh] min-h-0 w-full overflow-hidden text-[13px] text-slate-800 antialiased dark:text-slate-200">
      {/* Single layer: fewer composited fixed layers = cheaper repaints while scrolling */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[color:var(--erp-canvas-light)] dark:hidden"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 -z-10 hidden dark:block bg-[color:var(--erp-canvas-dark)]"
        aria-hidden
      />

      <aside
        id="erp-mobile-nav"
        className={[
          'hidden lg:flex flex-col text-slate-800 bg-[rgb(255_255_255/0.94)]',
          'dark:bg-[#090e13] dark:text-white',
          'shadow-[4px_0_32px_-8px_rgba(16,61,77,0.14),inset_1px_0_0_rgba(255,255,255,0.85)] dark:shadow-[4px_0_40px_-8px_rgba(0,0,0,0.55)]',
          'border-r border-white/70 dark:border-teal-950/80',
          'h-[100dvh] max-h-dvh shrink-0',
          asideW,
          'fixed left-0 top-0 z-[40]',
          'transition-[width] duration-200 ease-out motion-reduce:transition-none',
        ].join(' ')}
      >
        <div
          className={`p-4 border-b border-cyan-100/60 flex items-start gap-2 bg-gradient-to-b from-white/40 to-transparent dark:border-teal-900/45 dark:bg-[#070b10] dark:[background-image:none] ${sidebarCollapsed ? 'lg:flex-col lg:items-center' : ''}`}
        >
          <Link
            href="/erp/dashboard"
            className={`block min-w-0 flex-1 ${sidebarCollapsed ? 'lg:flex-1 lg:w-full lg:flex lg:justify-center' : ''}`}
            onClick={closeMobileOverlays}
          >
            {sidebarCollapsed ? (
              <div className="hidden lg:flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-200/70 bg-gradient-to-br from-white to-cyan-50/80 shadow-md shadow-cyan-900/10 overflow-hidden p-1.5 dark:border-teal-800/60 dark:bg-gradient-to-br dark:from-slate-800 dark:to-teal-950/70 dark:shadow-black/40">
                <img
                  src="/Digitalisglobal%20logo.png"
                  alt="Digitalis"
                  className="h-full w-full object-contain"
                  width={32}
                  height={32}
                  decoding="async"
                />
              </div>
            ) : null}
            <span className={sidebarCollapsed ? 'lg:hidden' : ''}>
              <img
                src="/Digitalis_logo_black.png"
                alt="Digitalis"
                className="h-9 w-auto max-w-full object-contain object-left dark:brightness-0 dark:invert dark:opacity-95"
              />
              <span className="erp-brand-text mt-2 block text-[11px] font-semibold">
                Workspace
              </span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="hidden lg:inline-flex rounded-lg border border-cyan-200/80 bg-white/80 p-2 text-teal-800/80 hover:bg-cyan-50 hover:text-[#103D4D] hover:border-cyan-300 shadow-sm dark:border-teal-800/60 dark:bg-white/10 dark:text-white dark:hover:bg-white/15 dark:hover:border-teal-600/50 dark:hover:text-white"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={sidebarCollapsed ? 'Expand' : 'Collapse'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5" aria-hidden>
                {sidebarCollapsed ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                )}
              </svg>
            </button>
          </div>
        </div>

        <div className={`px-3 py-3 border-b border-cyan-100/50 dark:border-teal-900/45 ${sidebarCollapsed ? 'lg:px-2' : ''}`}>
          <div
            className={`flex items-center gap-3 rounded-2xl border border-cyan-200/40 bg-gradient-to-br from-white via-cyan-50/40 to-violet-50/30 p-2.5 shadow-sm shadow-cyan-900/5 dark:border-teal-800/40 dark:bg-[#0a0f14] dark:[background-image:none] dark:shadow-black/30 ${sidebarCollapsed ? 'lg:justify-center lg:p-2' : ''}`}
          >
            <ErpAvatarWithOnline
              forceOnline={Boolean(session?.user)}
              size="lg"
              presenceUserId={session?.user?.id}
              lastActiveAt={profile?.last_active_at}
            >
              <ErpUserAvatar profile={profile} email={session?.user?.email} size="lg" alt="" />
            </ErpAvatarWithOnline>
            <div className={`min-w-0 flex-1 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
              <p className="text-[13px] font-semibold text-[#103D4D] truncate dark:text-white">
                {erpWorkspaceDisplayName(profile, session?.user?.email)}
              </p>
              <p className="text-[11px] text-teal-800/70 capitalize truncate font-medium dark:text-teal-200/85">
                {erpWorkspaceSubtitle(profile)}
              </p>
            </div>
          </div>
        </div>

        <div
          ref={sidebarNavScrollRef}
          className="erp-sidebar-nav flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(16,61,77,0.2)_transparent]"
        >
          <nav className="p-2 pt-3 space-y-2">
            {filteredNavSections.map((sec) => (
              <div key={sec.sectionId} className="space-y-1">
                {sec.sectionTitle ? (
                  <div
                    className={`px-2.5 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-wide text-teal-800/45 first:pt-0 dark:text-teal-300/50 ${sidebarCollapsed ? 'lg:sr-only' : ''}`}
                  >
                    {sec.sectionTitle}
                  </div>
                ) : null}
                {sec.items.map((item) => {
                  const active = item.href === activeNavHref;
                  const Icon = ERP_NAV_ICON_MAP[item.iconId];
                  const label = navLabelForRole(item);
                  return (
                    <Link
                      key={`${sec.sectionId}-${item.href}`}
                      href={item.href}
                      prefetch={false}
                      onClick={closeMobileOverlays}
                      title={
                        sidebarCollapsed
                          ? item.href === '/erp/inbox' && inboxUnread > 0
                            ? `${label} (${inboxUnread} unread)`
                            : item.href === '/erp/projects' && projectsUnread > 0
                              ? `${label} (${projectsUnread} unread)`
                              : item.href === '/erp/messages' && messagesUnread > 0
                                ? `${label} (${messagesUnread} unread)`
                                : label
                          : undefined
                      }
                      aria-current={active ? 'page' : undefined}
                      className={`relative flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-[13px] font-medium transition-all duration-200 ${
                        sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''
                      } ${
                        active
                          ? 'bg-gradient-to-r from-[#B2EBF2] via-cyan-100/90 to-teal-100/80 text-[#0a3544] font-semibold shadow-md shadow-teal-900/10 border border-cyan-300/50 ring-1 ring-white/60 dark:border-teal-800/35 dark:bg-[#0d141c] dark:text-white dark:shadow-none dark:ring-0 dark:[background-image:none]'
                          : 'text-slate-800 border border-transparent hover:bg-white/70 hover:border-cyan-100/80 hover:shadow-sm dark:text-white/95 dark:hover:bg-white/[0.08] dark:hover:border-white/10 dark:hover:text-white'
                      }`}
                    >
                      {Icon ? (
                        <span className="relative inline-flex shrink-0">
                          <Icon
                            className={`h-5 w-5 ${active ? 'text-[#103D4D] dark:text-white' : 'text-teal-700/75 dark:text-white/85'}`}
                          />
                          {sidebarCollapsed && item.href === '/erp/inbox' && inboxUnread > 0 ? (
                            <span
                              className="absolute -right-0.5 -top-0.5 h-2 min-w-[0.5rem] rounded-full bg-red-500 ring-2 ring-white dark:ring-[#0a1620]"
                              aria-hidden
                            />
                          ) : null}
                          {sidebarCollapsed && item.href === '/erp/projects' && projectsUnread > 0 ? (
                            <span
                              className="absolute -right-0.5 -top-0.5 h-2 min-w-[0.5rem] rounded-full bg-red-500 ring-2 ring-white dark:ring-[#0a1620]"
                              aria-hidden
                            />
                          ) : null}
                          {sidebarCollapsed && item.href === '/erp/messages' && messagesUnread > 0 ? (
                            <span
                              className="absolute -right-0.5 -top-0.5 h-2 min-w-[0.5rem] rounded-full bg-red-500 ring-2 ring-white dark:ring-[#0a1620]"
                              aria-hidden
                            />
                          ) : null}
                        </span>
                      ) : null}
                      <span
                        className={`flex min-w-0 flex-1 items-center gap-2 ${sidebarCollapsed ? 'lg:sr-only' : ''}`}
                      >
                        <span className="truncate">{label}</span>
                        {item.href === '/erp/inbox' && inboxUnread > 0 ? (
                          <span className="shrink-0 tabular-nums rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                            {inboxUnread > 99 ? '99+' : inboxUnread}
                          </span>
                        ) : null}
                        {item.href === '/erp/projects' && projectsUnread > 0 ? (
                          <span className="shrink-0 tabular-nums rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                            {projectsUnread > 99 ? '99+' : projectsUnread}
                          </span>
                        ) : null}
                        {item.href === '/erp/messages' && messagesUnread > 0 ? (
                          <span className="shrink-0 tabular-nums rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                            {messagesUnread > 99 ? '99+' : messagesUnread}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        <div
          className={`shrink-0 border-t border-cyan-100/60 bg-gradient-to-b from-white/60 to-cyan-50/25 p-2 dark:border-teal-900/45 dark:bg-[#070b10] dark:[background-image:none] ${sidebarCollapsed ? 'lg:px-1.5' : ''}`}
        >
          <Link
            href="/erp/account"
            onClick={closeMobileOverlays}
            title={sidebarCollapsed ? 'Account settings' : undefined}
            aria-current={pathname === '/erp/account' || pathname.startsWith('/erp/account/') ? 'page' : undefined}
            className={`relative flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-[13px] font-medium transition-all duration-200 ${
              sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''
            } ${
              pathname === '/erp/account' || pathname.startsWith('/erp/account/')
                ? 'bg-gradient-to-r from-[#B2EBF2] via-cyan-100/90 to-teal-100/80 text-[#0a3544] font-semibold shadow-md shadow-teal-900/10 border border-cyan-300/50 ring-1 ring-white/60 dark:border-teal-800/35 dark:bg-[#0d141c] dark:text-white dark:shadow-none dark:ring-0 dark:[background-image:none]'
                : 'text-slate-800 border border-transparent hover:bg-white/70 hover:border-cyan-100/80 hover:shadow-sm dark:text-white/95 dark:hover:bg-white/[0.08] dark:hover:border-white/10'
            }`}
          >
            <IconAccount
              className={`h-5 w-5 shrink-0 ${pathname === '/erp/account' || pathname.startsWith('/erp/account/') ? 'text-[#103D4D] dark:text-white' : 'text-teal-700/75 dark:text-white/85'}`}
            />
            <span className={`truncate ${sidebarCollapsed ? 'lg:sr-only' : ''}`}>Account settings</span>
          </Link>
        </div>
      </aside>

      <main
        className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[color:var(--erp-canvas-light)] transition-[margin] duration-200 ease-out max-lg:ml-0 dark:bg-[color:var(--erp-canvas-dark)] ${mainAsideOffset}`}
      >
        <div
          className={`sticky top-0 z-30 flex h-14 w-full shrink-0 items-center gap-2 border-b border-cyan-100/70 bg-[rgb(255_255_255/0.92)] px-3 shadow-sm shadow-cyan-900/5 dark:border-teal-900/50 dark:bg-[#090e13] dark:shadow-black/35 dark:[background-image:none] sm:px-4 lg:px-6 xl:px-10 ${
            mobileMessagesThread || mobileDashboardPage ? 'max-lg:hidden' : ''
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div className="min-w-0 flex-1 lg:hidden">
              {!isLgViewport ? (
                <ErpUserMenuPopover
                  profile={profile}
                  email={session?.user?.email}
                  open={userMenuOpen}
                  onOpenChange={(v) => {
                    setUserMenuOpen(v);
                    if (v) {
                      setNotifOpen(false);
                      setMobileQuickOpen(false);
                      setMobileMenuOpen(false);
                    }
                  }}
                  onSignOut={handleSignOut}
                  layout="compact"
                  accountActive={profileActive}
                />
              ) : null}
            </div>
            <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end gap-1.5 sm:gap-2">
              <ErpGlobalSearch />
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <ErpColorSchemeToggle />
                <ErpNotificationsPopover
                  variant={isLgViewport ? 'toolbar' : 'compact'}
                  mobileSheetHost="shell"
                  notifications={notifications}
                  unreadCount={unreadCount}
                  open={notifOpen}
                  onOpenChange={shellNotificationsValue.setNotifOpen}
                  onLeaveNotificationClick={shellNotificationsValue.onLeaveNotificationClick}
                  onNavigate={shellNotificationsValue.onNavigate}
                />
                <div className="hidden lg:block">
                  {isLgViewport ? (
                    <ErpUserMenuPopover
                      profile={profile}
                      email={session?.user?.email}
                      open={userMenuOpen}
                      onOpenChange={(v) => {
                        setUserMenuOpen(v);
                        if (v) setNotifOpen(false);
                      }}
                      onSignOut={handleSignOut}
                      accountActive={profileActive}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          ref={mainScrollRef}
          className={`min-h-0 min-w-0 w-full flex-1 overflow-x-hidden overscroll-y-contain [scrollbar-width:thin] bg-[color:var(--erp-canvas-light)] lg:pb-0 dark:bg-[color:var(--erp-canvas-dark)] dark:[background-image:none] ${
            mobileMessagesThread
              ? 'flex min-h-0 flex-col overflow-hidden pb-0'
              : mobileMessagesPage
                ? 'flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(5rem+env(safe-area-inset-bottom))] max-lg:pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0'
                : 'overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))]'
          }`}
        >
          <div
            className={`relative w-full max-w-none max-lg:px-2 max-lg:py-1 px-3 py-2 sm:px-4 sm:py-3 md:px-5 md:py-4 lg:px-6 lg:py-5 xl:px-8 ${
              isProjectsListPage
                ? 'erp-projects-page max-lg:!px-2 max-lg:!py-1 lg:min-h-0 xl:px-7 xl:py-4 2xl:px-8 2xl:py-3'
                : mobileDashboardPage
                  ? 'max-lg:!px-0 max-lg:!py-0'
                  : ''
            } ${
              mobileMessagesThread
                ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-0 py-0 sm:px-0 sm:py-0 lg:px-0 lg:py-0 xl:px-0'
                : mobileMessagesPage
                  ? 'flex min-h-0 flex-1 flex-col overflow-hidden max-lg:px-0 max-lg:py-0'
                  : ''
            }`}
          >
            <div
              className={`${mobileMessagesThread ? 'hidden' : ''} ${
                mobileMessagesPage || mobileDashboardPage
                  ? 'max-lg:hidden shrink-0 px-3 pt-2 pb-1 sm:px-4 lg:block lg:px-0 lg:pt-0 lg:pb-0'
                  : ''
              }`}
            >
              <ErpBreadcrumbs />
            </div>
            <div
              className={
                mobileMessagesThread
                  ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
                  : mobileMessagesPage
                    ? 'flex min-h-0 flex-1 w-full flex-col overflow-hidden'
                    : 'w-full'
              }
            >
              {children}
            </div>
          </div>
        </div>
      </main>

      <nav
        className={`lg:hidden fixed bottom-0 left-0 right-0 border-t pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_-4px_rgba(16,61,77,0.1)] dark:shadow-black/35 dark:[background-image:none] ${
          mobileQuickOpen
            ? 'z-[70] border-slate-200/50 bg-white/80 backdrop-blur-md dark:border-teal-900/40 dark:bg-[#06090d]/85'
            : mobileOverlayOpen
              ? 'z-[60] border-slate-200/90 bg-white dark:border-teal-900/55 dark:bg-[#06090d]'
              : 'z-[45] border-slate-200/90 bg-white dark:border-teal-900/55 dark:bg-[#06090d]'
        } ${mobileMessagesThread ? 'max-lg:hidden' : ''}`}
        aria-label="Workspace shortcuts"
      >
        <div className="mx-auto grid w-full max-w-2xl grid-cols-5 px-1 sm:max-w-3xl sm:px-2">
          <Link
            href="/erp/dashboard"
            prefetch={false}
            className={`erp-mobile-nav-item flex min-h-[3.75rem] flex-col items-center justify-end px-0.5 pb-1.5 pt-1 transition-colors ${
              homeActive
                ? 'text-violet-600 dark:text-cyan-300'
                : 'text-slate-500 hover:text-slate-700 dark:text-white/80 dark:hover:text-white'
            }`}
            aria-current={homeActive ? 'page' : undefined}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center">
              <IconHome
                className={`h-6 w-6 ${homeActive ? 'text-violet-600 dark:text-cyan-300' : 'text-slate-500 dark:text-white/75'}`}
              />
            </span>
            <span className="mt-1 block w-full truncate text-center text-[10px] font-semibold leading-none">Home</span>
          </Link>

          {canViewMessages ? (
            <Link
              href="/erp/messages"
              prefetch={false}
              className={`erp-mobile-nav-item flex min-h-[3.75rem] flex-col items-center justify-end px-0.5 pb-1.5 pt-1 transition-colors ${
                messagesActive
                  ? 'text-violet-600 dark:text-cyan-300'
                  : 'text-slate-500 hover:text-slate-700 dark:text-white/80 dark:hover:text-white'
              }`}
              aria-current={messagesActive ? 'page' : undefined}
            >
              <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
                <IconMessages
                  className={`h-6 w-6 ${messagesActive ? 'text-violet-600 dark:text-cyan-300' : 'text-slate-500 dark:text-white/75'}`}
                />
                {messagesUnread > 0 ? (
                  <span className="absolute -right-1.5 -top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-white dark:ring-[#0a1520]">
                    {messagesUnread > 99 ? '99+' : messagesUnread}
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block w-full truncate text-center text-[10px] font-semibold leading-none">Messages</span>
            </Link>
          ) : (
            <span className="erp-mobile-nav-item flex min-h-[3.75rem] flex-col items-center justify-end px-0.5 pb-1.5 pt-1 aria-hidden">
              <span className="h-6 w-6 shrink-0" />
              <span className="mt-1 block h-[10px] w-full" />
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              setNotifOpen(false);
              setUserMenuOpen(false);
              setMobileQuickOpen((open) => !open);
            }}
            disabled={mobileQuickFanItems.length === 0}
            className="erp-mobile-nav-item relative flex min-h-[3.75rem] flex-col items-center justify-end px-0.5 pb-1.5 pt-1 disabled:opacity-40"
            aria-expanded={mobileQuickOpen}
            aria-controls="erp-mobile-quick-fan"
            aria-label={mobileQuickOpen ? 'Close quick actions' : 'Open quick actions'}
          >
            <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-visible">
              <span
                className={`absolute left-1/2 top-1/2 z-10 flex h-[3.35rem] w-[3.35rem] -translate-x-1/2 -translate-y-[2.35rem] items-center justify-center rounded-full shadow-[0_10px_28px_-8px_rgba(16,61,77,0.45)] ring-4 transition-all active:scale-95 ${
                  mobileQuickOpen || quickNavActive
                    ? 'erp-brand-fill text-white ring-cyan-100 dark:ring-teal-900/70'
                    : 'border border-cyan-200/80 bg-white text-[#103D4D] ring-white dark:border-teal-700/55 dark:bg-[#0f1a24] dark:text-cyan-100 dark:ring-[#06090d]'
                } ${mobileQuickOpen ? 'rotate-45' : ''}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-7 w-7 shrink-0" aria-hidden>
                  <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </span>
            <span
              className={`mt-1 block w-full truncate text-center text-[10px] font-semibold leading-none ${
                mobileQuickOpen || quickNavActive
                  ? 'text-violet-600 dark:text-cyan-300'
                  : 'text-slate-500 dark:text-white/80'
              }`}
            >
              Quick
            </span>
          </button>

          {canViewProjects ? (
            <Link
              href="/erp/projects"
              prefetch={false}
              onClick={closeMobileOverlays}
              className={`erp-mobile-nav-item flex min-h-[3.75rem] flex-col items-center justify-end px-0.5 pb-1.5 pt-1 transition-colors ${
                projectsActive
                  ? 'text-violet-600 dark:text-cyan-300'
                  : 'text-slate-500 hover:text-slate-700 dark:text-white/80 dark:hover:text-white'
              }`}
              aria-current={projectsActive ? 'page' : undefined}
            >
              <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
                <IconProjects
                  className={`h-6 w-6 ${projectsActive ? 'text-violet-600 dark:text-cyan-300' : 'text-slate-500 dark:text-white/75'}`}
                />
                {projectsUnread > 0 ? (
                  <span className="absolute -right-1.5 -top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-white dark:ring-[#0a1520]">
                    {projectsUnread > 99 ? '99+' : projectsUnread}
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block w-full truncate text-center text-[10px] font-semibold leading-none">Projects</span>
            </Link>
          ) : (
            <span className="erp-mobile-nav-item flex min-h-[3.75rem] flex-col items-center justify-end px-0.5 pb-1.5 pt-1 aria-hidden">
              <span className="h-6 w-6 shrink-0" />
              <span className="mt-1 block h-[10px] w-full" />
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              setMobileQuickOpen(false);
              setNotifOpen(false);
              setUserMenuOpen(false);
              setMobileMenuOpen((open) => !open);
            }}
            className={`erp-mobile-nav-item flex min-h-[3.75rem] flex-col items-center justify-end px-0.5 pb-1.5 pt-1 transition-colors ${
              mobileMenuOpen ? 'text-violet-600 dark:text-cyan-300' : 'text-slate-500 dark:text-white/80'
            }`}
            aria-expanded={mobileMenuOpen}
            aria-controls="erp-mobile-menu-drawer"
            aria-label={mobileMenuOpen ? 'Close workspace menu' : 'Open workspace menu'}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center">
              {mobileMenuOpen ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} className="h-6 w-6" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <IconMenuGrid className="h-6 w-6 shrink-0" />
              )}
            </span>
            <span className="mt-1 block w-full truncate text-center text-[10px] font-semibold leading-none">
              {mobileMenuOpen ? 'Close' : 'Menu'}
            </span>
          </button>
        </div>
      </nav>

      {mobileQuickOpen && mobileQuickFanItems.length > 0 ? (
        <ErpMobileNavSheet
          open={mobileQuickOpen}
          onClose={closeMobileOverlays}
          items={mobileQuickFanItems}
          activeNavHref={activeNavHref}
          iconMap={ERP_NAV_ICON_MAP}
          dialogId="erp-mobile-quick-fan"
          ariaLabel="Quick actions"
          inboxUnread={inboxUnread}
          projectsUnread={projectsUnread}
          messagesUnread={messagesUnread}
        />
      ) : null}

      {mobileQuickEditOpen ? (
        <ErpMobileQuickActionsEditor
          open={mobileQuickEditOpen}
          onClose={closeMobileQuickEditor}
          onSave={saveMobileQuickEditor}
          selectedItems={mobileQuickFanItems}
          availableItems={mobileQuickEditorPool}
          iconMap={ERP_NAV_ICON_MAP}
        />
      ) : null}

      {mobileMenuOpen ? (
        <ErpMobileMenuDrawer
          open={mobileMenuOpen}
          onClose={closeMobileOverlays}
          sections={mobileMenuSections}
          activeNavHref={activeNavHref}
          iconMap={ERP_NAV_ICON_MAP}
          inboxUnread={inboxUnread}
          projectsUnread={projectsUnread}
          messagesUnread={messagesUnread}
          onEditQuickActions={openMobileQuickEditor}
        />
      ) : null}

      <ErpFloatingProjectTimer />
      {ERP_VOICE_ASSISTANT_ENABLED ? (
        <ErpVoiceAssistant suppressMobileFab={mobileOverlayOpen} />
      ) : null}

      {leaveModalEl}
      {!isLgViewport ? (
        <ErpNotificationsMobileSheet
          open={notifOpen}
          onOpenChange={shellNotificationsValue.setNotifOpen}
          onNavigate={shellNotificationsValue.onNavigate}
          onLeaveNotificationClick={shellNotificationsValue.onLeaveNotificationClick}
          notifications={notifications}
          unreadCount={unreadCount}
        />
      ) : null}

      {incomingCall && (
        <div
          className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+1rem)] z-[600] w-[min(calc(100vw-1.5rem),26rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-teal-300/70 bg-gradient-to-br from-white to-teal-50/70 shadow-[0_30px_70px_-12px_rgba(16,61,77,0.35),0_0_0_1px_rgba(13,148,136,0.18)]"
          role="alertdialog"
          aria-live="assertive"
          aria-label="Incoming call"
        >
          <div className="flex items-center gap-3 border-b border-teal-100/80 erp-brand-fill px-4 py-3 text-white">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15 ring-2 ring-white/30">
              <span className="absolute inset-0 animate-ping rounded-full bg-white/25" />
              {incomingCall.audioOnly ? (
                <svg className="relative h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path
                    d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg className="relative h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold leading-tight">{incomingCall.title}</p>
              <p className="text-[11px] text-teal-100/90">
                {incomingCall.audioOnly ? 'Voice call' : 'Video call'}
                {incomingCall.isGroup ? ' · group' : ''} · ringing…
              </p>
            </div>
          </div>
          {incomingCall.body ? (
            <p className="px-4 pt-3 text-xs text-slate-600">{incomingCall.body}</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
            <button
              type="button"
              onClick={declineIncomingCall}
              className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-bold text-rose-700 shadow-sm transition hover:bg-rose-50"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={answerIncomingCall}
              className="flex items-center gap-1.5 rounded-xl erp-brand-fill px-4 py-2 text-xs font-bold text-white shadow-lg shadow-teal-900/25 transition"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path
                  d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Answer
            </button>
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-4 right-4 z-[300] mx-auto flex w-auto max-w-md flex-col gap-2 sm:left-auto sm:right-5 sm:mx-0 sm:w-[min(calc(100vw-2.5rem),22rem)] lg:bottom-5"
          role="region"
          aria-label="Notifications"
        >
          {toasts.map((t) => {
            const tone = t.tone || (t.ephemeral ? 'info' : 'default');
            const toneBorder =
              tone === 'success'
                ? 'border-emerald-300/70 dark:border-emerald-800/55'
                : tone === 'error'
                  ? 'border-rose-300/70 dark:border-rose-900/50'
                  : t.ephemeral
                    ? 'border-amber-200/70 dark:border-amber-900/45'
                    : 'border-cyan-200/60 dark:border-teal-800/55';
            const showOpen = Boolean(t.link) && tone !== 'success' && tone !== 'error';
            return (
              <div
                key={t.id}
                className={`overflow-hidden rounded-2xl border bg-white/95 p-4 shadow-[0_24px_64px_-12px_rgba(16,61,77,0.25),0_0_0_1px_rgba(178,235,242,0.3)] backdrop-blur-md transition-all dark:bg-[#0f1a23]/95 dark:shadow-[0_24px_64px_-12px_rgba(0,0,0,0.55)] dark:ring-1 dark:ring-white/[0.04] ${toneBorder}`}
                role="alert"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-start gap-2.5">
                    {tone === 'success' ? (
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l4 4L19 7" />
                        </svg>
                      </span>
                    ) : tone === 'error' ? (
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/55 dark:text-rose-300">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </span>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-snug text-[#103D4D] dark:text-slate-100">{t.title}</p>
                      {t.body ? (
                        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                          {t.body}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissToast(t.id)}
                    className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
                {showOpen ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        dismissToast(t.id);
                        const pseudo = { title: t.title, body: t.body, link: t.link, read: false, id: t.id };
                        if (isLeaveWorkspaceNotification(pseudo)) {
                          void openLeaveFromNotificationRow(pseudo);
                          return;
                        }
                        navigateToErpNotification(router, pseudo);
                      }}
                      className="rounded-xl erp-brand-fill px-4 py-2 text-xs font-bold text-white shadow-lg shadow-teal-900/25"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissToast(t.id)}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-[#121f28] dark:text-slate-200 dark:hover:bg-[#152230]"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
    </ErpShellNotificationsProvider>
    </ErpBreadcrumbProvider>
    </ErpPresenceProvider>
  );
}
