'use client';

import dynamic from 'next/dynamic';

/** Lazy TipTap rich text field (replaces MarkdownWysiwygEditor). */
const ErpRichTextField = dynamic(() => import('../rich-text/RichTextEditor'), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden
      className="h-32 w-full animate-pulse rounded-2xl border border-slate-200 bg-slate-100/70 dark:border-teal-800/50 dark:bg-[#121f28]"
    />
  ),
});

export default ErpRichTextField;
