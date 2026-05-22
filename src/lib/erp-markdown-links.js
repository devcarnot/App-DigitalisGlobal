/**
 * Keep pasted URLs (Google Drive, etc.) intact in chat markdown.
 * Turndown often emits `[url](url)` with `\(` escapes; Marked then treats `_` in paths as emphasis.
 */

/** Remove Turndown/Markdown escape backslashes before `(` and `)` in link targets. */
export function unescapeMarkdownLinkTarget(url) {
  return String(url || '').replace(/\\([()\\])/g, '$1');
}

/**
 * Trim trailing punctuation that was likely typed after the URL, not part of it.
 * @param {string} url
 */
function trimTrailingUrlPunctuation(url) {
  let u = String(url);
  let suffix = '';
  // Closing paren only when the URL has unbalanced open parens (common in prose, rare in Drive links).
  while (u.endsWith(')')) {
    const opens = (u.match(/\(/g) || []).length;
    const closes = (u.match(/\)/g) || []).length;
    if (closes <= opens) break;
    suffix = `)${suffix}`;
    u = u.slice(0, -1);
  }
  const m = u.match(/([.,;:!?]+)$/);
  if (m && !u.includes('(')) {
    suffix = m[1] + suffix;
    u = u.slice(0, -m[1].length);
  }
  return { url: u, suffix };
}

/**
 * Normalize markdown before storage or before `marked.parse`.
 * - `[https://…](https://…)` → `<https://…>` (no broken `\(` in Drive links)
 * - bare `https://…` → `<https://…>` (underscores in path stay literal)
 * @param {string} markdown
 */
export function normalizeMarkdownLinks(markdown) {
  let s = String(markdown || '');

  s = s.replace(/\[([^\]]*)\]\(((?:[^)\\]|\\[\\()])+)\)/g, (_, text, url) => {
    const cleanUrl = unescapeMarkdownLinkTarget(url);
    const cleanText = unescapeMarkdownLinkTarget(text);
    if (
      cleanText === cleanUrl ||
      text.trim() === url.trim() ||
      text.trim() === cleanUrl.trim()
    ) {
      return `<${cleanUrl}>`;
    }
    return `[${text}](${cleanUrl})`;
  });

  const BARE_URL_RE = /(?<!<)(?<!\]\()https?:\/\/[^\s<>\]]+/gi;
  s = s.replace(BARE_URL_RE, (match) => {
    const { url, suffix } = trimTrailingUrlPunctuation(match);
    if (!url) return match;
    return `<${url}>${suffix}`;
  });

  return s;
}
