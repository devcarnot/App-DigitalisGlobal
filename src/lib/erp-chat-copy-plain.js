import { unescapeMarkdownLinkTarget } from './erp-markdown-links';
import { parseForwardForDisplay } from './erp-forward-message';

/** GFM autolinks stored as `<https://…>` — must become plain URLs before HTML strip. */
const ANGLE_URL_RE = /<((?:https?|mailto|tel):[^>\s]+)>/gi;

const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

const HTML_ANCHOR_RE = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

/**
 * Plain text for clipboard copy from a stored chat message body (markdown/HTML mix).
 * Preserves URLs from autolinks, markdown links, and HTML anchors.
 */
export function chatMessageBodyToCopyPlain(body) {
  const forwardInfo = parseForwardForDisplay(body);
  let text = forwardInfo ? forwardInfo.innerBody : String(body || '');

  text = text.replace(ANGLE_URL_RE, (_, url) => unescapeMarkdownLinkTarget(url));

  text = text.replace(MD_LINK_RE, (_, label, url) => {
    const cleanUrl = unescapeMarkdownLinkTarget(url);
    const cleanLabel = String(label || '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .trim();
    if (!cleanLabel || cleanLabel === cleanUrl) return cleanUrl;
    return `${cleanLabel} (${cleanUrl})`;
  });

  text = text.replace(HTML_ANCHOR_RE, (_, href, inner) => {
    const cleanHref = unescapeMarkdownLinkTarget(href);
    const label = String(inner)
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!label || label === cleanHref) return cleanHref;
    return `${label} (${cleanHref})`;
  });

  text = text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\u00a0/g, ' ');

  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
