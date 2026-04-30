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
        return DOMPurify.sanitize(v, EDITOR_SANITIZE);
      }
      const html = marked.parse(v, { async: false });
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
      return turndown.turndown(html).replace(/\u00a0/g, ' ').trim();
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
      insertH2() {
        runCmd(() => document.execCommand('formatBlock', false, 'h2'));
      },
      insertTextSnippet(text) {
        if (disabled) return;
        const t = String(text ?? '');
        if (!t) return;
        runCmd(() => document.execCommand('insertText', false, t));
      },
    }),
    [disabled, runCmd, focusEditor],
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

  const onPaste = useCallback(
    (e) => {
      e.preventDefault();
      const t = e.clipboardData.getData('text/plain');
      if (t) document.execCommand('insertText', false, t);
      emit();
    },
    [emit],
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
        {extraToolbar}
        <span className="ml-auto text-[10px] font-medium text-slate-400 dark:text-slate-500">
          Rich text · saved as markdown/HTML
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
          className={`relative z-[1] w-full min-h-[5rem] max-h-[min(420px,50vh)] resize-y overflow-y-auto rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-900 shadow-sm outline-none [scrollbar-width:thin] focus:border-sky-500/50 focus:ring-0 dark:border-teal-800/50 dark:bg-[#121f28] dark:text-slate-100 dark:shadow-black/25 dark:focus:border-teal-500/45 ${editorClassName} [&_a]:text-sky-600 [&_a]:underline dark:[&_a]:text-teal-300 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-sky-300 [&_blockquote]:pl-3 dark:[&_blockquote]:border-teal-600 [&_code]:break-all [&_code]:rounded [&_code]:bg-slate-100/90 [&_code]:px-1 [&_code]:text-[0.9em] [&_code]:font-mono dark:[&_code]:bg-teal-950/60 dark:[&_code]:text-teal-100 [&_h2]:text-xl [&_h2]:font-bold dark:[&_h2]:text-slate-50 [&_img]:h-auto [&_img]:max-w-full [&_p]:m-0 [&_p+_p]:mt-2 [&_pre]:max-w-full [&_pre]:whitespace-pre-wrap [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-slate-200 [&_pre]:bg-slate-100/90 dark:[&_pre]:border-teal-900/50 dark:[&_pre]:bg-[#0a1018]`}
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline
          data-placeholder={placeholder}
          onInput={emit}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
      </div>
    </div>
  );
});

export default MarkdownWysiwygEditor;
