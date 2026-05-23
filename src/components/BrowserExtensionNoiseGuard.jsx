'use client';

import { useEffect } from 'react';

/**
 * Swallows the noisy
 *   "A listener indicated an asynchronous response by returning true, but the
 *    message channel closed before a response was received"
 * unhandled-rejection that browser extensions inject into every page.
 *
 * The error comes from extension content scripts that register a
 * `chrome.runtime.onMessage` listener returning `true` (signalling an async
 * response) and then never call `sendResponse` before the page navigates
 * or the tab closes. Common culprits: React DevTools, password managers,
 * Grammarly, translators, ad blockers, screenshot helpers.
 *
 * It is NOT thrown by our codebase (rg `chrome.runtime` returns nothing).
 * It is harmless — Chromium simply rejects the pending promise on teardown
 * — but it shows up as an "Uncaught (in promise)" in DevTools and makes it
 * harder to spot real errors.
 *
 * We deliberately match the message string conservatively so that any
 * other unhandled rejection still surfaces normally for debugging.
 */
const SUPPRESSED_MESSAGE_FRAGMENTS = [
  'message channel closed before a response was received',
  'A listener indicated an asynchronous response by returning true',
];

function shouldSuppress(reason) {
  if (!reason) return false;
  const msg =
    typeof reason === 'string'
      ? reason
      : typeof reason?.message === 'string'
        ? reason.message
        : '';
  if (!msg) return false;
  return SUPPRESSED_MESSAGE_FRAGMENTS.some((frag) => msg.includes(frag));
}

export default function BrowserExtensionNoiseGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    // Capture-phase listeners fire BEFORE bubble-phase handlers (including Next.js'
    // error overlay), so calling stopImmediatePropagation here keeps the noise from
    // reaching any other registered listener.
    const onRejection = (event) => {
      if (shouldSuppress(event?.reason)) {
        event.preventDefault();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
      }
    };
    const onError = (event) => {
      if (shouldSuppress(event?.error ?? event?.message)) {
        event.preventDefault();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
      }
    };

    window.addEventListener('unhandledrejection', onRejection, true);
    window.addEventListener('error', onError, true);

    const origError = console.error;
    const origWarn = console.warn;
    const hushArgs = (args) => {
      for (let i = 0; i < args.length; i += 1) {
        const a = args[i];
        if (typeof a === 'string' && shouldSuppress(a)) return true;
        if (a instanceof Error && shouldSuppress(a)) return true;
      }
      return false;
    };
    console.error = (...args) => {
      if (hushArgs(args)) return;
      origError.apply(console, args);
    };
    console.warn = (...args) => {
      if (hushArgs(args)) return;
      origWarn.apply(console, args);
    };

    return () => {
      window.removeEventListener('unhandledrejection', onRejection, true);
      window.removeEventListener('error', onError, true);
      console.error = origError;
      console.warn = origWarn;
    };
  }, []);

  return null;
}
