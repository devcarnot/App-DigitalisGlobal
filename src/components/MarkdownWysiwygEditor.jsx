'use client';

import {
  useCallback,
  useLayoutEffect,
  useImperativeHandle,
  useMemo,
  forwardRef,
  useRef,
} from 'react';
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import TurndownService from 'turndown';
import { repairMarkdownListHeadingArtifacts, unwrapListOnlyHeadingHtml } from '../lib/erp-markdown-heading-repair';
import {
  collectImageFilesFromDataTransfer,
  imageFilesFromHtmlDataUrls,
  mergeUniqueFiles,
} from '../lib/erp-clipboard-images';

marked.setOptions({ breaks: true, gfm: true });

const EDITOR_SANITIZE = {
  ALLOWED_TAGS: [
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
  ],
  ALLOWED_ATTR: [
    'href',
    'title',
    'target',
    'rel',
    'class',
    'src',
    'alt',
    'width',
    'height',
    'loading',
    'decoding',
  ],
};

function escapeAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** Block-ish nodes we may turn into H1–H5 or split around a partial heading */
const WYSIWYG_BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'BLOCKQUOTE',
  'PRE',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);

function getWysiwygBlock(node, root) {
  if (!root || !node) return null;
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== root) {
    if (WYSIWYG_BLOCK_TAGS.has(el.tagName)) return el;
    el = el.parentElement;
  }
  return null;
}

/** True when the range covers the entire text+element contents of `block` (allows trailing BR quirks). */
function rangeCoversBlockContents(range, block) {
  if (!block || !range) return false;
  const nr = document.createRange();
  nr.selectNodeContents(block);
  const startCmp = range.compareBoundaryPoints(Range.START_TO_START, nr);
  const endCmp = range.compareBoundaryPoints(Range.END_TO_END, nr);
  return startCmp <= 0 && endCmp >= 0;
}

function replaceElementKeepingChildren(oldEl, newTag) {
  const next = document.createElement(newTag);
  while (oldEl.firstChild) next.appendChild(oldEl.firstChild);
  oldEl.parentNode.replaceChild(next, oldEl);
  return next;
}

