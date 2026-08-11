'use client';

import dynamic from 'next/dynamic';

const RichTextEditor = dynamic(() => import('../rich-text/RichTextEditor'), {
  ssr: false,
  loading: () => (
    <div className="min-h-[5rem] animate-pulse rounded-2xl border border-slate-200 bg-slate-50 dark:border-teal-900/45 dark:bg-[#0c141c]" />
  ),
});

export default RichTextEditor;
