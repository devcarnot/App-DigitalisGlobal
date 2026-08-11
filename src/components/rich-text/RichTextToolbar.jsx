'use client';

const BTN =
  'inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border border-transparent px-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 dark:text-slate-300 dark:hover:bg-white/10';

const ACTIVE =
  'border-cyan-300/80 bg-cyan-50 text-[#103D4D] dark:border-teal-600/45 dark:bg-teal-950/50 dark:text-teal-100';

function ToolBtn({ active, title, onClick, children, disabled }) {
  return (
    <button
      type="button"
      role="button"
      title={title}
      aria-pressed={active ? 'true' : 'false'}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`${BTN} ${active ? ACTIVE : ''} disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

export const HIGHLIGHT_SWATCHES = [
  { label: 'Yellow', color: '#fef08a' },
  { label: 'Green', color: '#bbf7d0' },
  { label: 'Blue', color: '#bfdbfe' },
  { label: 'Pink', color: '#fbcfe8' },
  { label: 'Orange', color: '#fed7aa' },
  { label: 'Gray', color: '#e2e8f0' },
];

export const TEXT_SWATCHES = [
  { label: 'Default', color: null },
  { label: 'Teal', color: '#0f766e' },
  { label: 'Blue', color: '#1d4ed8' },
  { label: 'Red', color: '#b91c1c' },
  { label: 'Purple', color: '#7e22ce' },
  { label: 'Slate', color: '#475569' },
];

export default function RichTextToolbar({ editor, variant = 'full', disabled }) {
  if (!editor) return null;

  const compact = variant === 'compact';

  const setLink = () => {
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('Link URL', prev);
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim(), target: '_blank', rel: 'noopener noreferrer' }).run();
  };

  const primary = (
    <>
      <ToolBtn title="Bold (Ctrl+B)" active={editor.isActive('bold')} disabled={disabled} onClick={() => editor.chain().focus().toggleBold().run()}>
        <strong>B</strong>
      </ToolBtn>
      <ToolBtn title="Italic (Ctrl+I)" active={editor.isActive('italic')} disabled={disabled} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <em>I</em>
      </ToolBtn>
      <ToolBtn title="Underline (Ctrl+U)" active={editor.isActive('underline')} disabled={disabled} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <span className="underline">U</span>
      </ToolBtn>
      <ToolBtn title="Strikethrough" active={editor.isActive('strike')} disabled={disabled} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <span className="line-through">S</span>
      </ToolBtn>
      <ToolBtn title="Highlight" active={editor.isActive('highlight')} disabled={disabled} onClick={() => editor.chain().focus().toggleHighlight({ color: HIGHLIGHT_SWATCHES[0].color }).run()}>
        Hl
      </ToolBtn>
      <ToolBtn title="Bullet list" active={editor.isActive('bulletList')} disabled={disabled} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        •
      </ToolBtn>
      <ToolBtn title="Numbered list" active={editor.isActive('orderedList')} disabled={disabled} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        1.
      </ToolBtn>
      <ToolBtn title="Link" active={editor.isActive('link')} disabled={disabled} onClick={setLink}>
        Link
      </ToolBtn>
    </>
  );

  const overflow = (
    <>
      <ToolBtn title="Heading 1" active={editor.isActive('heading', { level: 1 })} disabled={disabled} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        H1
      </ToolBtn>
      <ToolBtn title="Heading 2" active={editor.isActive('heading', { level: 2 })} disabled={disabled} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        H2
      </ToolBtn>
      <ToolBtn title="Heading 3" active={editor.isActive('heading', { level: 3 })} disabled={disabled} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        H3
      </ToolBtn>
      <ToolBtn title="Heading 4" active={editor.isActive('heading', { level: 4 })} disabled={disabled} onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}>
        H4
      </ToolBtn>
      <ToolBtn title="Paragraph" active={editor.isActive('paragraph')} disabled={disabled} onClick={() => editor.chain().focus().setParagraph().run()}>
        P
      </ToolBtn>
      <ToolBtn title="Task list" active={editor.isActive('taskList')} disabled={disabled} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        Task
      </ToolBtn>
      <ToolBtn title="Blockquote" active={editor.isActive('blockquote')} disabled={disabled} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        Quote
      </ToolBtn>
      <ToolBtn title="Inline code" active={editor.isActive('code')} disabled={disabled} onClick={() => editor.chain().focus().toggleCode().run()}>
        {'</>'}
      </ToolBtn>
      <ToolBtn title="Code block" active={editor.isActive('codeBlock')} disabled={disabled} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        Pre
      </ToolBtn>
      <ToolBtn title="Horizontal rule" disabled={disabled} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        HR
      </ToolBtn>
      <ToolBtn title="Insert table" disabled={disabled} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        Table
      </ToolBtn>
      <ToolBtn title="Add row" disabled={disabled} onClick={() => editor.chain().focus().addRowAfter().run()}>
        +Row
      </ToolBtn>
      <ToolBtn title="Add column" disabled={disabled} onClick={() => editor.chain().focus().addColumnAfter().run()}>
        +Col
      </ToolBtn>
      <ToolBtn title="Delete row" disabled={disabled} onClick={() => editor.chain().focus().deleteRow().run()}>
        -Row
      </ToolBtn>
      <ToolBtn title="Delete column" disabled={disabled} onClick={() => editor.chain().focus().deleteColumn().run()}>
        -Col
      </ToolBtn>
      <ToolBtn title="Toggle header row" disabled={disabled} onClick={() => editor.chain().focus().toggleHeaderRow().run()}>
        Header
      </ToolBtn>
      <ToolBtn title="Indent" disabled={disabled} onClick={() => editor.chain().focus().sinkListItem('listItem').run()}>
        Ind
      </ToolBtn>
      <ToolBtn title="Outdent" disabled={disabled} onClick={() => editor.chain().focus().liftListItem('listItem').run()}>
        Out
      </ToolBtn>
      <ToolBtn title="Clear formatting" disabled={disabled} onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
        Clear
      </ToolBtn>
      <ToolBtn title="Undo" disabled={disabled || !editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        Undo
      </ToolBtn>
      <ToolBtn title="Redo" disabled={disabled || !editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        Redo
      </ToolBtn>
      <div className="flex flex-wrap items-center gap-0.5 px-1">
        {HIGHLIGHT_SWATCHES.map((s) => (
          <button
            key={s.color}
            type="button"
            title={`Highlight ${s.label}`}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleHighlight({ color: s.color }).run()}
            className="h-5 w-5 rounded border border-slate-300/80 dark:border-teal-800/50"
            style={{ backgroundColor: s.color }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-0.5 px-1">
        {TEXT_SWATCHES.map((s) => (
          <button
            key={s.label}
            type="button"
            title={`Text ${s.label}`}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!s.color) editor.chain().focus().unsetColor().run();
              else editor.chain().focus().setColor(s.color).run();
            }}
            className="h-5 w-5 rounded border border-slate-300/80 text-[9px] font-bold dark:border-teal-800/50"
            style={{ color: s.color || undefined }}
          >
            A
          </button>
        ))}
      </div>
    </>
  );

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className={`flex flex-wrap items-center gap-0.5 border-b border-slate-200/80 bg-slate-50/90 px-1 py-1 dark:border-teal-900/45 dark:bg-[#0a121c]/90 ${compact ? 'max-h-9 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]' : ''}`}
    >
      {primary}
      {!compact ? overflow : <details className="relative"><summary className={`${BTN} list-none cursor-pointer`}>More</summary><div className="absolute left-0 top-full z-20 flex max-w-[min(100vw,24rem)] flex-wrap gap-0.5 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-teal-800/55 dark:bg-[#0f1a23]">{overflow}</div></details>}
    </div>
  );
}
