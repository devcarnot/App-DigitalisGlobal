/**
 * Minimal, zero-dependency content renderer for the public Blog page.
 *
 * Authors write in the admin editor using either plain text / markdown-lite
 * or raw HTML. This helper produces sanitized HTML we can feed into
 * dangerouslySetInnerHTML on the public site.
 *
 * Supported syntax (auto-detected when the content does not already contain
 * block-level HTML tags):
 *   # H1 / ## H2 / ### H3 headings
 *   - bullet list items
 *   1. numbered list items
 *   > blockquote
 *   `inline code`
 *   ```fenced code blocks```
 *   **bold**, *italic*, [link](https://…)
 *   ---- horizontal rule
 *   blank line separates paragraphs
 */

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

function applyInline(s) {
  let out = escapeHtml(s);
  // `inline code`
  out = out.replace(/`([^`]+)`/g, '<code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-800">$1</code>');
  // **bold**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // ~~strike~~
  out = out.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  // *italic* (skip when matching **)
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // ![alt](url) inline image — must run before the link rule
  out = out.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_m, alt, href) => {
    const safeHref = href.replace(/"/g, '&quot;');
    const safeAlt = String(alt || '').replace(/"/g, '&quot;');
    return `<img src="${safeHref}" alt="${safeAlt}" class="my-6 w-full rounded-2xl border border-slate-200 object-cover" loading="lazy" />`;
  });
  // [link](url)
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, href) => {
    const safeHref = href.replace(/"/g, '&quot;');
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="text-sky-600 underline decoration-sky-300 underline-offset-2 hover:text-sky-700">${label}</a>`;
  });
  return out;
}

function renderMarkdownLite(src) {
  const lines = String(src).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let buf = [];
  let mode = 'p'; // p | ul | ol | quote | code
  let codeLang = '';

  const flush = () => {
    if (!buf.length) return;
    if (mode === 'p') {
      const joined = buf.join(' ').trim();
      if (joined) blocks.push(`<p class="mb-5 leading-7 text-slate-700">${applyInline(joined)}</p>`);
    } else if (mode === 'ul') {
      blocks.push(
        `<ul class="mb-5 list-disc space-y-2 pl-5 text-slate-700 marker:text-sky-500">${buf
          .map((l) => `<li class="leading-7">${applyInline(l)}</li>`)
          .join('')}</ul>`,
      );
    } else if (mode === 'ol') {
      blocks.push(
        `<ol class="mb-5 list-decimal space-y-2 pl-5 text-slate-700 marker:text-sky-500">${buf
          .map((l) => `<li class="leading-7">${applyInline(l)}</li>`)
          .join('')}</ol>`,
      );
    } else if (mode === 'quote') {
      const joined = buf.join(' ').trim();
      blocks.push(
        `<blockquote class="my-6 rounded-r-xl border-l-4 border-sky-400/80 bg-sky-50/70 px-5 py-3 italic text-slate-700">${applyInline(
          joined,
        )}</blockquote>`,
      );
    } else if (mode === 'code') {
      const safe = escapeHtml(buf.join('\n'));
      blocks.push(
        `<pre class="mb-6 overflow-x-auto rounded-xl bg-slate-900/95 p-4 text-[13px] leading-relaxed text-slate-100"><code>${safe}</code></pre>`,
      );
    }
    buf = [];
  };

  for (const raw of lines) {
    const line = raw ?? '';
    if (mode === 'code') {
      if (/^```/.test(line.trim())) {
        flush();
        mode = 'p';
        codeLang = '';
      } else {
        buf.push(line);
      }
      continue;
    }

    if (/^```/.test(line.trim())) {
      flush();
      mode = 'code';
      codeLang = line.trim().replace(/^```/, '');
      continue;
    }

    if (/^\s*$/.test(line)) {
      flush();
      mode = 'p';
      continue;
    }

    let m;
    if ((m = line.match(/^(#{1,5})\s+(.*)$/))) {
      flush();
      const level = m[1].length;
      const text = applyInline(m[2].trim());
      const sizes = {
        1: 'mt-8 mb-4 text-3xl font-bold text-slate-900',
        2: 'mt-8 mb-3 text-2xl font-bold text-slate-900',
        3: 'mt-6 mb-2 text-xl font-semibold text-slate-900',
        4: 'mt-5 mb-2 text-lg font-semibold text-slate-900',
        5: 'mt-4 mb-1.5 text-base font-semibold text-slate-900',
      };
      blocks.push(`<h${level} class="${sizes[level]}">${text}</h${level}>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      if (mode !== 'ul') {
        flush();
        mode = 'ul';
      }
      buf.push(line.replace(/^\s*[-*]\s+/, ''));
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      if (mode !== 'ol') {
        flush();
        mode = 'ol';
      }
      buf.push(line.replace(/^\s*\d+\.\s+/, ''));
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      if (mode !== 'quote') {
        flush();
        mode = 'quote';
      }
      buf.push(line.replace(/^\s*>\s?/, ''));
      continue;
    }

    if (/^\s*-{3,}\s*$/.test(line)) {
      flush();
      blocks.push('<hr class="my-8 border-t border-slate-200" />');
      mode = 'p';
      continue;
    }

    if (mode !== 'p') {
      flush();
      mode = 'p';
    }
    buf.push(line);
  }
  flush();
  return blocks.join('\n');
}

function sanitizeHtml(html) {
  return String(html)
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

export function renderBlogContent(raw) {
  const str = String(raw ?? '').trim();
  if (!str) return '';
  const looksLikeHtml = /<(p|div|section|article|h[1-6]|ul|ol|blockquote|pre|figure|table)\b/i.test(str);
  if (looksLikeHtml) return sanitizeHtml(str);
  return renderMarkdownLite(str);
}

export function estimateReadMinutes(raw) {
  const words = String(raw || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function blogPostCoverUrl(post) {
  if (!post) return null;
  if (post.cover_image_url) return post.cover_image_url;
  if (post.cover_image_path) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    if (!base) return null;
    return `${base.replace(/\/$/, '')}/storage/v1/object/public/blog-images/${post.cover_image_path}`;
  }
  return null;
}

export function blogSlugFromTitle(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 96);
}
