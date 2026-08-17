'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { common, createLowlight } from 'lowlight';
import RichTextToolbar from './RichTextToolbar';
import { cleanupVendorPasteHtml, sanitizeRichHtml } from '../../lib/rich-text/sanitize-rich-html';
import { contentToEditorHtml } from '../../lib/rich-text/rich-text-format';
import {
  collectImageFilesFromDataTransfer,
  imageFilesFromHtmlDataUrls,
  mergeUniqueFiles,
} from '../../lib/erp-clipboard-images';

const lowlight = createLowlight(common);

const URL_RE = /^https?:\/\/[^\s]+$/i;

function isTrivialPasteHtml(html, plain) {
  if (!html?.trim()) return true;
  const stripped = html
    .replace(/<meta[^>]*>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return stripped === String(plain || '').trim();
}

function insertPlainText(editor, text) {
  editor.chain().focus().insertContent(text).run();
}

function insertSanitizedHtml(editor, html, { allowImages = true } = {}) {
  const clean = sanitizeRichHtml(cleanupVendorPasteHtml(html), { allowImages });
  if (!clean) return;
  editor.chain().focus().insertContent(clean).run();
}

const RichTextEditor = forwardRef(function RichTextEditor(
  {
    value = '',
    format = 'markdown',
    onChange,
    placeholder = '',
    variant = 'full',
    disabled = false,
    className = '',
    editorClassName = '',
    minHeight = '5rem',
    showToolbar = true,
    submitOnEnter = false,
    submitOnModEnter = false,
    onSubmit,
    onImagePaste,
    onImagePasteError,
    onPasteFiles,
    /** When false, pasted/inline images are routed to onPasteFiles only (chat composer). */
    allowImages = true,
    /** Embedded chat composer: full width, resizable shell, no card chrome. */
    layout = 'default',
    onKeyDown,
    onFocus,
    onBlur,
    ariaLabel,
  },
  ref,
) {
  const [pasteChip, setPasteChip] = useState(null);
  const pasteRangeRef = useRef(null);
  const lastEmitted = useRef('');
  const suppressChangeRef = useRef(false);
  const editorRef = useRef(null);
  const contextRef = useRef(null);

  const handleImageFiles = useCallback(
    async (files, ed) => {
      const list = Array.isArray(files) ? files : files ? [files] : [];
      if (!list.length) return;
      if (onPasteFiles) {
        onPasteFiles(list);
        return;
      }
      if (!onImagePaste) return;
      for (const file of list) {
        try {
          const result = await onImagePaste(file, ed);
          const url = result?.url || (typeof result === 'string' ? result : null);
          if (url && ed) {
            ed.chain().focus().setImage({ src: url, alt: file.name || 'image' }).run();
          }
        } catch (e) {
          onImagePasteError?.(e);
        }
      }
    },
    [onImagePaste, onImagePasteError, onPasteFiles],
  );

  const emitChange = useCallback(
    (html) => {
      const next = sanitizeRichHtml(html || '', { allowImages });
      if (next === lastEmitted.current) return;
      lastEmitted.current = next;
      onChange?.(next);
    },
    [onChange, allowImages],
  );

  const extensions = [
    StarterKit.configure({
      codeBlock: false,
      horizontalRule: false,
      link: false,
      underline: false,
    }),
    Underline,
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    }),
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
    TaskList,
    TaskItem.configure({ nested: true }),
    CodeBlockLowlight.configure({ lowlight }),
    HorizontalRule,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Placeholder.configure({ placeholder }),
  ];
  if (allowImages) {
    extensions.push(Image.configure({ inline: false, allowBase64: false }));
  }

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions,
    content: sanitizeRichHtml(contentToEditorHtml({ body: value, format }), { allowImages }),
    onUpdate: ({ editor: ed }) => {
      if (suppressChangeRef.current) return;
      emitChange(ed.getHTML());
      if (pasteChip) setPasteChip(null);
    },
    editorProps: {
      attributes: {
        class: `erp-rich-content erp-md-content outline-none ${editorClassName}`.trim(),
        'aria-label': ariaLabel || placeholder || 'Rich text editor',
      },
      handleKeyDown: (view, event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return true;
        if (event.key === 'Enter') {
          const mod = event.ctrlKey || event.metaKey;
          if (event.shiftKey) return false;
          if (mod && submitOnModEnter && onSubmit) {
            event.preventDefault();
            onSubmit();
            return true;
          }
          if (!mod && submitOnEnter && onSubmit) {
            event.preventDefault();
            onSubmit();
            return true;
          }
        }
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'v') {
          event.preventDefault();
          navigator.clipboard.readText().then((t) => {
            if (t && editorRef.current) insertPlainText(editorRef.current, t);
          }).catch(() => {});
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const ed = editorRef.current;
        if (!ed) return false;
        const clip = event.clipboardData;
        if (!clip) return false;

        const imageFiles = mergeUniqueFiles(
          collectImageFilesFromDataTransfer(clip),
          imageFilesFromHtmlDataUrls(clip.getData('text/html') || ''),
        );
        if (imageFiles.length) {
          event.preventDefault();
          void handleImageFiles(imageFiles, ed);
          return true;
        }

        if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
          event.preventDefault();
          const plain = clip.getData('text/plain');
          if (plain) insertPlainText(ed, plain);
          return true;
        }

        const html = clip.getData('text/html');
        const plain = clip.getData('text/plain') || '';

        if (plain && isTrivialPasteHtml(html, plain)) {
          event.preventDefault();
          insertPlainText(ed, plain);
          return true;
        }

        if (html?.trim()) {
          event.preventDefault();
          const from = ed.state.selection.from;
          insertSanitizedHtml(ed, html, { allowImages });
          const to = ed.state.selection.to;
          pasteRangeRef.current = { from, to };
          setPasteChip({ from, to });
          window.setTimeout(() => setPasteChip(null), 4000);
          return true;
        }

        if (plain && URL_RE.test(plain.trim()) && !plain.includes('\n')) {
          event.preventDefault();
          ed.chain().focus().extendMarkRange('link').setLink({
            href: plain.trim(),
            target: '_blank',
            rel: 'noopener noreferrer',
          }).insertContent(plain.trim()).run();
          return true;
        }

        if (plain) {
          event.preventDefault();
          insertPlainText(ed, plain);
          return true;
        }

        return false;
      },
      handleDrop: (_view, event) => {
        const ed = editorRef.current;
        if (!ed) return false;
        const dt = event.dataTransfer;
        if (!dt) return false;
        const imageFiles = collectImageFilesFromDataTransfer(dt);
        if (!imageFiles.length) return false;
        event.preventDefault();
        void handleImageFiles(imageFiles, ed);
        return true;
      },
    },
  });

  useImperativeHandle(ref, () => ({
    focus: () => editor?.commands.focus('end'),
    clear: () => {
      editor?.commands.clearContent(true);
      emitChange('');
    },
    getHtml: () => sanitizeRichHtml(editor?.getHTML() || '', { allowImages }),
    getEditor: () => editor,
  }));

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const html = contentToEditorHtml({ body: value, format });
    const current = sanitizeRichHtml(editor.getHTML(), { allowImages });
    if (sanitizeRichHtml(html, { allowImages }) !== current) {
      suppressChangeRef.current = true;
      editor.commands.setContent(html || '<p></p>', false);
      lastEmitted.current = sanitizeRichHtml(editor.getHTML(), { allowImages });
      suppressChangeRef.current = false;
    }
  }, [editor, value, format, allowImages]);

  const removePasteFormatting = useCallback(() => {
    if (!editor || !pasteRangeRef.current) return;
    const { from, to } = pasteRangeRef.current;
    const text = editor.state.doc.textBetween(from, to, '\n');
    editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, text).run();
    pasteRangeRef.current = null;
    setPasteChip(null);
  }, [editor]);

  const pastePlainFromMenu = useCallback(async () => {
    if (!editor) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) insertPlainText(editor, text);
    } catch {
      /* clipboard blocked */
    }
  }, [editor]);

  return (
    <div
      ref={contextRef}
      className={`relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-teal-800/50 dark:bg-[#121f28] dark:shadow-black/25 ${layout === 'composer' ? 'rounded-none border-0 bg-transparent shadow-none dark:bg-transparent' : ''} ${className}`}
      onContextMenu={(e) => {
        e.preventDefault();
        const menu = document.getElementById('erp-rte-ctx-menu');
        if (!menu) return;
        menu.style.display = 'block';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
      }}
    >
      {showToolbar ? <RichTextToolbar editor={editor} variant={variant} disabled={disabled} /> : null}

      <div
        className={`relative w-full min-w-0 ${layout === 'composer' ? 'erp-chat-composer-shell px-0 py-0' : 'px-3 py-2 sm:px-4 sm:py-3'}`}
        style={layout === 'composer' ? undefined : { minHeight }}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <EditorContent editor={editor} />
      </div>

      {editor ? (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
          <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 shadow-lg dark:border-teal-800/55 dark:bg-[#0f1a23]">
            <button type="button" className="rounded px-2 py-1 text-xs font-bold hover:bg-slate-100 dark:hover:bg-white/10" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
            <button type="button" className="rounded px-2 py-1 text-xs italic hover:bg-slate-100 dark:hover:bg-white/10" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()}>I</button>
            <button type="button" className="rounded px-2 py-1 text-xs underline hover:bg-slate-100 dark:hover:bg-white/10" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleUnderline().run()}>U</button>
            <button type="button" className="rounded px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-white/10" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()}>Hl</button>
          </div>
        </BubbleMenu>
      ) : null}

      {pasteChip ? (
        <div className="absolute bottom-2 left-2 z-10 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs shadow-md dark:border-teal-800/55 dark:bg-[#0f1a23]">
          <span className="text-slate-600 dark:text-slate-300">Formatting kept</span>
          <button type="button" className="font-bold text-[#103D4D] underline dark:text-teal-300" onClick={removePasteFormatting}>
            Remove formatting
          </button>
        </div>
      ) : null}

      <div
        id="erp-rte-ctx-menu"
        role="menu"
        className="fixed z-[500] hidden min-w-[10rem] rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-xl dark:border-teal-800/55 dark:bg-[#0f1a23]"
        onMouseLeave={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      >
        <button
          type="button"
          role="menuitem"
          className="block w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/10"
          onClick={() => {
            document.getElementById('erp-rte-ctx-menu').style.display = 'none';
            void pastePlainFromMenu();
          }}
        >
          Paste as plain text
        </button>
      </div>
    </div>
  );
});

export default RichTextEditor;
