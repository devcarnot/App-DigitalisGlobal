'use client';

import { useEffect, useState } from 'react';
import { marked } from 'marked';
import { repairMarkdownListHeadingArtifacts } from '../../lib/erp-markdown-heading-repair';

marked.setOptions({
  breaks: true,
  gfm: true,
});

const SANITIZE = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'del',
    's',
    'code',
    'pre',
    'a',
    'ul',
    'ol',
    'li',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
  ],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class'],
};

const ANCHOR_REWRITE = /<a href=/gi;

/** Pre-render fallback that renders the raw text as a single paragraph
 *  (newlines preserved) without any HTML so SSR is safe and the user sees
 *  *something* before hydration upgrades it to formatted markdown. */
function plainPreview(text) {
  const safe = String(text || '');
  return safe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

/** Renders stored markdown with safe HTML (DM/group/project chat bodies).
 *
 *  We deliberately load DOMPurify with a dynamic import inside `useEffect`
 *  so the SSR bundle never has to pull in `jsdom`. SSR renders an escaped
 *  plain-text preview; the client upgrades to sanitized markdown after
 *  hydration. */
export default function ChatMessageHtml({ text, className = '' }) {
  const [html, setHtml] = useState(() => plainPreview(text));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { default: DOMPurify } = await import('isomorphic-dompurify');
        if (!alive) return;
        const mdFixed = repairMarkdownListHeadingArtifacts(String(text || ''));
        const raw = marked.parse(mdFixed, { async: false });
        let sanitized = DOMPurify.sanitize(raw, SANITIZE);
        sanitized = sanitized.replace(ANCHOR_REWRITE, '<a target="_blank" rel="noopener noreferrer" href=');
        if (alive) setHtml(sanitized);
      } catch {
        // If DOMPurify fails to load (rare), keep the safe plain-text preview
        // already in state instead of crashing the whole message list.
        if (alive) setHtml(plainPreview(text));
      }
    })();
    return () => {
      alive = false;
    };
  }, [text]);

  return (
    <div
      className={`chat-md erp-md-content min-w-0 max-w-full break-words [overflow-wrap:anywhere] text-xs leading-relaxed text-slate-900 dark:text-slate-200 [&_p]:break-words [&_p]:text-inherit [&_p]:[overflow-wrap:anywhere] [&_li]:text-inherit [&_strong]:text-inherit [&_a]:break-all [&_a]:text-[#103D4D] [&_a]:underline dark:[&_a]:text-teal-300 [&_code]:break-all [&_code]:rounded [&_code]:bg-slate-100/90 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_code]:font-mono dark:[&_code]:bg-slate-900/80 dark:[&_code]:text-teal-100 [&_img]:max-w-full [&_img]:h-auto [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-slate-200/80 [&_pre]:bg-slate-100/90 [&_pre]:p-2 [&_pre]:text-[11px] [&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere] dark:[&_pre]:border-teal-900/50 dark:[&_pre]:bg-slate-950/80 dark:[&_pre]:text-slate-200 [&_ul]:my-0.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-2.5 [&_blockquote]:text-slate-700 dark:[&_blockquote]:border-teal-800 dark:[&_blockquote]:text-slate-300 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
