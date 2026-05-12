'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import ChatMessageHtml from '../ChatMessageHtml';
import ErpFilePreviewModal from '../ErpFilePreviewModal';
import ErpNoteEditorModal from './ErpNoteEditorModal';
import {
  ERP_NOTE_COLUMNS,
  ERP_NOTE_DEFAULT_COLOR,
  ERP_NOTE_DEFAULT_COLUMN,
  formatNoteDueShort,
  isNoteOverdue,
  noteColorStripeClass,
  resolveNoteColumn,
} from './erpNotesConstants';

const NOTE_SELECT =
  'id, user_id, title, body, column_key, color, pinned, due_at, sort_order, created_at, updated_at';

/** Sort within a column: pinned first, then sort_order, then newest. */
function sortNotesInColumn(rows) {
  return [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/** Group + sort notes into the canonical lane order. */
function groupNotes(rows) {
  /** @type {Record<string, any[]>} */
  const map = {};
  for (const c of ERP_NOTE_COLUMNS) map[c.key] = [];
  for (const r of rows || []) {
    const key = r.column_key && map[r.column_key] ? r.column_key : ERP_NOTE_DEFAULT_COLUMN;
    map[key].push(r);
  }
  for (const k of Object.keys(map)) map[k] = sortNotesInColumn(map[k]);
  return map;
}

/**
 * Personal Kanban-style notes board.
 *
 * Each row is private (RLS = `user_id = auth.uid()`); admins / HR / team
 * managers see this in the sidebar via the `notes` RBAC module.
 */
export default function ErpNotesBoard({ userId }) {
  const [notes, setNotes] = useState(/** @type {any[]} */ ([]));
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorNote, setEditorNote] = useState(/** @type {any} */ (null));
  const [editorDefaultColumn, setEditorDefaultColumn] = useState(ERP_NOTE_DEFAULT_COLUMN);
  const [editorBusy, setEditorBusy] = useState(false);

  // Inline media preview (for clicking pasted images inside a note body).
  const [mediaPreview, setMediaPreview] = useState(null);

  // Drag state. We track both the note being dragged (so we can reorder
  // within a column) and the hovered column (for the highlight).
  const dragNoteIdRef = useRef(/** @type {string | null} */ (null));
  const dragFromColRef = useRef(/** @type {string | null} */ (null));
  const [dragOverColumn, setDragOverColumn] = useState(/** @type {string | null} */ (null));

  // ---- Loading ------------------------------------------------------------

  const loadNotes = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadErr('');
    const { data, error } = await supabase
      .from('erp_notes')
      .select(NOTE_SELECT)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) {
      setLoadErr(error.message || 'Could not load notes.');
      setLoading(false);
      return;
    }
    setNotes(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  // Realtime: a second tab/window stays in sync without a refresh.
  useEffect(() => {
    if (!userId) return undefined;
    const channel = supabase
      .channel(`erp_notes:user:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'erp_notes', filter: `user_id=eq.${userId}` },
        () => {
          // Cheap refetch — the full list is small.
          void loadNotes();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadNotes, userId]);

  const grouped = useMemo(() => groupNotes(notes), [notes]);

  // ---- CRUD ---------------------------------------------------------------

  const openCreate = useCallback((columnKey) => {
    setEditorNote(null);
    setEditorDefaultColumn(columnKey || ERP_NOTE_DEFAULT_COLUMN);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((note) => {
    setEditorNote(note);
    setEditorDefaultColumn(note?.column_key || ERP_NOTE_DEFAULT_COLUMN);
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    if (editorBusy) return;
    setEditorOpen(false);
    setEditorNote(null);
  }, [editorBusy]);

  /** Compute the sort_order to put a freshly-created note at the bottom of
   *  its column (pinned cards still float above thanks to the sort comparator). */
  const nextSortOrderForColumn = useCallback(
    (columnKey) => {
      const lane = grouped[columnKey] || [];
      const tail = lane.filter((n) => !n.pinned);
      if (!tail.length) return 0;
      return (tail[tail.length - 1].sort_order ?? 0) + 1;
    },
    [grouped],
  );

  const handleSave = useCallback(
    async (payload) => {
      setEditorBusy(true);
      try {
        if (editorNote?.id) {
          const { data, error } = await supabase
            .from('erp_notes')
            .update({
              title: payload.title,
              body: payload.body || null,
              column_key: payload.column_key,
              color: payload.color || ERP_NOTE_DEFAULT_COLOR,
              pinned: Boolean(payload.pinned),
              due_at: payload.due_at,
            })
            .eq('id', editorNote.id)
            .select(NOTE_SELECT)
            .single();
          if (error) throw new Error(error.message);
          setNotes((prev) => prev.map((n) => (n.id === editorNote.id ? data : n)));
        } else {
          const insertRow = {
            user_id: userId,
            title: payload.title,
            body: payload.body || null,
            column_key: payload.column_key,
            color: payload.color || ERP_NOTE_DEFAULT_COLOR,
            pinned: Boolean(payload.pinned),
            due_at: payload.due_at,
            sort_order: nextSortOrderForColumn(payload.column_key),
          };
          const { data, error } = await supabase
            .from('erp_notes')
            .insert(insertRow)
            .select(NOTE_SELECT)
            .single();
          if (error) throw new Error(error.message);
          setNotes((prev) => [data, ...prev]);
        }
        setEditorOpen(false);
        setEditorNote(null);
      } finally {
        setEditorBusy(false);
      }
    },
    [editorNote, nextSortOrderForColumn, userId],
  );

  const handleDelete = useCallback(async () => {
    if (!editorNote?.id) return;
    setEditorBusy(true);
    try {
      const { error } = await supabase.from('erp_notes').delete().eq('id', editorNote.id);
      if (error) throw new Error(error.message);
      setNotes((prev) => prev.filter((n) => n.id !== editorNote.id));
      setEditorOpen(false);
      setEditorNote(null);
    } finally {
      setEditorBusy(false);
    }
  }, [editorNote]);

  /** Quick toggle: pin / unpin from the card itself. */
  const togglePin = useCallback(async (note) => {
    const next = !note.pinned;
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, pinned: next } : n)));
    const { error } = await supabase.from('erp_notes').update({ pinned: next }).eq('id', note.id);
    if (error) {
      // Roll back on failure.
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, pinned: note.pinned } : n)));
    }
  }, []);

  // ---- Drag and drop ------------------------------------------------------

  const onCardDragStart = useCallback((e, note) => {
    dragNoteIdRef.current = note.id;
    dragFromColRef.current = note.column_key || ERP_NOTE_DEFAULT_COLUMN;
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', note.id);
    } catch {
      /* some browsers throw on read-only DataTransfer */
    }
  }, []);

  const onColumnDragOver = useCallback((e, columnKey) => {
    if (!dragNoteIdRef.current) return;
    e.preventDefault();
    setDragOverColumn(columnKey);
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      /* read-only */
    }
  }, []);

  const onColumnDragLeave = useCallback((columnKey) => {
    setDragOverColumn((cur) => (cur === columnKey ? null : cur));
  }, []);

  /** Reorder helper: given the source note id and the lane ids in their new
   *  visual order, persist sort_order for everything that changed. */
  const persistColumnOrder = useCallback(async (columnKey, idsInOrder) => {
    if (!idsInOrder?.length) return;
    const updates = idsInOrder.map((id, idx) => ({ id, sort_order: idx }));
    // Optimistic local update first.
    setNotes((prev) =>
      prev.map((n) => {
        const u = updates.find((up) => up.id === n.id);
        if (!u) return n;
        return { ...n, column_key: columnKey, sort_order: u.sort_order };
      }),
    );
    // Parallelize updates — independent rows, no ordering constraint between
    // them. Optimistic UI already reflects the final state, so we just need
    // them all persisted before the next drag begins.
    await Promise.all(
      updates.map((u) =>
        supabase
          .from('erp_notes')
          .update({ column_key: columnKey, sort_order: u.sort_order })
          .eq('id', u.id),
      ),
    );
  }, []);

  const onColumnDrop = useCallback(
    async (e, columnKey, beforeNoteId = null) => {
      e.preventDefault();
      e.stopPropagation();
      const draggedId = dragNoteIdRef.current;
      const fromCol = dragFromColRef.current;
      dragNoteIdRef.current = null;
      dragFromColRef.current = null;
      setDragOverColumn(null);
      if (!draggedId) return;
      const dragged = notes.find((n) => n.id === draggedId);
      if (!dragged) return;

      // Build the new visual order for the destination column.
      const destLane = (grouped[columnKey] || []).filter((n) => n.id !== draggedId);
      let insertAt = destLane.length;
      if (beforeNoteId) {
        const idx = destLane.findIndex((n) => n.id === beforeNoteId);
        if (idx >= 0) insertAt = idx;
      }
      const newDestOrder = [...destLane];
      newDestOrder.splice(insertAt, 0, { ...dragged, column_key: columnKey });
      const destIds = newDestOrder.map((n) => n.id);

      await persistColumnOrder(columnKey, destIds);

      // If the source column changed, also renumber the source lane so its
      // sort_order stays dense.
      if (fromCol && fromCol !== columnKey) {
        const srcLane = (grouped[fromCol] || []).filter((n) => n.id !== draggedId);
        const srcIds = srcLane.map((n) => n.id);
        if (srcIds.length) await persistColumnOrder(fromCol, srcIds);
      }
    },
    [grouped, notes, persistColumnOrder],
  );

  // ---- Render -------------------------------------------------------------

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => openCreate(ERP_NOTE_DEFAULT_COLUMN)}
          className="inline-flex items-center gap-1.5 rounded-xl erp-brand-fill px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-md"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3.5 w-3.5" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New note
        </button>
      </div>

      {loadErr ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900/55 dark:bg-rose-950/40 dark:text-rose-200">
          {loadErr}
        </p>
      ) : null}

      <div className="flex w-full snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {ERP_NOTE_COLUMNS.map((col) => {
          const lane = grouped[col.key] || [];
          const dragActive = dragOverColumn === col.key;
          return (
            <section
              key={col.key}
              onDragOver={(e) => onColumnDragOver(e, col.key)}
              onDragLeave={() => onColumnDragLeave(col.key)}
              onDrop={(e) => onColumnDrop(e, col.key, null)}
              className={`flex w-[18rem] shrink-0 snap-start flex-col rounded-2xl border ${col.accent} ${
                dragActive ? 'ring-2 ring-cyan-300/70 dark:ring-teal-400/55' : ''
              } transition-shadow`}
            >
              <header className="flex items-center justify-between gap-2 border-b border-slate-200/70 px-3 py-2.5 dark:border-teal-900/45">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[11px] font-bold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-200">
                    {col.title}
                  </span>
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 ring-1 ring-slate-200/70 dark:bg-slate-900/60 dark:text-slate-200 dark:ring-teal-900/55">
                    {lane.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => openCreate(col.key)}
                  title={`Add to ${col.title}`}
                  aria-label={`Add note to ${col.title}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-teal-800/55 dark:bg-[#0f1820] dark:text-slate-300 dark:hover:border-teal-700/70 dark:hover:bg-[#162430]"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3.5 w-3.5" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </header>

              <div className="flex flex-1 flex-col gap-2 px-2 py-2 min-h-[12rem]">
                {loading && lane.length === 0 ? (
                  <div className="space-y-2">
                    <div className="h-20 animate-pulse rounded-xl bg-slate-200/60 dark:bg-slate-800/55" />
                    <div className="h-20 animate-pulse rounded-xl bg-slate-200/60 dark:bg-slate-800/55" />
                  </div>
                ) : lane.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => openCreate(col.key)}
                    className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-white/40 px-3 py-6 text-center text-[11px] font-medium text-slate-500 hover:bg-white/70 dark:border-teal-900/55 dark:bg-[#0f1820]/40 dark:text-slate-400 dark:hover:bg-[#0f1820]/70"
                  >
                    Drop a card here, or click to add a note
                  </button>
                ) : (
                  lane.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      onOpen={() => openEdit(note)}
                      onTogglePin={() => togglePin(note)}
                      onDragStart={(e) => onCardDragStart(e, note)}
                      onDragOverCard={(e) => onColumnDragOver(e, col.key)}
                      onDropOnCard={(e) => onColumnDrop(e, col.key, note.id)}
                      onMediaOpen={({ url, name }) =>
                        setMediaPreview({ url, name, mime: null })
                      }
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <ErpNoteEditorModal
        open={editorOpen}
        note={editorNote}
        defaultColumn={editorDefaultColumn}
        onClose={closeEditor}
        onSave={handleSave}
        onDelete={editorNote?.id ? handleDelete : undefined}
        busy={editorBusy}
      />
      <ErpFilePreviewModal file={mediaPreview} onClose={() => setMediaPreview(null)} />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Card

function NoteCard({ note, onOpen, onTogglePin, onDragStart, onDragOverCard, onDropOnCard, onMediaOpen }) {
  const stripe = noteColorStripeClass(note.color || ERP_NOTE_DEFAULT_COLOR);
  const dueLabel = formatNoteDueShort(note.due_at);
  const overdue = isNoteOverdue(note.due_at, note.column_key);
  const colMeta = resolveNoteColumn(note.column_key);

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOverCard}
      onDrop={onDropOnCard}
      className="group relative flex cursor-grab flex-col gap-2 rounded-xl border border-slate-200/80 bg-white p-3 text-left shadow-sm transition hover:-translate-y-[1px] hover:shadow-md active:cursor-grabbing dark:border-teal-900/45 dark:bg-[#0f1820] dark:shadow-black/25"
    >
      <span className={`absolute left-0 top-0 h-full w-1 rounded-l-xl ${stripe}`} aria-hidden />
      <div className="flex items-start justify-between gap-2 pl-2">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-sm font-bold text-slate-900 group-hover:text-[#103D4D] dark:text-slate-100 dark:group-hover:text-teal-200">
            {note.title || 'Untitled note'}
          </p>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          aria-label={note.pinned ? 'Unpin' : 'Pin'}
          title={note.pinned ? 'Unpin' : 'Pin'}
          className={`shrink-0 rounded-full p-1 transition ${
            note.pinned
              ? 'text-amber-500 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40'
              : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500 dark:text-slate-600 dark:hover:bg-slate-800/60 dark:hover:text-slate-300'
          }`}
        >
          <svg viewBox="0 0 24 24" fill={note.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
        </button>
      </div>

      {note.body ? (
        <button type="button" onClick={onOpen} className="block pl-2 text-left">
          <div className="line-clamp-3 text-[12px] text-slate-700 dark:text-slate-300">
            <ChatMessageHtml
              text={note.body}
              onMediaOpen={onMediaOpen}
              className="!text-[12px] [&_p]:m-0 [&_p+_p]:mt-1 [&_ul]:my-0.5 [&_ol]:my-0.5"
            />
          </div>
        </button>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 pl-2">
        {dueLabel ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
              overdue
                ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/45 dark:text-rose-200 dark:ring-rose-900/55'
                : 'bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-900/55 dark:text-slate-300 dark:ring-teal-900/55'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25m-12 4.5h13.5M4.5 21h15a1.5 1.5 0 001.5-1.5V6.75a1.5 1.5 0 00-1.5-1.5h-15a1.5 1.5 0 00-1.5 1.5V19.5a1.5 1.5 0 001.5 1.5z" />
            </svg>
            {dueLabel}
          </span>
        ) : null}
        <span className="ml-auto truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
          {colMeta.title}
        </span>
      </div>
    </article>
  );
}
