'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseForwardForDisplay } from '../../lib/erp-forward-message';
import {
  ERP_WA_READ_MORE_COLLAPSED_MAX_H,
  ERP_WA_READ_MORE_MAX_CHARS,
  ERP_WA_READ_MORE_MAX_LINES,
} from '../../lib/erp-whatsapp-chat-styles';
import { handleChatLinkContextMenu } from '../../lib/erp-chat-link-context';
import { isDigitalisDesktop } from '../../lib/digitalis-desktop';
import ErpChatLinkContextMenu from './ErpChatLinkContextMenu';
import RichTextViewer from '../rich-text/RichTextViewer';
import { htmlToPlainText } from '../../lib/rich-text/rich-text-format';

const IMAGE_URL_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)(?:\?|#|$)/i;

function shouldCollapseChatText(text, maxChars, maxLines) {
  const raw = htmlToPlainText(text) || String(text || '')
    .split('\n')
    .map((line) => line.replace(/^(?:>\s*)+/, '').trim())
    .filter(Boolean)
    .join('\n');
  if (!raw) return false;
  if (raw.length > maxChars) return true;
  return raw.split('\n').length > maxLines;
}

function ChatMessageHtml({
  text,
  format = 'markdown',
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
  const [expanded, setExpanded] = useState(false);
  const [linkMenu, setLinkMenu] = useState(null);
  const wrapperRef = useRef(null);
  const needsCollapse = useMemo(
    () => readMore && shouldCollapseChatText(displayText, readMoreMaxChars, readMoreMaxLines),
    [readMore, displayText, readMoreMaxChars, readMoreMaxLines],
  );
  const collapsed = needsCollapse && !expanded;

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
    handleChatLinkContextMenu(e, {
      isDesktop: isDigitalisDesktop(),
      onDesktopLinkMenu: setLinkMenu,
    });
  }, []);

  const viewerClass =
    `chat-md min-w-0 max-w-full select-text break-words [overflow-wrap:anywhere] text-xs leading-relaxed text-inherit [&_p]:my-0 [&_p+p]:mt-2 [&_br]:leading-relaxed [&_p]:break-words [&_p]:text-inherit [&_a]:break-all [&_a]:cursor-pointer [&_a]:text-[#103D4D] [&_a]:underline dark:[&_a]:text-teal-300 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:border [&_img]:border-slate-200/80 [&_img]:cursor-zoom-in dark:[&_img]:border-teal-900/45 ${collapsed ? `${readMoreCollapsedMaxH} overflow-hidden` : ''} ${className}`;

  return (
    <div className="min-w-0 max-w-full">
      <ErpChatLinkContextMenu menu={linkMenu} onClose={() => setLinkMenu(null)} />
      {forwardInfo ? (
        <div className="mb-1.5 w-full rounded-md border-l-[3px] border-[#53bdeb]/80 bg-black/[0.06] px-2 py-1 text-[11px] leading-snug text-inherit dark:border-[#53bdeb]/70 dark:bg-black/25">
          <span className="italic opacity-90">Forwarded from </span>
          <span className="font-semibold not-italic">{forwardInfo.senderName}</span>
        </div>
      ) : null}
      {displayText.trim() ? (
        <>
          <div className="relative" ref={wrapperRef} onClick={onClick} onContextMenu={onContextMenu}>
            <RichTextViewer body={displayText} format={format} className={viewerClass} compact />
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
