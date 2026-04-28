'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ErpDirectMessages from '../../../components/erp/ErpDirectMessages';

function MessagesInner() {
  const searchParams = useSearchParams();
  const inThread = Boolean(searchParams.get('with') || searchParams.get('group'));
  return (
    <div
      className={`mx-auto flex w-full max-w-[min(100%,96rem)] max-lg:min-h-0 max-lg:flex-1 max-lg:flex-col max-lg:overflow-hidden lg:flex lg:h-[calc(100dvh-5.5rem)] lg:min-h-[calc(100dvh-5.5rem)] lg:max-h-[calc(100dvh-5.5rem)] lg:flex-1 lg:flex-col lg:overflow-hidden lg:gap-4`}
    >
      <header className={`relative shrink-0 px-3 pt-3 sm:px-4 sm:pt-4 ${inThread ? 'max-lg:hidden' : ''}`}>
        <div>
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span
              className="hidden h-8 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-[#103D4D] via-teal-600 to-cyan-400 opacity-95 shadow-md sm:block sm:h-9"
              aria-hidden
            />
            <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl bg-gradient-to-r from-slate-900 via-[#103D4D] to-teal-600 bg-clip-text text-transparent">
              Messages
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 sm:hidden">Pick someone to start or continue a chat.</p>
        </div>
      </header>

      <div
        className={`max-lg:flex max-lg:min-h-0 max-lg:flex-1 max-lg:flex-col max-lg:overflow-hidden lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:px-0 lg:pb-0 ${
          inThread ? '' : 'px-3 pb-4 sm:px-4'
        }`}
      >
        <div
          className={`rounded-3xl border border-cyan-200/50 bg-white/75 backdrop-blur-md shadow-[0_18px_60px_-30px_rgba(16,61,77,0.35)] ring-1 ring-white/70 max-lg:flex max-lg:min-h-0 max-lg:flex-1 max-lg:flex-col dark:border-teal-950/50 dark:bg-[#050a10]/95 dark:shadow-black/50 dark:ring-1 dark:ring-teal-950/40 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:rounded-xl lg:border lg:border-cyan-200/50 lg:bg-white/90 lg:shadow-md lg:ring-1 lg:ring-cyan-900/[0.05] lg:dark:border-teal-950/45 lg:dark:bg-[#060b10]/98 lg:dark:ring-teal-950/35 ${
            inThread
              ? 'max-lg:rounded-none max-lg:border-0 max-lg:bg-white max-lg:shadow-none max-lg:ring-0 max-lg:dark:bg-[#050810]'
              : ''
          }`}
        >
          <div
            className={`max-lg:flex max-lg:min-h-0 max-lg:flex-1 max-lg:flex-col lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden ${inThread ? '' : 'p-3 sm:p-4'}`}
          >
            <ErpDirectMessages />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ErpMessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
        </div>
      }
    >
      <MessagesInner />
    </Suspense>
  );
}
