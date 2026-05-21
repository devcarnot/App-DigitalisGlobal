'use client';

import React from 'react';

/** Shared field styles for ERP “Add project / Add task” modals */
export const erpModalInputClass =
  'w-full rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-[#103D4D]/50 focus:outline-none focus:ring-[3px] focus:ring-[#103D4D]/12 dark:border-teal-800/45 dark:bg-[#121f28] dark:text-slate-100 dark:shadow-none dark:placeholder:text-slate-500 dark:focus:border-teal-500/45 dark:focus:ring-teal-500/[0.18]';

/** Primary task / project title — stands out from other fields */
export const erpModalTitleInputClass = `${erpModalInputClass} py-3.5 text-base font-semibold leading-snug text-slate-900 placeholder:font-normal sm:text-[1.0625rem] dark:text-slate-50`;

export const erpModalTextareaClass =
  'w-full min-h-[4.75rem] resize-y rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-sm leading-relaxed text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-[#103D4D]/50 focus:outline-none focus:ring-[3px] focus:ring-[#103D4D]/12 dark:border-teal-800/45 dark:bg-[#121f28] dark:text-slate-100 dark:shadow-none dark:placeholder:text-slate-500 dark:focus:border-teal-500/45 dark:focus:ring-teal-500/[0.18]';

export const erpModalSelectClass = `${erpModalInputClass} font-medium cursor-pointer`;

