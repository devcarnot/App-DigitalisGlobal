'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

function loadJitsiApi(domain) {
  return new Promise((resolve, reject) => {
    const g = typeof window !== 'undefined' ? window : globalThis;
    if (g.JitsiMeetExternalAPI) {
      resolve(g.JitsiMeetExternalAPI);
      return;
    }
    const base = `https://${domain}`;
    const existing = document.querySelector(`script[data-jitsi-ext="${domain}"]`);
    if (existing) {
      if (g.JitsiMeetExternalAPI) {
        resolve(g.JitsiMeetExternalAPI);
        return;
      }
      // Reuse the in-flight script tag, but make sure both listeners are
      // detached after the first event fires: without this, opening and
      // closing the call modal repeatedly leaks one pair of listeners per
      // open and slowly inflates the script element's listener registry.
      const onLoad = () => {
        existing.removeEventListener('load', onLoad);
        existing.removeEventListener('error', onError);
        if (g.JitsiMeetExternalAPI) resolve(g.JitsiMeetExternalAPI);
        else reject(new Error('Jitsi API not available'));
      };
      const onError = () => {
        existing.removeEventListener('load', onLoad);
        existing.removeEventListener('error', onError);
        reject(new Error('Jitsi script failed'));
      };
      existing.addEventListener('load', onLoad);
      existing.addEventListener('error', onError);
      return;
    }
    const s = document.createElement('script');
    s.src = `${base}/external_api.js`;
    s.async = true;
    s.dataset.jitsiExt = domain;
    const cleanup = () => {
      s.onload = null;
      s.onerror = null;
    };
    s.onload = () => {
      cleanup();
      if (g.JitsiMeetExternalAPI) resolve(g.JitsiMeetExternalAPI);
      else reject(new Error('Jitsi API not available'));
    };
    s.onerror = () => {
      cleanup();
      reject(new Error('Could not load video call library'));
    };
    document.body.appendChild(s);
  });
}

/**
 * Embedded Jitsi Meet: voice, video, screen share, chat, recording (if server allows).
 */
export default function ErpJitsiCallModal({
  open,
  onClose,
  domain,
  roomName,
  displayName,
  joinUrl,
  jwt,
  startAudioOnly = false,
  recipientName = '',
  isOutgoing = false,
}) {
  const hostRef = useRef(null);
  const [hostEl, setHostEl] = useState(null);
  const setHostRef = useCallback((node) => {
    hostRef.current = node;
    setHostEl(node);
  }, []);
  const apiRef = useRef(null);
  const [loadErr, setLoadErr] = useState('');
  /** True until the first remote participant joins. Used to render the "Ringing…" overlay. */
  const [waitingForPeer, setWaitingForPeer] = useState(true);
  /** Tracks whether any remote peer joined, and the timestamp of the first join. */
  const peerJoinedAtRef = useRef(0);
  /** Guards against calling `onClose` twice (e.g. readyToClose + videoConferenceLeft). */
  const closedRef = useRef(false);

  /** Listener handles registered on the Jitsi external API: kept on a ref
   *  so dispose() can remove them before tearing down the iframe. The Jitsi
   *  client `dispose()` cleans most of this up internally, but defensive
   *  removeEventListener calls protect against the rare case where dispose
   *  throws or the iframe is already detached. */
  const apiListenersRef = useRef([]);

  const dispose = useCallback(() => {
    const api = apiRef.current;
    apiRef.current = null;
    if (api) {
      for (const [evt, handler] of apiListenersRef.current) {
        try {
          api.removeEventListener?.(evt, handler);
        } catch {
          /* ignore */
        }
      }
    }
    apiListenersRef.current = [];
    if (api && typeof api.dispose === 'function') {
      try {
        api.dispose();
      } catch {
        /* ignore */
      }
    }
  }, []);

  /** Single entry-point that reports call summary to the parent exactly once. */
  const finalize = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    const joinedAt = peerJoinedAtRef.current;
    const summary = joinedAt > 0
      ? { hadPeer: true, durationSec: Math.max(0, Math.floor((Date.now() - joinedAt) / 1000)) }
      : { hadPeer: false, durationSec: 0 };
    dispose();
    onClose?.(summary);
  }, [dispose, onClose]);

  useEffect(() => {
    if (!open || !roomName || !domain || !hostEl) return;

    let cancelled = false;
    setLoadErr('');
    setWaitingForPeer(true);
    peerJoinedAtRef.current = 0;
    closedRef.current = false;

    (async () => {
      try {
        const JitsiMeetExternalAPI = await loadJitsiApi(domain);
        if (cancelled || !hostRef.current) return;

        const api = new JitsiMeetExternalAPI(domain, {
          roomName,
          parentNode: hostRef.current,
          width: '100%',
          height: '100%',
          ...(jwt ? { jwt } : {}),
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: Boolean(startAudioOnly),
            disableDeepLinking: true,
          },
          userInfo: {
            displayName: displayName || 'Member',
          },
        });

        apiRef.current = api;

        const onParticipantJoined = () => {
          if (peerJoinedAtRef.current === 0) peerJoinedAtRef.current = Date.now();
          setWaitingForPeer(false);
        };
        api.addEventListener('readyToClose', finalize);
        api.addEventListener('videoConferenceLeft', finalize);
        api.addEventListener('participantJoined', onParticipantJoined);
        apiListenersRef.current = [
          ['readyToClose', finalize],
          ['videoConferenceLeft', finalize],
          ['participantJoined', onParticipantJoined],
        ];
      } catch (e) {
        if (!cancelled) setLoadErr(e?.message || 'Could not start call');
      }
    })();

    return () => {
      cancelled = true;
      dispose();
    };
  }, [open, domain, roomName, displayName, startAudioOnly, hostEl, jwt, dispose, finalize]);

  useEffect(() => {
    if (!open) {
      dispose();
      setHostEl(null);
      hostRef.current = null;
      setLoadErr('');
    }
  }, [open, dispose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[800] flex flex-col bg-slate-950 text-white">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 erp-brand-fill px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">Call, {roomName}</p>
          <p className="text-[11px] text-teal-100/90">
            Video, microphone, screen share: use the controls inside the meeting. Leave with the red phone or close here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {joinUrl ? (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(joinUrl).catch(() => {});
              }}
              className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
            >
              Copy invite link
            </button>
          ) : null}
          <button
            type="button"
            onClick={finalize}
            className="rounded-lg border border-rose-300/80 bg-rose-600 px-3 py-1.5 text-xs font-bold hover:bg-rose-700"
          >
            Close
          </button>
        </div>
      </div>
      {loadErr ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="max-w-md text-sm text-rose-200">{loadErr}</p>
          <button
            type="button"
            onClick={finalize}
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#103D4D]"
          >
            Dismiss
          </button>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <div
            ref={setHostRef}
            className="absolute inset-0 bg-black [&>iframe]:h-full [&>iframe]:min-h-[50vh] [&>iframe]:w-full"
          />
          {isOutgoing && waitingForPeer ? (
            <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
              <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-teal-300/40 bg-[#103D4D]/85 px-4 py-2 text-xs font-semibold text-teal-50 shadow-xl backdrop-blur">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-300 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-300" />
                </span>
                <span className="truncate">
                  Ringing{recipientName ? ` ${recipientName}` : ''}…
                </span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
