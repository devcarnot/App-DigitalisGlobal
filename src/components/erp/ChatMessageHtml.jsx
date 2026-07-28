'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { repairMarkdownListHeadingArtifacts } from '../../lib/erp-markdown-heading-repair';
import { normalizeMarkdownLinks, unescapeMarkdownLinkTarget } from '../../lib/erp-markdown-links';
import { parseForwardForDisplay } from '../../lib/erp-forward-message';
import {
  ERP_WA_READ_MORE_COLLAPSED_MAX_H,
  ERP_WA_READ_MORE_MAX_CHARS,
  ERP_WA_READ_MORE_MAX_LINES,
} from '../../lib/erp-whatsapp-chat-styles';
import { allowNativeLinkContextMenu } from '../../lib/erp-chat-link-context';

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
    'img',
  ],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class', 'src', 'alt', 'loading', 'decoding'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,)/i,
};

const ANCHOR_REWRITE = /<a href=/gi;
const IMAGE_URL_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)(?:\?|#|$)/i;
const PARSE_CACHE_MAX = 512;
const parsedHtmlCache = new Map();

let markedPromise;

async function getMarkedParser() {
  if (!markedPromise) {
    markedPromise = import('marked').then(({ marked }) => {
      marked.setOptions({ breaks: true, gfm: true });
      return marked;
    });
  }
  return markedPromise;
}

function plainPreview(text) {
  const safe = String(text || '');
  return safe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

function shouldCollapseChatText(text, maxChars, maxLines) {
  const raw = String(text || '')
    .split('\n')
    .map((line) => line.replace(/^(?:>\s*)+/, '').trim())
    .filter(Boolean)
    .join('\n');
  if (!raw) return false;
  if (raw.length > maxChars) return true;
  return raw.split('\n').length > maxLines;
}

function isEffectivelyEmptyHtml(html) {
  const stripped = String(html || '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<blockquote>\s*<\/blockquote>/gi, '')
    .replace(/\s+/g, '');
  return !stripped;
}

async function renderChatMarkdownHtml(displayText) {
  const key = String(displayText || '');
  const cached = parsedHtmlCache.get(key);
  if (cached) return cached;

  try {
    const [{ default: DOMPurify }, marked] = await Promise.all([
      import('isomorphic-dompurify'),
      getMarkedParser(),
    ]);
    const mdFixed = normalizeMarkdownLinks(repairMarkdownListHeadingArtifacts(key));
    const raw = marked.parse(mdFixed, { async: false });
    let sanitized = DOMPurify.sanitize(raw, SANITIZE);
    sanitized = sanitized.replace(
      /<a\b([^>]*)\bhref="([^"]*)"([^>]*)>/gi,
      (full, before, href, after) => {
        const clean = unescapeMarkdownLinkTarget(href);
        return clean === href ? full : `<a${before}href="${clean}"${after}>`;
      },
    );
    sanitized = sanitized.replace(ANCHOR_REWRITE, '<a target="_blank" rel="noopener noreferrer" href=');
    if (isEffectivelyEmptyHtml(sanitized)) {
      sanitized = plainPreview(key);
    }
    if (parsedHtmlCache.size >= PARSE_CACHE_MAX) {
      const oldest = parsedHtmlCache.keys().next().value;
      parsedHtmlCache.delete(oldest);
    }
    parsedHtmlCache.set(key, sanitized);
    return sanitized;
  } catch {
    return plainPreview(key);
  }
}

function ChatMessageHtml({
  text,
  className = '',
  onMediaOpen,
  readMore = false,
  readMoreMaxChars = ERP_WA_READ_MORE_MAX_CHARS,
  readMoreMaxLines = ERP_WA_READ_MORE_MAX_LINES,
  readMoreCollapsedMaxH = ERP_WA_READ_MORE_COLLAPSED_MAX_H,
  readMoreClassName = 'text-[#103D4D] dark:text-teal-300',
}) {
  const forwardInfo = useMemo(() => parseForwardForDisplay(text), [text]);
  const displayText = useMemo(
    () => (forwardInfo ? forwardInfo.innerBody : String(text || '')),
    [forwardInfo, text],
  );
  const [html, setHtml] = useState(() => plainPreview(displayText));
  const [expanded, setExpanded] = useState(false);
  const wrapperRef = useRef(null);
  const needsCollapse = useMemo(
    () => readMore && shouldCollapseChatText(displayText, readMoreMaxChars, readMoreMaxLines),
    [readMore, displayText, readMoreMaxChars, readMoreMaxLines],
  );
  const collapsed = needsCollapse && !expanded;

  useEffect(() => {
    let alive = true;
    void renderChatMarkdownHtml(displayText).then((sanitized) => {
      if (alive) setHtml(sanitized);
    });
    return () => {
      alive = false;
    };
  }, [displayText]);

  useEffect(() => {
    setExpanded(false);
  }, [displayText]);

  const onClick = useCallback(
    (e) => {
      if (typeof onMediaOpen !== 'function') return;
      const target = e.target;
      if (!(target instanceof Element)) return;

      const img = target.closest('img');
      if (img && wrapperRef.current?.contains(img)) {
        const src = img.getAttribute('src');
        if (src) {
          e.preventDefault();
          e.stopPropagation();
          onMediaOpen({ url: src, kind: 'image', name: img.getAttribute('alt') || '' });
        }
        return;
      }
      const anchor = target.closest('a');
      if (anchor && wrapperRef.current?.contains(anchor)) {
        const href = anchor.getAttribute('href') || '';
        if (IMAGE_URL_RE.test(href)) {
          e.preventDefault();
          e.stopPropagation();
          onMediaOpen({
            url: href,
            kind: 'image',
            name: (anchor.textContent || '').trim() || '',
          });
        }
      }
    },
    [onMediaOpen],
  );

  const onContextMenu = useCallback((e) => {
    allowNativeLinkContextMenu(e);
  }, []);

  return (
    <div className="min-w-0 max-w-full">
      {forwardInfo ? (
        <div className="mb-1.5 w-full rounded-md border-l-[3px] border-[#53bdeb]/80 bg-black/[0.06] px-2 py-1 text-[11px] leading-snug text-inherit dark:border-[#53bdeb]/70 dark:bg-black/25">
          <span className="italic opacity-90">Forwarded from </span>
          <span className="font-semibold not-italic">{forwardInfo.senderName}</span>
        </div>
      ) : null}
      {displayText.trim() ? (
        <>
          <div className="relative">
            <div
              ref={wrapperRef}
              onClick={onClick}
              onContextMenu={onContextMenu}
              className={`chat-md erp-md-content min-w-0 max-w-full select-text break-words [overflow-wrap:anywhere] text-xs leading-relaxed text-inherit [&_p]:break-words [&_p]:text-inherit [&_p]:[overflow-wrap:anywhere] [&_li]:text-inherit [&_strong]:text-inherit [&_em]:text-inherit [&_a]:break-all [&_a]:cursor-pointer [&_a]:text-[#103D4D] [&_a]:underline dark:[&_a]:text-teal-300 [&_code]:break-all [&_code]:rounded [&_code]:bg-slate-100/90 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_code]:font-mono dark:[&_code]:bg-slate-900/80 dark:[&_code]:text-teal-100 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:border [&_img]:border-slate-200/80 [&_img]:bg-white [&_img]:cursor-zoom-in dark:[&_img]:border-teal-900/45 dark:[&_img]:bg-[#0e1824] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-slate-200/80 [&_pre]:bg-slate-100/90 [&_pre]:p-2 [&_pre]:text-[11px] [&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere] dark:[&_pre]:border-teal-900/50 dark:[&_pre]:bg-slate-950/80 dark:[&_pre]:text-slate-200 [&_ul]:my-0.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-2.5 [&_blockquote]:text-inherit dark:[&_blockquote]:border-teal-800 dark:[&_blockquote]:text-inherit ${collapsed ? `${readMoreCollapsedMaxH} overflow-hidden` : ''} ${className}`}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
          {needsCollapse ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className={`mt-1 rounded px-0.5 text-[11px] font-bold underline underline-offset-2 outline-none hover:opacity-90 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#53bdeb]/60 ${readMoreClassName}`}
            >
              {expanded ? 'Read less' : 'Read more'}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default memo(ChatMessageHtml);
