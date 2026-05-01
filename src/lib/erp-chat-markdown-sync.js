import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import TurndownService from 'turndown';
import { repairMarkdownListHeadingArtifacts, unwrapListOnlyHeadingHtml } from './erp-markdown-heading-repair';

marked.setOptions({ breaks: true, gfm: true });

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

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

/** Markdown string → sanitized HTML suitable for loading into contenteditable (same pipeline as bubble render). */
export function erpMarkdownToComposerHtml(markdown) {
  const mdFixed = repairMarkdownListHeadingArtifacts(String(markdown || ''));
  const raw = marked.parse(mdFixed, { async: false });
  let html = DOMPurify.sanitize(String(raw || ''), ERP_CHAT_EDITOR_SANITIZE);
  html = html.replace(/<a href=/gi, '<a target="_blank" rel="noopener noreferrer" href=');
  if (!html.trim() || html === '<p></p>') return '';
  return html;
}

/** Sanitized composer innerHTML → markdown for DB + ChatMessageHtml. */
export function erpHtmlToMarkdown(fragmentHtml) {
  const unwrapped = unwrapListOnlyHeadingHtml(String(fragmentHtml || ''));
  const cleaned = DOMPurify.sanitize(unwrapped, ERP_CHAT_EDITOR_SANITIZE);
  let md = turndown.turndown(cleaned || '').trim();
  md = repairMarkdownListHeadingArtifacts(md);
  md = md.replace(/\u00a0/g, ' ');
  return md || '';
}
