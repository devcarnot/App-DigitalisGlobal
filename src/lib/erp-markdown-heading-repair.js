/**
 * When headings are created inside a list item (common contenteditable quirk),
 * Turndown emits lines like "-   # Title" which Marked renders as a bullet + heading.
 * Promote those lines to a real ATX heading.
 */
export function repairMarkdownListHeadingArtifacts(markdown) {
  const s = String(markdown || '');
  return s.replace(/^[ \t]*[*+-][ \t]{2,}(#[ \t]*[^\n]+)$/gm, '$1');
}

/** Regex fallback: unwrap <ul><li><hN>…</hN></li></ul> (single item, single heading). */
function unwrapListOnlyHeadingHtmlRegex(html) {
  let out = String(html || '');
  let prev = '';
  let guard = 0;
  while (prev !== out && guard++ < 12) {
    prev = out;
    out = out.replace(
      /<(ul|ol)[^>]*>\s*<li[^>]*>\s*(<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>)\s*<\/li>\s*<\/\1>/gi,
      '$2',
    );
  }
  return out;
}

/**
 * Unwrap list wrappers that only contain one heading block so Turndown saves `# Title`
 * instead of `-   # Title`.
 */
export function unwrapListOnlyHeadingHtml(html) {
  const s = String(html || '').trim();
  if (!s) return s;
  if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
    try {
      const doc = new window.DOMParser().parseFromString(`<div id="erp-wysiwyg-unwrap-root">${s}</div>`, 'text/html');
      const root = doc.getElementById('erp-wysiwyg-unwrap-root');
      if (!root) return unwrapListOnlyHeadingHtmlRegex(s);
      let changed = true;
      let guard = 0;
      while (changed && guard++ < 32) {
        changed = false;
        const lists = [...root.querySelectorAll('ul, ol')];
        for (const list of lists) {
          if (!list.parentNode) continue;
          const lis = [...list.children].filter((c) => c.tagName === 'LI');
          if (lis.length !== 1) continue;
          const li = lis[0];
          const kids = [...li.children];
          if (kids.length !== 1) continue;
          const h = kids[0];
          if (!/^H[1-6]$/i.test(h.tagName)) continue;
          list.parentNode.replaceChild(h, list);
          changed = true;
        }
      }
      return root.innerHTML;
    } catch {
      /* fall through */
    }
  }
  return unwrapListOnlyHeadingHtmlRegex(s);
}
