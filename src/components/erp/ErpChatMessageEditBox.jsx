'use client';

import { useCallback, useEffect, useRef } from 'react';

const MIN_EDIT_HEIGHT_PX = 72;
const MAX_EDIT_HEIGHT_PX = 420;

function syncTextareaHeight(el) {
  if (!el) return;
  el.style.height = 'auto';
  const cap =
    typeof window !== 'undefined'
      ? Math.min(window.innerHeight * 0.45, MAX_EDIT_HEIGHT_PX)
      : MAX_EDIT_HEIGHT_PX;
  const next = Math.max(MIN_EDIT_HEIGHT_PX, Math.min(el.scrollHeight, cap));
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > cap ? 'auto' : 'hidden';
}

/**
 * Inline message edit UI — auto-growing textarea like WhatsApp (not a tiny fixed box).
 */
export default function ErpChatMessageEditBox({
  value,
  onChange,
  onCancel,
  onSave,
  busy = false,
  mine = false,
}) {
  const textareaRef = useRef(null);

  const resize = useCallback(() => {
    syncTextareaHeight(textareaRef.current);
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  useEffect(() => {
    const id = requestAnimationFrame(resize);
    return () => cancelAnimationFrame(id);
  }, [resize]);

  const fieldClass = mine
    ? 'border-white/35 bg-black/20 text-white placeholder:text-white/45 focus:ring-white/30'
    : 'border-slate-300 bg-white text-slate-900 focus:ring-[#53bdeb]/40 dark:border-teal-900/50 dark:bg-[#0e1824] dark:text-[#e9edef]';

  const cancelClass = mine
    ? 'bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20'
    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-teal-900/50 dark:bg-[#0e1824] dark:text-slate-200 dark:hover:bg-[#152232]';

  return (
    <div className="min-w-[min(70vw,26rem)] max-w-full space-y-2.5" onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onInput={resize}
        disabled={busy}
        aria-label="Edit message"
        rows={1}
        autoFocus
        className={`block w-full resize-none rounded-lg border px-3 py-2.5 text-[14.2px] leading-[19px] outline-none focus:ring-2 ${fieldClass}`}
      />
      <div className={`flex flex-wrap gap-2 ${mine ? 'justify-end' : ''}`}>
        <button
          type="button"
          disabled={busy}
          onClick={() => onCancel?.()}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold ${cancelClass}`}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave?.()}
          className="rounded-lg bg-[#B2EBF2] px-3 py-1.5 text-xs font-bold text-[#0d3442] hover:bg-cyan-200 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
