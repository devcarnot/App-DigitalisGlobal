'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import { erpHtmlToMarkdown, erpMarkdownToComposerHtml } from '../../lib/erp-chat-markdown-sync';

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
    'aria-invalid': ariaInvalid,
  },
  ref,
) {
  const editableRef = useRef(null);

  const emitMarkdown = useCallback(() => {
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

  /** Only reflow HTML when switching conversations (resetKey). Never sync controlled draft every keystroke. */
  const initialMarkdownRef = useRef(initialMarkdown);
  initialMarkdownRef.current = initialMarkdown;

  useLayoutEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    const html = erpMarkdownToComposerHtml(initialMarkdownRef.current || '');
    el.innerHTML = html || '';
  }, [resetKey]);

  useEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    const onInput = () => emitMarkdown();
    el.addEventListener('input', onInput);
    return () => el.removeEventListener('input', onInput);
  }, [emitMarkdown]);

  function focusEditor() {
    editableRef.current?.focus({ preventScroll: true });
  }

  /** Run formatting in the editable; sync markdown after DOM updates. */
  function execAndSync(exec) {
    const el = editableRef.current;
    if (!el || disabled) return;
    focusEditor();
    try {
      exec();
    } catch {
      // ignore unsupported execCommand
    }
    requestAnimationFrame(() => emitMarkdown());
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
      applyStrikethrough: () => execAndSync(() => document.execCommand?.('strikeThrough', false)),
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
        const raw =
          typeof window !== 'undefined' ? window.prompt('Link URL', 'https://') : null;
        if (raw == null || !String(raw).trim()) return;
        const url = String(raw).trim();
        execAndSync(() => {
          document.execCommand?.('createLink', false, url);
        });
      },
      replaceMarkdown: (markdown) => {
        const el = editableRef.current;
        if (!el || disabled) return;
        const html = erpMarkdownToComposerHtml(markdown || '');
        el.innerHTML = html || '';
        onMarkdownChange?.(erpHtmlToMarkdown(el.innerHTML));
        queueMicrotask(() => onComposerInput?.());
        focusEditor();
      },
      flushMarkdown: () => emitMarkdown(),
      getEditableRoot: () => editableRef.current,
    }),
    [disabled, emitMarkdown, onMarkdownChange, onComposerInput],
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
    if (onEnterSubmit && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onEnterSubmit();
    }
  }

  function onPasteCapture(e) {
    /** Let file/image paste reach parent handlers (attachments). */
    const items = e.clipboardData?.items ? Array.from(e.clipboardData.items) : [];
    const hasFiles = items.some((it) => it?.kind === 'file');
    onPaste?.(e);
    if (hasFiles) return;

    e.preventDefault();
    const text =
      e.clipboardData?.getData('text/plain') ||
      e.clipboardData?.getData('text/uri-list') ||
      '';
    if (!text || disabled) return;
    execAndSync(() => {
      document.execCommand?.('insertText', false, text);
    });
  }

  return (
    <div className={"relative min-h-[44px] flex-1 " + className}>
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
          'erp-md-wys min-h-[44px] w-full cursor-text rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2 text-sm text-slate-900 outline-none',
          'focus:border-[#103D4D]/35 focus:ring-2 focus:ring-cyan-400/20',
          'dark:border-teal-800/50 dark:bg-[#121a22] dark:text-slate-200',
          'dark:focus:border-teal-500/40 dark:focus:ring-teal-500/20',
          '[&:empty]:before:text-slate-400 [&:empty]:before:content-[attr(data-placeholder)] dark:[&:empty]:before:text-slate-500',
          'max-h-36 overflow-y-auto [scrollbar-width:thin]',
          '[&_a]:text-[#103D4D] [&_a]:underline dark:[&_a]:text-teal-300',
          '[&_code]:rounded [&_code]:bg-slate-100/90 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[13px]',
          'dark:[&_code]:bg-white/10 dark:[&_code]:text-teal-100',
          '[&_strong]:font-bold [&_b]:font-bold',
          '[&_em]:italic [&_i]:italic',
          disabled ? 'opacity-50' : '',
        ].join(' ')}
      />
    </div>
  );
});

export default ErpMarkdownWysComposer;
