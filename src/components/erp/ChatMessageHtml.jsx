'use client';

import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

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
    'hr',
  ],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class'],
};

/** Renders stored markdown with safe HTML (project chat bodies). */
export default function ChatMessageHtml({ text, className = '' }) {
  const html = useMemo(() => {
    const raw = marked.parse(String(text || ''), { async: false });
    let sanitized = DOMPurify.sanitize(raw, SANITIZE);
    sanitized = sanitized.replace(/<a href=/gi, '<a target="_blank" rel="noopener noreferrer" href=');
    return sanitized;
  }, [text]);

  return (
    <div
      className={`chat-md min-w-0 max-w-full break-words [overflow-wrap:anywhere] text-slate-900 text-xs leading-relaxed [&_a]:break-all [&_a]:text-[#103D4D] [&_a]:underline [&_code]:break-all [&_code]:rounded [&_code]:bg-slate-100/90 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_code]:font-mono [&_img]:max-w-full [&_img]:h-auto [&_p]:break-words [&_p]:[overflow-wrap:anywhere] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-slate-200/80 [&_pre]:bg-slate-100/90 [&_pre]:p-2 [&_pre]:text-[11px] [&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere] [&_ul]:my-0.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-2.5 [&_blockquote]:text-slate-700 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
