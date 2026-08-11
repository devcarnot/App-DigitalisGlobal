'use client';

import ErpRichTextField from './ErpWysiwygMarkdownField';

/**
 * Inline message edit UI with TipTap rich text (replaces auto-growing textarea).
 */
export default function ErpChatMessageEditBox({
  value,
  format = 'markdown',
  onChange,
  onCancel,
  onSave,
  busy = false,
  mine = false,
}) {
  const cancelClass = mine
    ? 'bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20'
    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-teal-900/50 dark:bg-[#0e1824] dark:text-slate-200 dark:hover:bg-[#152232]';

  return (
    <div className="min-w-[min(70vw,26rem)] max-w-full space-y-2.5" onClick={(e) => e.stopPropagation()}>
      <ErpRichTextField
        value={value}
        format={format}
        onChange={onChange}
        disabled={busy}
        placeholder="Edit message…"
        minHeight="4.5rem"
        showToolbar={false}
        variant="compact"
        className={mine ? 'border-white/35 bg-black/20' : ''}
        editorClassName={mine ? 'text-white placeholder:text-white/45' : 'dark:text-[#e9edef]'}
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
