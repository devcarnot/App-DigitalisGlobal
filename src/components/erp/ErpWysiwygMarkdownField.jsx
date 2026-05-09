'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy wrapper around `MarkdownWysiwygEditor`.
 *
 * The underlying editor pulls in `isomorphic-dompurify` (which transitively
 * loads `jsdom`) and `turndown`, both of which are heavy and only useful
 * once a user actually focuses an editor. By exposing the editor through a
 * `dynamic` import we keep the workspace shell, project list, task modals,
 * etc. free of that bundle until the first time someone needs to type a
 * rich-text description. Saves ~250–300KB of JS on every cold page load.
 *
 * `ssr: false` is intentional: the editor needs `window` and a real DOM to
 * boot, and during SSR we'd just render an empty placeholder anyway.
 */
const MarkdownWysiwygEditor = dynamic(() => import('../MarkdownWysiwygEditor'), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden
      className="h-32 w-full animate-pulse rounded-2xl border border-slate-200 bg-slate-100/70 dark:border-teal-800/50 dark:bg-[#121f28]"
    />
  ),
});

export default MarkdownWysiwygEditor;
