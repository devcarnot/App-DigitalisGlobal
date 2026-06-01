'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import {
  erpHtmlToMarkdown,
  erpMarkdownToComposerHtml,
  isErpChatMarkdownReady,
  prepareErpChatMarkdown,
} from '../../lib/erp-chat-markdown-sync';
import { collectImageFilesFromDataTransfer } from '../../lib/erp-clipboard-images';
import { applyHeadingToSelection, applyParagraphToSelection, handleShiftEnterInHeading, readComposerFormatState } from '../../lib/erp-wysiwyg-selection';

/**
 * WYSIWYG chat composer: edits rich text in-place; stores markdown via onMarkdownChange.
 * Compatible with ChatMessageHtml / DB body format.
 */
const ErpMarkdownWysComposer = forwardRef(function ErpMarkdownWysComposer(
  {
    resetKey,
    initialMarkdown,
    onMarkdownChange,
    onEnterSubmit,
    /** Fired after caret/body sync (typing, click, keyup) — use for @mention position. */
    onComposerInput,
    /** Parent key handler (e.g. mention navigation) — runs before Enter-to-send. */
    onKeyDown: onKeyDownProp,
    onPaste,
    disabled,
    placeholder = 'Write a message…',
    className = '',
    embedded = false,
    'aria-invalid': ariaInvalid,
  },
  ref,
) {
  const editableRef = useRef(null);
  const selectionBookmarkRef = useRef(null);
  const emitTimerRef = useRef(null);

  const emitMarkdownNow = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    const txt = String(el.innerText || '').trim();
    if (!txt.replace(/\ufeff|\u200b/g, '')) {
      el.innerHTML = '';
      onMarkdownChange?.('');
      queueMicrotask(() => onComposerInput?.());
      return;
    }
    const md = erpHtmlToMarkdown(el.innerHTML);
    onMarkdownChange?.(md);
    queueMicrotask(() => onComposerInput?.());
  }, [onMarkdownChange, onComposerInput]);

  const emitMarkdownDebounced = useCallback(() => {
    if (emitTimerRef.current) clearTimeout(emitTimerRef.current);
    emitTimerRef.current = setTimeout(() => {
      emitTimerRef.current = null;
      emitMarkdownNow();
    }, 64);
  }, [emitMarkdownNow]);

  useEffect(
    () => () => {
      if (emitTimerRef.current) clearTimeout(emitTimerRef.current);
    },
    [],
  );

  /** Only reflow HTML when switching conversations (resetKey). Never sync controlled draft every keystroke. */
  const initialMarkdownRef = useRef(initialMarkdown);
  initialMarkdownRef.current = initialMarkdown;

  useLayoutEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    const html = erpMarkdownToComposerHtml(initialMarkdownRef.current || '');
    el.innerHTML = html || '';
  }, [resetKey]);

  // Pre-warm the markdown round-trip libs (`marked`, `DOMPurify`, `turndown`)
  // on first mount. They are dynamically imported so the SSR / Turbopack
  // bundle stays small. If the initial paint used the plain-text fallback
  // (deps not ready yet), upgrade the editor's HTML once they finish loading.
  useEffect(() => {
    if (isErpChatMarkdownReady()) return undefined;
    let alive = true;
    prepareErpChatMarkdown()
      .then((ready) => {
        if (!alive || !ready) return;
        const el = editableRef.current;
        if (!el) return;
        const initial = initialMarkdownRef.current || '';
        if (!initial) return;
        const html = erpMarkdownToComposerHtml(initial);
        if (html && el.innerHTML !== html) {
          el.innerHTML = html;
        }
      })
      .catch(() => {
        /* swallow — fallback rendering already handled the body */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    const onInput = () => emitMarkdownDebounced();
    el.addEventListener('input', onInput);
    return () => el.removeEventListener('input', onInput);
  }, [emitMarkdownDebounced]);

  function saveSelectionBookmark() {
    const el = editableRef.current;
    const sel = window.getSelection();
    if (!el || !sel?.rangeCount || !el.contains(sel.anchorNode)) return;
    try {
      selectionBookmarkRef.current = sel.getRangeAt(0).cloneRange();
    } catch {
      /* ignore invalid ranges */
    }
  }

  function focusEditor() {
    editableRef.current?.focus({ preventScroll: true });
  }

  function restoreSelection() {
    const el = editableRef.current;
    const bookmark = selectionBookmarkRef.current;
    if (!el || !bookmark) return false;
    try {
      const sel = window.getSelection();
      if (!sel) return false;
      sel.removeAllRanges();
      sel.addRange(bookmark);
      return el.contains(sel.anchorNode);
    } catch {
      return false;
    }
  }

  useEffect(() => {
    const el = editableRef.current;
    if (!el) return undefined;
    const save = () => saveSelectionBookmark();
    el.addEventListener('keyup', save);
    el.addEventListener('mouseup', save);
    el.addEventListener('focus', save);
    return () => {
      el.removeEventListener('keyup', save);
      el.removeEventListener('mouseup', save);
      el.removeEventListener('focus', save);
    };
  }, []);

  /** Run formatting in the editable; sync markdown after DOM updates. */
  function execAndSync(exec) {
    const el = editableRef.current;
    if (!el || disabled) return;
    focusEditor();
    restoreSelection();
    try {
      exec();
    } catch {
      // ignore unsupported execCommand
    }
    emitMarkdownNow();
  }

  useImperativeHandle(
    ref,
    () => ({
      focus: focusEditor,
      insertPlainText: (text) => {
        if (!text || disabled) return;
        execAndSync(() => {
          const ok = document.execCommand?.('insertText', false, text);
          if (!ok && editableRef.current) {
            const sel = window.getSelection();
            if (!sel?.rangeCount) return;
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(text));
          }
        });
      },
      applyBold: () => execAndSync(() => document.execCommand?.('bold', false)),
      applyItalic: () => execAndSync(() => document.execCommand?.('italic', false)),
      applyUnderline: () => execAndSync(() => document.execCommand?.('underline', false)),
      applyStrikethrough: () => execAndSync(() => document.execCommand?.('strikeThrough', false)),
      applyUndo: () => execAndSync(() => document.execCommand?.('undo', false)),
      applyRedo: () => execAndSync(() => document.execCommand?.('redo', false)),
      applyRemoveFormat: () => execAndSync(() => document.execCommand?.('removeFormat', false)),
      applyInlineCode: () =>
        execAndSync(() => {
          const sel = window.getSelection();
          let t = 'code';
          if (sel && sel.rangeCount) t = sel.toString().trim() || 'code';
          const esc =
            typeof t !== 'undefined'
              ? String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
              : '';
          document.execCommand?.('insertHTML', false, `<code>${esc}</code>`);
        }),
      applyLinkFromPrompt: () => {
        if (disabled) return;
        restoreSelection();
        const raw =
          typeof window !== 'undefined' ? window.prompt('Link URL', 'https://') : null;
        if (raw == null || !String(raw).trim()) return;
        const url = String(raw).trim();
        execAndSync(() => {
          document.execCommand?.('createLink', false, url);
        });
      },
      applyCodeBlock: () =>
        execAndSync(() => {
          const sel = window.getSelection();
          let t = 'code';
          if (sel && sel.rangeCount) t = sel.toString().trim() || 'code';
          const esc = String(t)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
          document.execCommand?.('insertHTML', false, `<pre><code>${esc}</code></pre>`);
        }),
      applyHorizontalRule: () => execAndSync(() => document.execCommand?.('insertHorizontalRule', false)),
      applyParagraph: () => execAndSync(() => applyParagraphToSelection(editableRef.current)),
      /** Turn selection or current block into H1–H6 (partial selection stays partial). */
      applyHeading: (level) => {
        execAndSync(() => applyHeadingToSelection(editableRef.current, level));
      },
      applyBulletList: () => execAndSync(() => document.execCommand?.('insertUnorderedList', false)),
      applyOrderedList: () => execAndSync(() => document.execCommand?.('insertOrderedList', false)),
      applyBlockquote: () =>
        execAndSync(() => {
          const ok = document.execCommand?.('formatBlock', false, 'blockquote');
          if (!ok) {
            try {
              document.execCommand?.('formatBlock', false, '<blockquote>');
            } catch {
              /* ignore */
            }
          }
        }),
      replaceMarkdown: (markdown) => {
        const el = editableRef.current;
        if (!el) return;
        const clearing = !String(markdown ?? '').trim();
        if (disabled && !clearing) return;
        const html = erpMarkdownToComposerHtml(markdown || '');
        el.innerHTML = html || '';
        onMarkdownChange?.(erpHtmlToMarkdown(el.innerHTML));
        queueMicrotask(() => onComposerInput?.());
        focusEditor();
      },
      getFormatState: () => readComposerFormatState(editableRef.current),
      flushMarkdown: () => emitMarkdownNow(),
      getEditableRoot: () => editableRef.current,
    }),
    [disabled, emitMarkdownNow, onMarkdownChange, onComposerInput],
  );

  useEffect(() => {
    const el = editableRef.current;
    if (!el || !onComposerInput) return;
    const bump = () => queueMicrotask(() => onComposerInput());
    el.addEventListener('click', bump);
    el.addEventListener('keyup', bump);
    return () => {
      el.removeEventListener('click', bump);
      el.removeEventListener('keyup', bump);
    };
  }, [onComposerInput]);

  function onKeyDown(e) {
    onKeyDownProp?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'Enter' && e.shiftKey && !disabled) {
      const handled = handleShiftEnterInHeading(editableRef.current);
      if (handled) {
        e.preventDefault();
        emitMarkdownNow();
        return;
      }
    }
    if (onEnterSubmit && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onEnterSubmit();
    }
  }

  function onPasteCapture(e) {
    const imageFiles = collectImageFilesFromDataTransfer(e.clipboardData);
    if (imageFiles.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      onPaste?.(e);
      return;
    }

    const text =
      e.clipboardData?.getData('text/plain') ||
      e.clipboardData?.getData('text/uri-list') ||
      '';
    if (!text || disabled) return;
    const trimmed = text.trim();
    const singleUrl = /^https?:\/\/\S+$/i.test(trimmed);
    e.preventDefault();
    execAndSync(() => {
      if (singleUrl) {
        const esc = (s) =>
          String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        document.execCommand?.(
          'insertHTML',
          false,
          `<a href="${esc(trimmed)}" target="_blank" rel="noopener noreferrer">${esc(trimmed)}</a>`,
        );
      } else {
        document.execCommand?.('insertText', false, text);
      }
    });
  }

  return (
    <div
      className={
        (embedded ? 'relative flex min-h-8 w-full flex-1 items-center sm:min-h-10 ' : 'relative min-h-[44px] flex-1 ') +
        className
      }
    >
      <div
        ref={editableRef}
        role="textbox"
        aria-multiline="true"
        aria-invalid={ariaInvalid}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onKeyDown={onKeyDown}
        onPaste={onPasteCapture}
        className={[
          'erp-md-wys erp-md-content w-full cursor-text text-sm text-slate-900 outline-none',
        embedded
            ? 'my-auto max-h-32 w-full border-0 bg-transparent px-2 py-1.5 text-sm leading-snug focus:ring-0 dark:text-slate-200 sm:min-h-[40px] sm:max-h-36 sm:px-3 sm:py-2 sm:leading-normal'
            : 'min-h-[44px] max-h-36 rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2 text-sm focus:border-[#103D4D]/35 focus:ring-2 focus:ring-cyan-400/20 dark:border-teal-800/50 dark:bg-[#121a22] dark:text-slate-200 dark:focus:border-teal-500/40 dark:focus:ring-teal-500/20',
          '[&:empty]:before:text-slate-400 [&:empty]:before:content-[attr(data-placeholder)] dark:[&:empty]:before:text-slate-500',
          'max-h-36 overflow-y-auto [scrollbar-width:thin]',
          '[&_a]:text-[#103D4D] [&_a]:underline dark:[&_a]:text-teal-300',
          '[&_code]:rounded [&_code]:bg-slate-100/90 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[13px]',
          'dark:[&_code]:bg-white/10 dark:[&_code]:text-teal-100',
          '[&_strong]:font-bold [&_b]:font-bold',
          '[&_em]:italic [&_i]:italic',
          '[&_u]:underline',
          '[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5',
          '[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5',
          '[&_li]:my-0.5',
          '[&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 dark:[&_blockquote]:border-teal-700',
          '[&_h1]:text-lg [&_h1]:font-bold [&_h1]:leading-snug dark:[&_h1]:text-teal-50',
          '[&_h2]:text-base [&_h2]:font-bold [&_h2]:leading-snug dark:[&_h2]:text-teal-50',
          '[&_h3]:text-sm [&_h3]:font-bold [&_h3]:leading-snug dark:[&_h3]:text-teal-100',
          '[&_h4]:text-sm [&_h4]:font-semibold dark:[&_h4]:text-teal-100',
          '[&_h5]:text-xs [&_h5]:font-semibold dark:[&_h5]:text-teal-200',
          '[&_h6]:text-xs [&_h6]:font-medium dark:[&_h6]:text-teal-200',
          disabled ? 'opacity-50' : '',
        ].join(' ')}
      />
    </div>
  );
});

export default ErpMarkdownWysComposer;
