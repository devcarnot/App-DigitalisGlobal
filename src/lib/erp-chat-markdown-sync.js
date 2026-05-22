import { repairMarkdownListHeadingArtifacts, unwrapListOnlyHeadingHtml } from './erp-markdown-heading-repair';
import { normalizeMarkdownLinks, unescapeMarkdownLinkTarget } from './erp-markdown-links';

/**
 * Markdown ⇄ sanitized HTML round-tripping for the chat composer.
 *
 * `marked`, `isomorphic-dompurify`, and `turndown` are all heavy modules —
 * `isomorphic-dompurify` in particular drags in `jsdom` when imported on
 * the server. To keep the SSR bundle (and Turbopack on Windows) happy and
 * to make first-paint of `/erp/messages` cheap, we defer those imports to
 * the first time the composer mounts in the browser.
 *
 * Public API stays synchronous (`erpMarkdownToComposerHtml`,
 * `erpHtmlToMarkdown`); calls made before the deps finish loading return a
 * plain-text fallback. The composer pre-warms the loader on mount so by
 * the time a user types or pastes, the libs are ready.
 */

/** HTML allowed inside the composer (browser + marked); sanitized before markdown round-trip. */
export const ERP_CHAT_EDITOR_SANITIZE = {
  ALLOWED_TAGS: [
    'p',
    'div',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'del',
    's',
    'strike',
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
    'span',
  ],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class'],
};

let _marked = null;
let _DOMPurify = null;
let _turndown = null;
/** @type {Promise<boolean> | null} */
let _readyPromise = null;

function isClient() {
  return typeof window !== 'undefined';
}

/**
 * Pre-warms the heavy markdown deps on the client. Returns a Promise that
 * resolves to `true` when the deps are ready (or `false` on the server).
 *
 * Idempotent — call this in a `useEffect` on every consumer mount.
 */
export function prepareErpChatMarkdown() {
  if (!isClient()) return Promise.resolve(false);
  if (_readyPromise) return _readyPromise;

  _readyPromise = (async () => {
    const [markedMod, dompurifyMod, turndownMod] = await Promise.all([
      import('marked'),
      import('isomorphic-dompurify'),
      import('turndown'),
    ]);
    _marked = markedMod.marked || markedMod.default || markedMod;
    if (typeof _marked.setOptions === 'function') {
      _marked.setOptions({ breaks: true, gfm: true });
    }
    _DOMPurify = dompurifyMod.default || dompurifyMod;
    const TurndownService = turndownMod.default || turndownMod;
    _turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
    _turndown.addRule('angleBracketAutolink', {
      filter(node) {
        return node.nodeName === 'A' && Boolean(node.getAttribute('href'));
      },
      replacement(content, node) {
        const href = unescapeMarkdownLinkTarget(node.getAttribute('href') || '');
        const text = String(content || '').trim();
        if (text === href.trim() || text === decodeURI(href)) {
          return `<${href}>`;
        }
        return `[${content}](${href})`;
      },
    });
    return true;
  })().catch((err) => {
    // If the dynamic import fails (e.g. offline), let a future call retry.
    _readyPromise = null;
    throw err;
  });

  return _readyPromise;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Markdown string → sanitized HTML suitable for loading into contenteditable. */
export function erpMarkdownToComposerHtml(markdown) {
  const mdFixed = normalizeMarkdownLinks(repairMarkdownListHeadingArtifacts(String(markdown || '')));
  if (!_marked || !_DOMPurify) {
    // Deps haven't finished loading — render a safe escaped fallback so the
    // composer never shows raw HTML. The consumer should call
    // `prepareErpChatMarkdown` and re-render once it resolves.
    if (typeof window !== 'undefined') void prepareErpChatMarkdown();
    const escaped = escapeHtml(mdFixed).replace(/\n/g, '<br/>');
    return escaped ? `<p>${escaped}</p>` : '';
  }
  const raw = _marked.parse(mdFixed, { async: false });
  let html = _DOMPurify.sanitize(String(raw || ''), ERP_CHAT_EDITOR_SANITIZE);
  html = html.replace(/<a href=/gi, '<a target="_blank" rel="noopener noreferrer" href=');
  if (!html.trim() || html === '<p></p>') return '';
  return html;
}

/** Sanitized composer innerHTML → markdown for DB + ChatMessageHtml. */
export function erpHtmlToMarkdown(fragmentHtml) {
  const unwrapped = unwrapListOnlyHeadingHtml(String(fragmentHtml || ''));
  if (!_DOMPurify || !_turndown) {
    if (typeof window !== 'undefined') void prepareErpChatMarkdown();
    // Strip tags and return text as a best-effort fallback.
    return unwrapped
      .replace(/<br\s*\/?>(\s*)/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\u00a0/g, ' ')
      .trim();
  }
  const cleaned = _DOMPurify.sanitize(unwrapped, ERP_CHAT_EDITOR_SANITIZE);
  let md = _turndown.turndown(cleaned || '').trim();
  md = normalizeMarkdownLinks(repairMarkdownListHeadingArtifacts(md));
  md = md.replace(/\u00a0/g, ' ');
  return md || '';
}

/** True once the heavy deps have been loaded into module scope. */
export function isErpChatMarkdownReady() {
  return Boolean(_marked && _DOMPurify && _turndown);
}
