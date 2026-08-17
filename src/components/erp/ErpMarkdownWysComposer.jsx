'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import RichTextEditor from '../rich-text/RichTextEditor';
import { contentToEditorHtml } from '../../lib/rich-text/rich-text-format';
import { isRichHtmlEmpty, sanitizeRichHtml } from '../../lib/rich-text/sanitize-rich-html';
import { ERP_CHAT_COMPOSER_INPUT_CLASS } from '../../lib/erp-whatsapp-chat-styles';

const ErpMarkdownWysComposer = forwardRef(function ErpMarkdownWysComposer(
  {
    resetKey,
    initialMarkdown,
    onMarkdownChange,
    onEnterSubmit,
    onComposerInput,
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
  const editorRef = useRef(null);
  const htmlRef = useRef('');
  const formatRef = useRef('markdown');
  const initialMarkdownRef = useRef(initialMarkdown);
  initialMarkdownRef.current = initialMarkdown;

  const syncHtml = useCallback(
    (html) => {
      htmlRef.current = html;
      onMarkdownChange?.(html);
      queueMicrotask(() => onComposerInput?.());
    },
    [onMarkdownChange, onComposerInput],
  );

  useEffect(() => {
    const html = sanitizeRichHtml(
      contentToEditorHtml({ body: initialMarkdownRef.current || '', format: formatRef.current }),
      { allowImages: false },
    );
    htmlRef.current = html;
    const apply = () => {
      editorRef.current?.getEditor?.()?.commands.setContent(html || '<p></p>', false);
    };
    apply();
    requestAnimationFrame(apply);
  }, [resetKey]);

  const getEd = () => editorRef.current?.getEditor?.();

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editorRef.current?.focus?.(),
      insertPlainText: (text) => {
        if (!text || disabled) return;
        getEd()?.chain().focus().insertContent(text).run();
        syncHtml(getEd()?.getHTML() || '');
      },
      applyBold: () => getEd()?.chain().focus().toggleBold().run(),
      applyItalic: () => getEd()?.chain().focus().toggleItalic().run(),
      applyUnderline: () => getEd()?.chain().focus().toggleUnderline().run(),
      applyStrikethrough: () => getEd()?.chain().focus().toggleStrike().run(),
      applyUndo: () => getEd()?.chain().focus().undo().run(),
      applyRedo: () => getEd()?.chain().focus().redo().run(),
      applyRemoveFormat: () => getEd()?.chain().focus().clearNodes().unsetAllMarks().run(),
      applyInlineCode: () => getEd()?.chain().focus().toggleCode().run(),
      applyLinkFromPrompt: () => {
        const ed = getEd();
        if (!ed || disabled) return;
        const prev = ed.getAttributes('link').href || 'https://';
        const raw = typeof window !== 'undefined' ? window.prompt('Link URL', prev) : null;
        if (raw == null || !String(raw).trim()) return;
        ed.chain().focus().extendMarkRange('link').setLink({ href: String(raw).trim(), target: '_blank', rel: 'noopener noreferrer' }).run();
        syncHtml(ed.getHTML());
      },
      applyCodeBlock: () => getEd()?.chain().focus().toggleCodeBlock().run(),
      applyHorizontalRule: () => getEd()?.chain().focus().setHorizontalRule().run(),
      applyParagraph: () => getEd()?.chain().focus().setParagraph().run(),
      applyHeading: (level) => getEd()?.chain().focus().toggleHeading({ level }).run(),
      applyBulletList: () => getEd()?.chain().focus().toggleBulletList().run(),
      applyOrderedList: () => getEd()?.chain().focus().toggleOrderedList().run(),
      applyBlockquote: () => getEd()?.chain().focus().toggleBlockquote().run(),
      replaceMarkdown: (markdown) => {
        const html = contentToEditorHtml({ body: markdown || '', format: 'markdown' });
        getEd()?.commands.setContent(html || '<p></p>', false);
        syncHtml(getEd()?.getHTML() || '');
        editorRef.current?.focus?.();
      },
      getFormatState: () => {
        const ed = getEd();
        if (!ed) return {};
        return {
          bold: ed.isActive('bold'),
          italic: ed.isActive('italic'),
          underline: ed.isActive('underline'),
          strike: ed.isActive('strike'),
          code: ed.isActive('code'),
          blockquote: ed.isActive('blockquote'),
          bulletList: ed.isActive('bulletList'),
          orderedList: ed.isActive('orderedList'),
          h1: ed.isActive('heading', { level: 1 }),
          h2: ed.isActive('heading', { level: 2 }),
          h3: ed.isActive('heading', { level: 3 }),
          h4: ed.isActive('heading', { level: 4 }),
          h5: ed.isActive('heading', { level: 5 }),
          h6: ed.isActive('heading', { level: 6 }),
        };
      },
      flushMarkdown: () => syncHtml(getEd()?.getHTML() || ''),
      getEditableRoot: () => getEd()?.view?.dom || null,
    }),
    [disabled, syncHtml],
  );

  return (
    <div className={(embedded ? 'relative flex min-h-[44px] w-full min-w-0 flex-1 items-stretch ' : 'relative min-h-[44px] w-full min-w-0 flex-1 ') + className}>
      <RichTextEditor
        ref={editorRef}
        value=""
        format="markdown"
        layout={embedded ? 'composer' : 'default'}
        onChange={(html) => {
          htmlRef.current = html;
          if (isRichHtmlEmpty(html)) onMarkdownChange?.('');
          else onMarkdownChange?.(html);
          queueMicrotask(() => onComposerInput?.());
        }}
        placeholder={placeholder}
        variant="compact"
        showToolbar={false}
        disabled={disabled}
        minHeight={embedded ? undefined : '2.75rem'}
        submitOnEnter={Boolean(onEnterSubmit)}
        submitOnModEnter={Boolean(onEnterSubmit)}
        onSubmit={() => onEnterSubmit?.()}
        onKeyDown={onKeyDownProp}
        onPasteFiles={(files) => {
          if (files?.length) {
            if (onPaste) {
              const dt = new DataTransfer();
              files.forEach((f) => dt.items.add(f));
              onPaste({ clipboardData: dt, preventDefault: () => {}, stopPropagation: () => {} });
            }
          }
        }}
        allowImages={false}
        className={`w-full border-0 shadow-none ${embedded ? 'rounded-none bg-transparent dark:bg-transparent' : ''}`}
        editorClassName={`${ERP_CHAT_COMPOSER_INPUT_CLASS} w-full min-w-0 text-[15px] leading-snug sm:text-sm ${embedded ? 'px-0 py-1 dark:text-[#e9edef]' : ''}`}
        ariaLabel={placeholder}
      />
    </div>
  );
});

export default ErpMarkdownWysComposer;
