import { marked } from 'marked';
import { sanitizeRichHtml, isRichHtmlEmpty } from './sanitize-rich-html.js';

marked.setOptions({ breaks: true, gfm: true });

function escapeHtmlText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Turn plain text (with newlines) into safe editor/viewer HTML paragraphs. */
export function plainTextToRichHtml(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized.trim()) return '';
  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n');
      const inner = lines.map((line) => escapeHtmlText(line)).join('<br>');
      return inner ? `<p>${inner}</p>` : '<p><br></p>';
    })
    .join('');
}

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
  if (fmt === RICH_TEXT_FORMAT_HTML || looksLikeStoredHtml(raw)) {
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

function looksLikeStoredHtml(raw) {
  const s = String(raw || '').trimStart();
  return /^<(p|div|span|br|ul|ol|li|h[1-6]|blockquote|pre|table|strong|em|a)\b/i.test(s);
}

/** Render HTML for viewer (legacy markdown supported). */
export function contentToViewerHtml({ body, format }) {
  const fmt = normalizeFormat(format);
  const raw = String(body || '');
  if (!raw.trim()) return '';
  const storedAsHtml = fmt === RICH_TEXT_FORMAT_HTML || looksLikeStoredHtml(raw);
  if (fmt === RICH_TEXT_FORMAT_HTML && !looksLikeStoredHtml(raw)) {
    return sanitizeRichHtml(repairCollapsedPlainText(raw));
  }
  let html = storedAsHtml ? sanitizeRichHtml(raw) : markdownToHtmlForEditor(raw);
  if (isCollapsedRichHtml(html)) {
    html = repairCollapsedRichHtml(html);
  }
  return html;
}

function htmlBlockCount(html) {
  const s = String(html || '');
  if (!s.trim()) return 0;
  const blocks = s.match(/<(p|li|h[1-6]|blockquote|pre)\b/gi);
  return blocks ? blocks.length : 0;
}

/** True when stored HTML is one long wall of text with no line breaks. */
export function isCollapsedRichHtml(html) {
  const s = sanitizeRichHtml(html || '');
  if (!s.trim()) return false;
  if (/<br\s*\/?>/i.test(s)) return false;
  if (/<ul\b|<ol\b|<table\b|<blockquote\b|<pre\b|<h[1-6]\b/i.test(s)) return false;
  const pCount = (s.match(/<p\b/gi) || []).length;
  if (pCount > 1) return false;
  const plain = htmlToPlainText(s);
  if (!plain) return false;
  if (pCount === 0 && !/<ul\b|<ol\b|<h[1-6]\b/i.test(s) && plain.length >= 120) return true;
  // Legacy: one <p> with literal newline chars still in the HTML string.
  if (pCount <= 1 && /\n/.test(s) && !/<br/i.test(s)) return true;
  // Single paragraph paste with no structure.
  if (pCount <= 1 && plain.length >= 160) return true;
  return false;
}

/** Best-effort line breaks for legacy single-paragraph chat paste. */
export function repairCollapsedPlainText(text) {
  let t = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!t) return '';
  if (t.includes('\n')) return plainTextToRichHtml(t);

  if (/\s{3,}/.test(t)) {
    const parts = t.split(/\s{3,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return plainTextToRichHtml(parts.join('\n'));
    }
  }

  const byLabels = t.split(/\s+(?=[A-Z][A-Za-z0-9'’\-]*(?: [A-Z][A-Za-z0-9'’\-]*)*: )/);
  if (byLabels.length >= 2) {
    return plainTextToRichHtml(byLabels.map((p) => p.trim()).filter(Boolean).join('\n'));
  }

  if (t.length >= 280) {
    const sentences = t.split(/(?<=[.!?])\s+(?=[A-Z("(])/);
    if (sentences.length >= 3) {
      return plainTextToRichHtml(sentences.map((p) => p.trim()).filter(Boolean).join('\n'));
    }
  }

  return plainTextToRichHtml(t);
}

export function repairCollapsedRichHtml(html) {
  const s = sanitizeRichHtml(html || '');
  if (!isCollapsedRichHtml(s)) return s;
  return sanitizeRichHtml(repairCollapsedPlainText(htmlToPlainText(s)));
}

/** Returns repaired HTML when different from input (for DB backfill). */
export function maybeRepairStoredRichBody(body, format) {
  const fmt = normalizeFormat(format);
  const raw = String(body || '');
  if (!raw.trim()) return null;
  const prevHtml =
    fmt === RICH_TEXT_FORMAT_HTML || looksLikeStoredHtml(raw)
      ? sanitizeRichHtml(raw)
      : markdownToHtmlForEditor(raw);
  if (!isCollapsedRichHtml(prevHtml)) return null;
  const next = repairCollapsedRichHtml(prevHtml);
  if (!next || next === prevHtml) return null;
  return { body: next, format: RICH_TEXT_FORMAT_HTML };
}
