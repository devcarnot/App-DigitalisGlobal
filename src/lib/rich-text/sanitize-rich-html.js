export const RICH_TEXT_ALLOWED_TAGS = [
  'p',
  'br',
  'div',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'del',
  's',
  'strike',
  'u',
  'ins',
  'mark',
  'sup',
  'sub',
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
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'colgroup',
  'col',
  'caption',
  'figure',
  'figcaption',
  'input',
];

export const RICH_TEXT_ALLOWED_ATTR = [
  'href',
  'title',
  'target',
  'rel',
  'class',
  'style',
  'src',
  'alt',
  'width',
  'height',
  'loading',
  'decoding',
  'colspan',
  'rowspan',
  'type',
  'checked',
  'disabled',
  'data-language',
];

const ALLOWED_STYLE_PROPS = new Set([
  'background-color',
  'color',
  'text-align',
  'font-weight',
  'font-style',
  'text-decoration',
]);

const COLOR_VALUE =
  /^(?:#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)|[a-zA-Z]+)$/;

const ALIGN_VALUE = /^(?:left|right|center|justify|start|end)$/;

const WEIGHT_VALUE = /^(?:normal|bold|bolder|lighter|[1-9]00)$/;

const DECORATION_VALUE = /^(?:none|underline|line-through|overline)$/;

const BASE_CONFIG = {
  ALLOWED_TAGS: RICH_TEXT_ALLOWED_TAGS,
  ALLOWED_ATTR: RICH_TEXT_ALLOWED_ATTR,
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel):|data:image\/(?:png|jpe?g|gif|webp|svg\+xml|avif);base64,)/i,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'base'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
};

let domPurifyInstance = null;
let hooksInstalled = false;

function sanitizeInlineStyle(styleRaw) {
  if (!styleRaw || typeof styleRaw !== 'string') return '';
  const out = [];
  for (const chunk of styleRaw.split(';')) {
    const idx = chunk.indexOf(':');
    if (idx <= 0) continue;
    const prop = chunk.slice(0, idx).trim().toLowerCase();
    const val = chunk.slice(idx + 1).trim();
    if (!ALLOWED_STYLE_PROPS.has(prop) || !val) continue;
    if (prop === 'background-color' || prop === 'color') {
      if (!COLOR_VALUE.test(val)) continue;
    } else if (prop === 'text-align') {
      if (!ALIGN_VALUE.test(val)) continue;
    } else if (prop === 'font-weight') {
      if (!WEIGHT_VALUE.test(val)) continue;
    } else if (prop === 'font-style') {
      if (!/^(?:normal|italic|oblique)$/.test(val)) continue;
    } else if (prop === 'text-decoration') {
      if (!DECORATION_VALUE.test(val)) continue;
    }
    out.push(`${prop}: ${val}`);
  }
  return out.join('; ');
}

function hookAfterSanitize(node) {
  if (!node || !node.querySelectorAll) return;
  node.querySelectorAll('a[target="_blank"]').forEach((a) => {
    const rel = String(a.getAttribute('rel') || '');
    const parts = new Set(rel.split(/\s+/).filter(Boolean));
    parts.add('noopener');
    parts.add('noreferrer');
    a.setAttribute('rel', [...parts].join(' '));
  });
  node.querySelectorAll('input').forEach((input) => {
    if (String(input.getAttribute('type') || '').toLowerCase() !== 'checkbox') {
      input.remove();
    }
  });
  node.querySelectorAll('img').forEach((img) => {
    const src = String(img.getAttribute('src') || '').trim();
    if (!src) img.remove();
  });
}

function ensureHooks(DOMPurify) {
  if (hooksInstalled || !DOMPurify || typeof DOMPurify.addHook !== 'function') return;
  hooksInstalled = true;
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'style') {
      data.attrValue = sanitizeInlineStyle(data.attrValue);
      if (!data.attrValue) data.keepAttr = false;
    }
  });
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    hookAfterSanitize(node);
  });
}

/** Lazy-load DOMPurify so API routes do not crash at module init on Vercel. */
function getDOMPurify() {
  if (domPurifyInstance) return domPurifyInstance;
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  const mod = require('isomorphic-dompurify');
  domPurifyInstance = mod.default || mod;
  ensureHooks(domPurifyInstance);
  return domPurifyInstance;
}

/** Strip Word/Outlook paste noise before sanitising. */
export function cleanupVendorPasteHtml(html) {
  let out = String(html || '');
  out = out.replace(/<!--\[if[\s\S]*?endif\]-->/gi, '');
  out = out.replace(/<o:p[^>]*>[\s\S]*?<\/o:p>/gi, '');
  out = out.replace(/\sclass="Mso[^"]*"/gi, '');
  out = out.replace(/\sstyle="[^"]*mso-[^"]*"/gi, '');
  out = out.replace(/<span[^>]*>\s*<\/span>/gi, '');
  out = out.replace(/<img\b[^>]*\ssrc\s*=\s*["']cid:[^"']*["'][^>]*\/?>/gi, '');
  out = out.replace(/<img\b(?![^>]*\ssrc\s*=)[^>]*\/?>/gi, '');
  out = out.replace(/\u00a0/g, ' ');
  return out;
}

const COMPOSER_FORBIDDEN_TAGS = new Set(['img', 'figure', 'figcaption', 'picture', 'video', 'audio', 'source']);

export function sanitizeRichHtml(html, { allowImages = true } = {}) {
  const cleaned = cleanupVendorPasteHtml(html);
  const allowedTags = allowImages
    ? RICH_TEXT_ALLOWED_TAGS
    : RICH_TEXT_ALLOWED_TAGS.filter((tag) => !COMPOSER_FORBIDDEN_TAGS.has(tag));
  try {
    const DOMPurify = getDOMPurify();
    return DOMPurify.sanitize(cleaned, {
      ...BASE_CONFIG,
      ALLOWED_TAGS: allowedTags,
    });
  } catch {
    return cleaned.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').trim();
  }
}

export function isRichHtmlEmpty(html) {
  const s = sanitizeRichHtml(html || '');
  const text = s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return !text;
}
