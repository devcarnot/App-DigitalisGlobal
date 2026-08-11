import { marked } from 'marked';
import { sanitizeRichHtml, isRichHtmlEmpty } from './sanitize-rich-html';

marked.setOptions({ breaks: true, gfm: true });

export const RICH_TEXT_FORMAT_MARKDOWN = 'markdown';
export const RICH_TEXT_FORMAT_HTML = 'html';

export function normalizeFormat(raw) {
  return String(raw || '').toLowerCase() === RICH_TEXT_FORMAT_HTML
    ? RICH_TEXT_FORMAT_HTML
    : RICH_TEXT_FORMAT_MARKDOWN;
}

export function markdownToHtmlForEditor(markdown) {
  const md = String(markdown || '').trim();
  if (!md) return '';
  if (md.startsWith('<')) return sanitizeRichHtml(md);
  try {
    return sanitizeRichHtml(marked.parse(md));
  } catch {
    return '';
  }
}

export function htmlToPlainText(html) {
  const s = sanitizeRichHtml(html || '');
  if (!s) return '';
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Load stored content into the editor. */
export function contentToEditorHtml({ body, format }) {
  const fmt = normalizeFormat(format);
  const raw = String(body || '');
  if (!raw.trim()) return '';
  if (fmt === RICH_TEXT_FORMAT_HTML || raw.trimStart().startsWith('<')) {
    return sanitizeRichHtml(raw);
  }
  return markdownToHtmlForEditor(raw);
}

/** Prepare payload for persistence from editor HTML. */
export function prepareRichContentForSave(html) {
  const sanitized = sanitizeRichHtml(html || '');
  return {
    body: sanitized,
    format: RICH_TEXT_FORMAT_HTML,
    isEmpty: isRichHtmlEmpty(sanitized),
  };
}

/** Render HTML for viewer (legacy markdown supported). */
export function contentToViewerHtml({ body, format }) {
  const fmt = normalizeFormat(format);
  const raw = String(body || '');
  if (!raw.trim()) return '';
  if (fmt === RICH_TEXT_FORMAT_HTML || raw.trimStart().startsWith('<')) {
    return sanitizeRichHtml(raw);
  }
  return markdownToHtmlForEditor(raw);
}
