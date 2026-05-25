'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { erpAuthorizedFetch } from '../../lib/erp-client-api';
import { pushErpAppToast } from '../../lib/erp-app-toast';
import { useErpSession } from './useErpSession';
import {
  createErpVoiceRecognizer,
  isErpDesktopShell,
  isErpVoiceSpeechSupported,
} from '../../lib/erp-voice/erp-voice-speech';
import { parseVoiceTranscript } from '../../lib/erp-voice/erp-voice-intents';
import { executeVoiceIntent } from '../../lib/erp-voice/execute-voice-intent';

/**
 * Global voice assistant — Roman Urdu / English speech, English on-screen feedback.
 * Center modal on every authenticated ERP page (web + Electron desktop).
 */
export default function ErpVoiceAssistant() {
  const router = useRouter();
  const { erpCan, profile, loading } = useErpSession();

  const [modalOpen, setModalOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [lastHeard, setLastHeard] = useState('');
  const [responseEn, setResponseEn] = useState('');
  const [responseOk, setResponseOk] = useState(true);
  const [pendingIntent, setPendingIntentState] = useState(null);
  const [typedCommand, setTypedCommand] = useState('');
  const [supported] = useState(() => isErpVoiceSpeechSupported());

  const recognizerRef = useRef(null);
  const pendingRef = useRef(null);
  const processingRef = useRef(false);

  const setPendingIntent = useCallback((intent) => {
    pendingRef.current = intent;
    setPendingIntentState(intent);
  }, []);

  const resetSession = useCallback(() => {
    recognizerRef.current?.abort();
    processingRef.current = false;
    setListening(false);
    setProcessing(false);
    setLiveText('');
    setLastHeard('');
    setResponseEn('');
    setResponseOk(true);
    setTypedCommand('');
    setPendingIntent(null);
  }, [setPendingIntent]);

  const buildCtx = useCallback(
    () => ({
      router,
      erpCan,
      profile,
      erpAuthorizedFetch,
      supabase,
      pushToast: pushErpAppToast,
      pendingIntent: pendingRef.current,
      setPendingIntent,
    }),
    [erpCan, profile, router, setPendingIntent],
  );

  const applyResult = useCallback((result) => {
    const message = result?.messageEn || (result?.ok ? 'Done.' : 'Something went wrong.');
    if (result?.needsConfirm || result?.needsChoice) {
      setResponseEn('');
    } else {
      setResponseEn(message);
    }
    setResponseOk(Boolean(result?.ok && !result?.needsConfirm && !result?.needsChoice));
    pushErpAppToast({
      title: 'Voice assistant',
      body: message,
      tone: result?.needsConfirm || result?.needsChoice ? 'info' : result?.ok ? 'success' : 'error',
    });
    return result;
  }, []);

  const runCommand = useCallback(
    async (rawText, { forceExecute = false, intentOverride = null } = {}) => {
      const text = String(rawText || '').trim();
      if (!text || processingRef.current) return null;

      processingRef.current = true;
      setProcessing(true);
      setLastHeard(text);
      setLiveText('');

      try {
        const pending = pendingRef.current;
        const awaitingConfirm = Boolean(pending && !pending.awaitingPersonPick);
        const intent = intentOverride || parseVoiceTranscript(text, { awaitingConfirm, pendingIntent: pending });
        const result = await executeVoiceIntent(intent, buildCtx(), { forceExecute });

        if (result.needsChoice && result.pendingIntent) {
          setPendingIntent(result.pendingIntent);
        } else if (result.needsConfirm) {
          setPendingIntent(result.pendingIntent || intent.resumeIntent || intent);
        } else if (result.ok && (intent.type === 'confirm' || intent.type === 'cancel' || intent.type === 'person_picked' || forceExecute)) {
          setPendingIntent(null);
        }

        return applyResult(result);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Something went wrong.';
        return applyResult({ ok: false, messageEn: message });
      } finally {
        processingRef.current = false;
        setProcessing(false);
      }
    },
    [applyResult, buildCtx, setPendingIntent],
  );

  const confirmPending = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || processingRef.current) return;

    processingRef.current = true;
    setProcessing(true);

    try {
      const result = await executeVoiceIntent(
        pending,
        { ...buildCtx(), pendingIntent: pending },
        { forceExecute: true },
      );
      if (result.ok) {
        setPendingIntent(null);
      }
      applyResult(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong.';
      applyResult({ ok: false, messageEn: message });
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }, [applyResult, buildCtx, setPendingIntent]);

  const cancelPending = useCallback(() => {
    setPendingIntent(null);
    setResponseEn('Cancelled.');
    setResponseOk(true);
  }, [setPendingIntent]);

  const startListening = useCallback(() => {
    if (!supported || listening || processingRef.current) return;

    setLiveText('');
    setListening(true);

    recognizerRef.current = createErpVoiceRecognizer({
      onResult: (text) => {
        setLiveText(text);
      },
      onError: (msg) => {
        setListening(false);
        setResponseEn(msg);
        pushErpAppToast({ title: 'Voice assistant', body: msg, tone: 'error' });
      },
      onEnd: (_stoppedByUser, full) => {
        setListening(false);
        if (full?.trim()) setLiveText(full.trim());
      },
    });

    recognizerRef.current.start();
  }, [listening, supported]);

  const stopListeningAndRun = useCallback(() => {
    const rec = recognizerRef.current;
    const snapshot = liveText || rec?.getTranscript?.() || '';
    rec?.stop();
    setListening(false);
    if (snapshot.trim()) {
      void runCommand(snapshot.trim());
    }
  }, [liveText, runCommand]);

  const openModal = useCallback(() => {
    resetSession();
    setModalOpen(true);
  }, [resetSession]);

  const closeModal = useCallback(() => {
    resetSession();
    setModalOpen(false);
  }, [resetSession]);

  useEffect(() => {
    return () => {
      recognizerRef.current?.abort();
    };
  }, []);

  if (loading || !profile) return null;

  const displayText = listening ? liveText || 'Listening… speak now' : lastHeard || liveText;

  return (
    <>
      {/* FAB — opens center modal */}
      <div className="pointer-events-none fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-3 z-[220] lg:bottom-6 lg:right-6">
        <button
          type="button"
          onClick={() => {
            if (modalOpen) closeModal();
            else openModal();
          }}
          className={`pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border shadow-lg transition active:scale-95 ${
            listening
              ? 'animate-pulse border-rose-400/70 bg-rose-600 text-white shadow-rose-900/40'
              : 'border-cyan-400/50 erp-brand-fill text-white shadow-teal-900/30'
          }`}
          aria-label={modalOpen ? 'Close voice assistant' : 'Open voice assistant'}
          title="Voice assistant (Roman Urdu / English)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-6 w-6" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
        </button>
      </div>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Voice assistant"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-2xl dark:border-teal-900/55 dark:bg-[#0c141c]">
            <div className="border-b border-slate-200/80 px-5 py-4 dark:border-teal-900/50">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-slate-900 dark:text-slate-100">Voice assistant</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Roman Urdu ya English bolein · screen par English
                    {isErpDesktopShell() ? ' · Desktop' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5">
              {/* Live transcript — center, large */}
              <div
                className={`min-h-[7rem] rounded-2xl border px-4 py-5 text-center transition ${
                  listening
                    ? 'border-cyan-400/50 bg-cyan-50/60 dark:border-cyan-700/40 dark:bg-cyan-950/20'
                    : 'border-slate-200/80 bg-slate-50/80 dark:border-teal-900/45 dark:bg-[#101820]'
                }`}
              >
                {listening ? (
                  <div className="mb-2 flex items-center justify-center gap-2">
                    <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                      Mic on
                    </span>
                  </div>
                ) : null}
                <p
                  className={`text-lg font-medium leading-relaxed text-slate-800 dark:text-slate-100 ${
                    !displayText || displayText === 'Listening… speak now' ? 'text-slate-400 dark:text-slate-500' : ''
                  }`}
                >
                  {displayText || 'Tap mic and speak your command'}
                </p>
              </div>

              {pendingIntent ? (
                <div className="rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-950/30">
                  <p className="text-sm font-bold text-amber-950 dark:text-amber-100">
                    {pendingIntent.awaitingPersonPick
                      ? 'Pick a person'
                      : pendingIntent.type === 'workflow'
                        ? 'Confirm steps'
                        : 'Confirm action'}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-amber-900 dark:text-amber-200">
                    {pendingIntent.messageEn}
                  </p>
                  {!pendingIntent.awaitingPersonPick ? (
                    <>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={processing}
                          onClick={() => void confirmPending()}
                          className="flex-1 rounded-xl border border-emerald-500/60 bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                        >
                          Yes, do it
                        </button>
                        <button
                          type="button"
                          disabled={processing}
                          onClick={cancelPending}
                          className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 dark:border-teal-800/55 dark:text-slate-200"
                        >
                          No, cancel
                        </button>
                      </div>
                      <p className="mt-2 text-center text-[11px] text-amber-800/80 dark:text-amber-300/80">
                        Ya &quot;yes&quot; / &quot;haan&quot; bolein
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-center text-[11px] text-amber-800/80 dark:text-amber-300/80">
                      Bolein: number (1, 2…) ya team (developer, marketing)
                    </p>
                  )}
                </div>
              ) : null}

              {responseEn ? (
                <p
                  className={`whitespace-pre-line rounded-2xl border px-4 py-3 text-sm ${
                    !responseOk
                      ? 'border-rose-300/80 bg-rose-50 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100'
                      : responseEn.toLowerCase().includes('cancel')
                        ? 'border-slate-200 bg-slate-50 text-slate-700 dark:border-teal-900/45 dark:bg-[#101820] dark:text-slate-300'
                        : 'border-teal-200/60 bg-teal-50/50 text-teal-950 dark:border-teal-900/45 dark:bg-teal-950/25 dark:text-teal-100'
                  }`}
                >
                  {responseEn}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {!listening ? (
                  <button
                    type="button"
                    disabled={!supported || processing}
                    onClick={startListening}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-400/60 erp-brand-fill px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                      />
                    </svg>
                    {processing ? 'Working…' : 'Start mic'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopListeningAndRun}
                    className="inline-flex flex-1 items-center justify-center rounded-xl border border-rose-400/70 bg-rose-600 px-4 py-3 text-sm font-bold text-white"
                  >
                    Done speaking — run command
                  </button>
                )}
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => void runCommand('help')}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-teal-800/55 dark:text-slate-200"
                >
                  Help
                </button>
              </div>

              {!supported ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Voice needs Chrome or Edge. Type your command below.
                </p>
              ) : null}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = typedCommand.trim();
                  if (!v) return;
                  setTypedCommand('');
                  void runCommand(v);
                }}
              >
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Ya type karein
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    value={typedCommand}
                    onChange={(e) => setTypedCommand(e.target.value)}
                    placeholder=""
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-teal-900/50 dark:bg-[#121a22] dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={processing || !typedCommand.trim()}
                    className="shrink-0 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold dark:border-teal-800/55 dark:text-slate-200"
                  >
                    Go
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