export function ErpModalFieldLabel({ htmlFor, children, optional, required, small }) {
  const labelClass = small
    ? 'text-[11px] font-bold uppercase tracking-wide text-slate-600'
    : 'text-sm font-semibold tracking-tight text-slate-800';
  return (
    <div className={`mb-1.5 flex flex-wrap items-baseline justify-between gap-2 ${small ? 'mb-1' : ''}`}>
      <label
        htmlFor={htmlFor}
        className={`${labelClass} ${small ? 'dark:text-slate-400' : 'dark:text-slate-200'}`}
      >
        {children}
        {required ? (
          <span className="ml-0.5 font-bold text-rose-500" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {optional ? (
        <span
          className={`font-medium tabular-nums text-slate-400 dark:text-slate-500 ${small ? 'text-[10px]' : 'text-[11px]'}`}
        >
          Optional
        </span>
      ) : null}
    </div>
  );
}

/** Dark overlay — keeps focus on the dialog */
export const erpModalBackdropClass =
  'absolute inset-0 z-0 bg-slate-950/70 backdrop-blur-md backdrop-saturate-50';

/** Primary submit — high contrast CTA */
export const erpModalPrimaryButtonClass =
  'rounded-xl erp-brand-fill px-8 py-3.5 text-sm font-extrabold tracking-wide ring-1 ring-white/15 transition active:translate-y-px disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none';

export function ErpModalCloseButton({ onClose, label = 'Close dialog' }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className="absolute right-2 top-2 z-[5] flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-black/20 text-white/95 shadow-md backdrop-blur-sm transition hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 sm:right-2.5 sm:top-2.5 sm:h-10 sm:w-10"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
        <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

function IconDoc({ className = 'h-6 w-6' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconImage({ className = 'h-6 w-6' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 16l5-5 4 4 5-6 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.5" cy="9" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Drop zone for documents vs images — simple vertical stack (no side-by-side overlap in narrow modals).
 */
export function ErpModalAttachmentDropZone({ id, label, hint, accept, files, onPick, onRemove, variant, compact }) {
  const isImage = variant === 'image';
  const iconWrap = isImage
    ? 'bg-violet-100 text-violet-700 ring-1 ring-violet-200/70 dark:bg-violet-950/60 dark:text-violet-200 dark:ring-violet-800/50'
    : 'bg-cyan-50 text-[#103D4D] ring-1 ring-cyan-200/70 dark:bg-teal-950/50 dark:text-teal-200 dark:ring-teal-800/45';
  const pad = compact ? 'p-3 sm:p-3.5' : 'p-4 sm:p-5';
  const iconBox = compact ? 'h-9 w-9 rounded-lg' : 'h-10 w-10 rounded-xl';
  const iconSz = compact ? 'h-4 w-4' : 'h-5 w-5';

  const shell = isImage
    ? 'border-violet-200/90 bg-violet-50/40 hover:border-violet-300 dark:border-violet-900/40 dark:bg-violet-950/25 dark:hover:border-violet-800/50'
    : 'border-slate-200/90 bg-slate-50/50 hover:border-slate-300 dark:border-teal-900/40 dark:bg-[#0c151c]/90 dark:hover:border-teal-800/55';

  // Highlight the dashed shell while the user is dragging files over it,
  // and accept the drop directly so the browser never navigates away to
  // the dropped file (the visible "opens in new tab" symptom).
  const [dragActive, setDragActive] = React.useState(false);
  const dragCounterRef = React.useRef(0);

  const dragShell = isImage
    ? 'border-violet-400 bg-violet-100/70 ring-2 ring-violet-300/60 dark:border-violet-500/70 dark:bg-violet-900/35 dark:ring-violet-500/40'
    : 'border-cyan-400 bg-cyan-50/80 ring-2 ring-cyan-300/60 dark:border-teal-500/70 dark:bg-teal-900/30 dark:ring-teal-500/40';

  const carriesFiles = (e) => {
    const types = e?.dataTransfer?.types;
    if (!types) return false;
    if (typeof types.includes === 'function') return types.includes('Files');
    for (let i = 0; i < types.length; i += 1) {
      if (types[i] === 'Files') return true;
    }
    return false;
  };

  const handleDragEnter = (e) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setDragActive(true);
  };
  const handleDragOver = (e) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.dataTransfer.dropEffect = 'copy';
    } catch {
      /* read-only on some browsers */
    }
  };
  const handleDragLeave = (e) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragActive(false);
  };
  const handleDrop = (e) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setDragActive(false);
    const list = e.dataTransfer?.files;
    if (list && list.length) {
      onPick(list);
    }
  };

  // `accept` is optional now: if omitted or empty, the input accepts any file
  // so the picker can grab PDFs, images, videos, archives, etc. in one go.
  const acceptAttr = Array.isArray(accept) && accept.length ? accept.join(',') : undefined;

  return (
    <div
      className={`rounded-xl border border-dashed ${pad} ${dragActive ? dragShell : shell} transition-colors`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={`flex flex-col ${compact ? 'gap-2.5' : 'gap-3'}`}>
        <div className="flex gap-3">
          <div className={`flex ${iconBox} shrink-0 items-center justify-center ${iconWrap}`}>
            {isImage ? <IconImage className={iconSz} /> : <IconDoc className={iconSz} />}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p
              className={`font-semibold text-slate-900 dark:text-slate-100 ${compact ? 'text-sm' : 'text-[15px]'}`}
            >
              {label}
            </p>
            <p
              className={`mt-0.5 text-pretty text-slate-600 dark:text-slate-400 ${compact ? 'text-xs leading-snug' : 'text-[13px] leading-snug'}`}
            >
              {hint}
            </p>
          </div>
        </div>
        <label
          htmlFor={id}
          className={`flex w-full cursor-pointer items-center justify-center rounded-lg font-semibold text-white shadow-sm transition ${
            compact ? 'py-2 text-xs' : 'py-2.5 text-sm'
          } ${
            isImage
              ? 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-700 dark:hover:bg-violet-600'
              : 'erp-brand-fill'
          }`}
        >
          Choose files
        </label>
        <input
          id={id}
          type="file"
          multiple
          className="sr-only"
          accept={acceptAttr}
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {files.length > 0 ? (
        <ul
          className={`space-y-2 border-t border-slate-200/70 dark:border-teal-900/45 ${compact ? 'mt-3 pt-3' : 'mt-4 pt-4'}`}
        >
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/90 px-3 py-2.5 text-sm shadow-sm dark:border-teal-900/45 dark:bg-[#0f1820] dark:shadow-black/25"
            >
              <span className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-200">{f.name}</span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ErpModalSectionTitle({ children }) {
  return (
    <h3 className="border-b border-slate-200/90 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:border-teal-900/45 dark:text-slate-400">
      {children}
    </h3>
  );
}

/**
 * Default width for centered ERP dialogs: full-bleed on small screens, ~50–60%
 * viewport from `sm` up (with overlay `p-0 sm:p-4` so the panel can reach the edges).
 */
export const erpModalPanelMaxWidthClass =
  'max-w-full sm:max-w-[min(calc(100vw-2rem),max(21rem,56vw))]';

/** Modal panel — taller cap to reduce inner scroll; strong elevation */
export const erpModalPanelClass =
  `relative flex max-h-[min(94dvh,900px)] w-full ${erpModalPanelMaxWidthClass} flex-col overflow-hidden rounded-none border border-slate-300/90 bg-white shadow-[0_28px_90px_-20px_rgba(15,23,42,0.55)] ring-2 ring-slate-900/[0.07] ring-cyan-500/15 sm:rounded-2xl dark:border-teal-900/50 dark:bg-[#0e1824] dark:shadow-[0_28px_90px_-20px_rgba(0,0,0,0.65)] dark:ring-teal-950/30 dark:[background-image:none]`;

export const erpModalFooterClass =
  'flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-slate-200/90 bg-gradient-to-b from-white to-slate-50/95 px-4 py-3 shadow-[0_-8px_32px_-16px_rgba(15,23,42,0.1)] sm:gap-3 sm:px-6 sm:py-3.5 dark:border-teal-900/45 dark:bg-[#0a1218] dark:from-[#0a1218] dark:to-[#080f14] dark:shadow-none dark:[background-image:none]';

/** Single-row role / filter pills (directory picker, invite-as, meeting filters). */
export const ERP_COMPACT_FILTER_TABLIST_CLASS =
  'flex w-full min-w-0 flex-nowrap items-center gap-1 overflow-x-auto rounded-lg border border-slate-200/85 bg-slate-50/85 p-1 [scrollbar-width:thin] dark:border-teal-900/55 dark:bg-[#0c151c] dark:[background-image:none]';

export function erpCompactFilterTabClass(active) {
  return [
    'inline-flex shrink-0 items-center justify-center gap-0.5 rounded-md border px-2 py-0.5 text-[9px] font-bold leading-tight whitespace-nowrap transition sm:px-2.5 sm:text-[10px]',
    active
      ? 'border-[#103D4D]/50 erp-brand-fill text-white shadow-sm dark:border-teal-500/55 dark:text-teal-50'
      : 'border-slate-200/90 bg-white/95 text-slate-700 hover:border-slate-300 dark:border-teal-900/55 dark:bg-[#0f1620] dark:text-slate-200 dark:hover:border-teal-700/55',
  ].join(' ');
}