const MarkdownWysiwygEditor = forwardRef(function MarkdownWysiwygEditor(
  {
    value,
    onChange,
    disabled = false,
    placeholder = '',
    resetKey,
    className = '',
    extraToolbar = null,
    /** Tailwind for the content area (e.g. min-h, font) */
    editorClassName = '',
    /**
     * Optional callback invoked when the user pastes one or more image
     * files (e.g. screenshot from clipboard). Should upload the file and
     * resolve to `{ url, alt? }`; the editor will then drop the image
     * inline at the caret. Returning `null` / throwing silently skips that
     * file. When omitted, image pastes are ignored (current behaviour).
     * @type {(file: File) => Promise<{ url: string, alt?: string } | null>=}
     */
    onImagePaste,
    /** Optional error reporter for image-paste failures. */
    onImagePasteError,
  },
  ref,
) {
  const editorRef = useRef(null);
  const turndown = useMemo(
    () =>
      new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
      }),
    [],
  );

  const initialHtmlFromStorage = useCallback(
    (raw) => {
      const v = String(raw || '').trim();
      if (!v) return '';
      if (v.startsWith('<')) {
        return DOMPurify.sanitize(unwrapListOnlyHeadingHtml(v), EDITOR_SANITIZE);
      }
      const mdFixed = repairMarkdownListHeadingArtifacts(v);
      const html = marked.parse(mdFixed, { async: false });
      return DOMPurify.sanitize(String(html), EDITOR_SANITIZE);
    },
    [],
  );

  const htmlToMarkdown = useCallback(
    (html) => {
      const raw = String(html || '')
        .replace(/^\s*<br\s*\/?>\s*$/i, '')
        .trim();
      if (!raw) return '';
      const normalized = unwrapListOnlyHeadingHtml(raw);
      let md = turndown.turndown(normalized).replace(/\u00a0/g, ' ').trim();
      md = repairMarkdownListHeadingArtifacts(md);
      return md;
    },
    [turndown],
  );

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    onChange(htmlToMarkdown(el.innerHTML));
  }, [onChange, htmlToMarkdown]);

  const focusEditor = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  const runCmd = useCallback(
    (fn) => {
      if (disabled) return;
      focusEditor();
      fn();
      emit();
    },
    [disabled, emit, focusEditor],
  );

  const insertHeadingLevel = useCallback(
    (level) => {
      if (disabled) return;
      const n = Math.min(5, Math.max(1, Math.floor(Number(level) || 1)));
      const tag = `h${n}`;
      const root = editorRef.current;
      if (!root) return;
      root.focus();
      const sel = typeof window !== 'undefined' ? window.getSelection() : null;
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return;

      const block = getWysiwygBlock(range.commonAncestorContainer, root);

      const applyExecFormatBlock = () => {
        const ok = document.execCommand('formatBlock', false, tag);
        if (!ok) {
          try {
            document.execCommand('formatBlock', false, `<${tag}>`);
          } catch {
            /* ignore */
          }
        }
      };

      // No structural block (e.g. bare text node): fall back to browser command
      if (!block) {
        applyExecFormatBlock();
        emit();
        return;
      }

      // Cursor only: turn the whole current block into a heading (matches common editor UX)
      if (range.collapsed) {
        if (/^H[1-6]$/i.test(block.tagName)) {
          replaceElementKeepingChildren(block, tag);
        } else {
          applyExecFormatBlock();
        }
        emit();
        return;
      }

      // Inside a list item: never replace the <li> node (would break the list). Use native formatting.
      if (block.tagName === 'LI') {
        if (rangeCoversBlockContents(range, block)) {
          applyExecFormatBlock();
        } else {
          const h = document.createElement(tag);
          try {
            range.surroundContents(h);
          } catch {
            const frag = range.extractContents();
            h.appendChild(frag);
            range.insertNode(h);
          }
          sel.removeAllRanges();
          const after = document.createRange();
          after.selectNodeContents(h);
          after.collapse(false);
          sel.addRange(after);
        }
        emit();
        return;
      }

      // Selection spans the entire block → replace block with Hn (reliable vs formatBlock)
      if (rangeCoversBlockContents(range, block)) {
        replaceElementKeepingChildren(block, tag);
        emit();
        return;
      }

      // Partial selection: wrap only that range. formatBlock would wrongly upgrade the whole <p>.
      const h = document.createElement(tag);
      try {
        range.surroundContents(h);
      } catch {
        const frag = range.extractContents();
        h.appendChild(frag);
        range.insertNode(h);
      }
      sel.removeAllRanges();
      const after = document.createRange();
      after.selectNodeContents(h);
      after.collapse(false);
      sel.addRange(after);
      emit();
    },
    [disabled, emit],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: () => focusEditor(),
      /** Insert a responsive image; stored as MD via Turndown (![](url)) */
      insertImageFromUrl(url, alt = '') {
        if (disabled) return;
        const u = String(url || '').trim();
        if (!u) return;
        const a = String(alt || '')
          .replace(/[\]\r\n]+/g, ' ')
          .trim();
        const safeU = escapeAttr(u);
        const safeA = escapeAttr(a);
        const img = `<p class="md-img-wrap"><img src="${safeU}" alt="${safeA}" class="max-w-full rounded-lg" loading="lazy" decoding="async" /></p>`;
        runCmd(() => {
          document.execCommand('insertHTML', false, DOMPurify.sanitize(img, EDITOR_SANITIZE));
        });
      },
      insertFencedCodeBlock() {
        if (disabled) return;
        const raw = (typeof window !== 'undefined' && window.getSelection()?.toString()) || 'code here';
        const safe = String(raw)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const block = `<pre class="my-1 rounded-lg border border-slate-200 bg-slate-100/90 p-2 font-mono text-xs"><code>${safe}</code></pre>`;
        runCmd(() => {
          document.execCommand('insertHTML', false, DOMPurify.sanitize(block, EDITOR_SANITIZE));
        });
      },
      insertHeading: (level) => insertHeadingLevel(level),
      insertH2: () => insertHeadingLevel(2),
      insertTextSnippet(text) {
        if (disabled) return;
        const t = String(text ?? '');
        if (!t) return;
        runCmd(() => document.execCommand('insertText', false, t));
      },
    }),
    [disabled, runCmd, focusEditor, insertHeadingLevel],
  );

  // Only re-apply from props when session identity changes (not every onChange)
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = initialHtmlFromStorage(value);
    // `value` is the loaded markdown/HTML for this resetKey only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, initialHtmlFromStorage]);

  const onKeyDown = useCallback(
    (e) => {
      if (disabled) return;
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'b') {
          e.preventDefault();
          document.execCommand('bold', false, null);
          emit();
        } else if (k === 'i') {
          e.preventDefault();
          document.execCommand('italic', false, null);
          emit();
        } else if (k === 'z' && !e.shiftKey) {
          e.preventDefault();
          document.execCommand('undo', false, null);
          emit();
        }
      }
    },
    [disabled, emit],
  );

  /** Reliable plain-text insert that prefers `execCommand('insertText')` and
   *  falls back to a Selection / Range insert if the browser ignores the
   *  legacy command (Firefox + a few embeded webviews). */
  const insertPlainTextAtCaret = useCallback((text) => {
    if (!text) return;
    const root = editorRef.current;
    if (!root) return;
    let ok = false;
    try {
      ok = document.execCommand('insertText', false, text);
    } catch {
      ok = false;
    }
    if (ok) return;
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!sel || sel.rangeCount === 0) {
      root.appendChild(document.createTextNode(text));
      return;
    }
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      root.appendChild(document.createTextNode(text));
      return;
    }
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.setEndAfter(node);
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  const insertImageHtmlAtCaret = useCallback((url, alt) => {
    const u = String(url || '').trim();
    if (!u) return;
    const safeAlt = String(alt || '')
      .replace(/[\]\r\n]+/g, ' ')
      .trim();
    const safeU = escapeAttr(u);
    const safeA = escapeAttr(safeAlt);
    const html = `<p class="md-img-wrap"><img src="${safeU}" alt="${safeA}" class="max-w-full rounded-lg" loading="lazy" decoding="async" /></p>`;
    const sanitized = DOMPurify.sanitize(html, EDITOR_SANITIZE);
    let ok = false;
    try {
      ok = document.execCommand('insertHTML', false, sanitized);
    } catch {
      ok = false;
    }
    if (ok) return;
    const root = editorRef.current;
    if (!root) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = sanitized;
    while (tmp.firstChild) root.appendChild(tmp.firstChild);
  }, []);

  const collectImageFiles = useCallback((dt) => collectImageFilesFromDataTransfer(dt), []);
  const pasteBusyRef = useRef(false);

  /** Upload a list of image files via `onImagePaste` and drop each resulting
   *  URL inline at the caret. Used by both paste and drop pipelines. */
  const insertImageFiles = useCallback(
    async (imageFiles) => {
      if (!imageFiles?.length) return;
      if (typeof onImagePaste !== 'function') {
        onImagePasteError?.(
          new Error("This editor doesn't support image upload — attach via the toolbar."),
        );
        return;
      }
      editorRef.current?.focus();
      // Kick off all uploads in parallel, but insert URLs at the caret in the
      // ORIGINAL paste order so the resulting markdown matches what the user
      // sees mentally. Total wall time is max(upload) instead of sum(upload).
      const uploads = imageFiles.map((f) =>
        Promise.resolve()
          .then(() => onImagePaste(f))
          .catch((err) => {
            onImagePasteError?.(err instanceof Error ? err : new Error(String(err)));
            return null;
          }),
      );
      for (const promise of uploads) {
        const result = await promise;
        if (result?.url) {
          insertImageHtmlAtCaret(result.url, result.alt);
        }
      }
      emit();
    },
    [emit, insertImageHtmlAtCaret, onImagePaste, onImagePasteError],
  );

  /** Paste handler.
   *
   *  Order of precedence:
   *  1. Image files in the clipboard (e.g. screenshot) → call
   *     `onImagePaste` for each, then drop the resulting URLs inline.
   *  2. Rich (text/html) clipboard → preventDefault and insert just the
   *     `text/plain` projection so the editor stays markdown-friendly.
   *  3. Otherwise (plain text / nothing) → let the browser do its native
   *     text paste; this is by far the most reliable path and avoids the
   *     deprecated `execCommand('insertText')` entirely. */
  const onPaste = useCallback(
    async (e) => {
      if (disabled || pasteBusyRef.current) return;
      const dt = e.clipboardData;
      if (!dt) return;

      let imageFiles = collectImageFiles(dt);
      const html = dt.getData('text/html') || '';
      if (!imageFiles.length && html) {
        imageFiles = imageFilesFromHtmlDataUrls(html);
      }
      imageFiles = mergeUniqueFiles(imageFiles);
      if (imageFiles.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        pasteBusyRef.current = true;
        try {
          await insertImageFiles(imageFiles);
        } finally {
          pasteBusyRef.current = false;
        }
        return;
      }

      // Rich text → strip to plain text so we don't import junky MS-Word /
      // browser-rendered styles into the markdown editor.
      if (html) {
        const text = dt.getData('text/plain') || dt.getData('text/uri-list') || '';
        e.preventDefault();
        if (text) insertPlainTextAtCaret(text);
        emit();
        return;
      }
      // Plain text → let the browser handle it natively (most reliable).
      // We still emit() on next tick so the markdown state stays in sync.
      setTimeout(() => emit(), 0);
    },
    [collectImageFiles, disabled, emit, insertImageFiles, insertPlainTextAtCaret],
  );

  /** Drop handler — same shape as paste for image files. We always
   *  preventDefault when files are involved so the browser doesn't navigate
   *  the tab to the dropped file URL (which is what the user sees as
   *  "image opened in a new browser tab"). */
  const onDragOver = useCallback((e) => {
    if (disabled) return;
    const types = e.dataTransfer?.types;
    const hasFiles =
      types && (typeof types.includes === 'function' ? types.includes('Files') : Array.from(types).includes('Files'));
    if (hasFiles) {
      e.preventDefault();
      try {
        e.dataTransfer.dropEffect = 'copy';
      } catch {
        /* read-only on some browsers */
      }
    }
  }, [disabled]);

  const onDrop = useCallback(
    async (e) => {
      if (disabled) return;
      const dt = e.dataTransfer;
      if (!dt) return;
      const imageFiles = mergeUniqueFiles(collectImageFiles(dt));
      if (imageFiles.length === 0 && (!dt.files || dt.files.length === 0)) {
        // No files — let the browser handle text drops natively.
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (imageFiles.length > 0) {
        await insertImageFiles(imageFiles);
        return;
      }
      // Non-image file drops are surfaced as a hint; the description editor
      // is image-only, but the parent modal usually also has a "Files /
      // media" picker the user can use instead.
      onImagePasteError?.(
        new Error('Only images can be dropped into the description. Use "Files / media" for other files.'),
      );
    },
    [collectImageFiles, disabled, insertImageFiles, onImagePasteError],
  );

  return (
    <div className={`w-full min-w-0 ${className}`}>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCmd(() => document.execCommand('bold', false, null))}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-slate-100/90 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-200/90 disabled:opacity-50 dark:border-teal-800/50 dark:bg-[#1a2832] dark:text-teal-100 dark:shadow-none dark:hover:bg-[#243540]"
          title="Bold (Ctrl+B)"
        >
          B
        </button>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCmd(() => document.execCommand('italic', false, null))}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-slate-100/90 text-xs font-bold italic text-slate-700 shadow-sm hover:bg-slate-200/90 disabled:opacity-50 dark:border-teal-800/50 dark:bg-[#1a2832] dark:text-teal-100 dark:shadow-none dark:hover:bg-[#243540]"
          title="Italic (Ctrl+I)"
        >
          I
        </button>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCmd(() => document.execCommand('strikeThrough', false, null))}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-slate-100/90 text-xs font-bold line-through text-slate-600 shadow-sm hover:bg-slate-200/90 disabled:opacity-50 dark:border-teal-800/50 dark:bg-[#1a2832] dark:text-teal-200/85 dark:shadow-none dark:hover:bg-[#243540]"
          title="Strikethrough"
        >
          S
        </button>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            runCmd(() => {
              const text = (window.getSelection() && window.getSelection().toString()) || 'code';
              const safe = String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
              document.execCommand('insertHTML', false, `<code>${safe}</code>`);
            })
          }
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-slate-100/90 text-[10px] font-mono font-bold text-slate-600 shadow-sm hover:bg-slate-200/90 disabled:opacity-50 dark:border-teal-800/50 dark:bg-[#1a2832] dark:text-teal-200/85 dark:shadow-none dark:hover:bg-[#243540]"
          title="Inline code"
        >
          {'</>'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (disabled) return;
            const href = window.prompt('Link URL (https://…)', 'https://');
            if (href == null) return;
            const trimmed = href.trim();
            if (!trimmed) return;
            runCmd(() => {
              document.execCommand('createLink', false, trimmed);
            });
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-slate-100/90 text-slate-600 shadow-sm hover:bg-slate-200/90 disabled:opacity-50 dark:border-teal-800/50 dark:bg-[#1a2832] dark:text-teal-200/85 dark:shadow-none dark:hover:bg-[#243540]"
          title="Link"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.172-1.172m0-7.656l1.172-1.172a4 4 0 115.656 5.656l-3 3a4 4 0 01-5.656 0" />
          </svg>
        </button>
        <span className="hidden h-5 w-px shrink-0 self-center bg-slate-200/90 sm:inline-block dark:bg-teal-900/55" aria-hidden />
        {[1, 2, 3, 4, 5].map((lvl) => (
          <button
            key={`h${lvl}`}
            type="button"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertHeadingLevel(lvl)}
            className="flex h-8 min-w-[1.65rem] shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-slate-100/90 px-1 text-[10px] font-bold text-slate-700 shadow-sm hover:bg-slate-200/90 disabled:opacity-50 dark:border-teal-800/50 dark:bg-[#1a2832] dark:text-teal-100 dark:shadow-none dark:hover:bg-[#243540]"
            title={`Heading ${lvl}`}
          >
            H{lvl}
          </button>
        ))}
        <span className="hidden h-5 w-px shrink-0 self-center bg-slate-200/90 sm:inline-block dark:bg-teal-900/55" aria-hidden />
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCmd(() => document.execCommand('formatBlock', false, 'blockquote'))}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-slate-100/90 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-200/90 disabled:opacity-50 dark:border-teal-800/50 dark:bg-[#1a2832] dark:text-teal-200/85 dark:shadow-none dark:hover:bg-[#243540]"
          title="Quote"
        >
          &gt;
        </button>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCmd(() => document.execCommand('insertUnorderedList', false, null))}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-slate-100/90 text-slate-600 shadow-sm hover:bg-slate-200/90 disabled:opacity-50 dark:border-teal-800/50 dark:bg-[#1a2832] dark:text-teal-200/85 dark:shadow-none dark:hover:bg-[#243540]"
          title="Bullet list"
        >
          <span className="text-sm leading-none">•</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCmd(() => document.execCommand('insertOrderedList', false, null))}
          className="flex h-8 min-w-[1.65rem] shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-slate-100/90 px-1 text-[10px] font-bold text-slate-600 shadow-sm hover:bg-slate-200/90 disabled:opacity-50 dark:border-teal-800/50 dark:bg-[#1a2832] dark:text-teal-200/85 dark:shadow-none dark:hover:bg-[#243540]"
          title="Numbered list"
        >
          1.
        </button>
        {extraToolbar}
        <span className="ml-auto text-[10px] font-medium text-slate-400 dark:text-slate-500">
          {onImagePaste ? 'Paste or drop images · saved as markdown' : 'Rich text · saved as markdown'}
        </span>
      </div>
      <div className="relative w-full">
        {placeholder && !String(value || '').trim() ? (
          <p className="pointer-events-none absolute left-4 top-3 z-0 text-sm text-slate-400/90 dark:text-slate-500" aria-hidden>
            {placeholder}
          </p>
        ) : null}
        <div
          ref={editorRef}
          className={`erp-md-content relative z-[1] w-full min-h-[5rem] max-h-[min(420px,50vh)] resize-y overflow-y-auto rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-900 shadow-sm outline-none [scrollbar-width:thin] focus:border-sky-500/50 focus:ring-0 dark:border-teal-800/50 dark:bg-[#121f28] dark:text-slate-100 dark:shadow-black/25 dark:focus:border-teal-500/45 ${editorClassName} [&_a]:text-sky-600 [&_a]:underline dark:[&_a]:text-teal-300 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-sky-300 [&_blockquote]:pl-3 dark:[&_blockquote]:border-teal-600 [&_code]:break-all [&_code]:rounded [&_code]:bg-slate-100/90 [&_code]:px-1 [&_code]:text-[0.9em] [&_code]:font-mono dark:[&_code]:bg-teal-950/60 dark:[&_code]:text-teal-100 [&_img]:h-auto [&_img]:max-w-full [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-0.5 [&_p]:m-0 [&_p+_p]:mt-2 [&_pre]:max-w-full [&_pre]:whitespace-pre-wrap [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-slate-200 [&_pre]:bg-slate-100/90 dark:[&_pre]:border-teal-900/50 dark:[&_pre]:bg-[#0a1018]`}
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline
          data-placeholder={placeholder}
          onInput={emit}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onDragOver={onDragOver}
          onDrop={onDrop}
        />
      </div>
    </div>
  );
});

export default MarkdownWysiwygEditor;
