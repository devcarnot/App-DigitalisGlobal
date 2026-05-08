'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  checklistTitleLengthError,
  ERP_TASK_CHECKLIST_TITLE_MAX_CHARS,
  formatChecklistItemError,
  normalizeChecklistItemTitle,
} from '../../lib/erp-task-checklist';
import { supabase } from '../../lib/supabase';
import ErpUserAvatar from './ErpUserAvatar';

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function IconPlus({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconTrash({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M3 6h18" strokeLinecap="round" />
      <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconEdit({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M4 20h4l11-11-4-4L4 16v4z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheckbox({ checked, className = 'h-4 w-4' }) {
  return checked ? (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path
        d="M7.5 12.5l3 3L17 9"
        stroke="white"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  ) : (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
    </svg>
  );
}

/**
 * Checklist + comments for a task.
 *
 * @param {{
 *   taskId: string,
 *   userId: string | null | undefined,
 *   nameMap?: Record<string, string>,
 *   avatarProfileFor?: (uid: string) => object,
 *   canManageProject?: boolean,
 * }} props
 */
export default function ErpTaskChecklistAndComments({
  taskId,
  userId,
  nameMap = {},
  avatarProfileFor,
  canManageProject = false,
}) {
  const [checklist, setChecklist] = useState([]);
  const [checklistLoading, setChecklistLoading] = useState(true);
  const [checklistErr, setChecklistErr] = useState('');
  const [newItemTitle, setNewItemTitle] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemTitle, setEditingItemTitle] = useState('');
  const editingItemInputRef = useRef(null);

  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsErr, setCommentsErr] = useState('');
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');

  const loadChecklist = useCallback(async () => {
    if (!taskId) return;
    setChecklistLoading(true);
    setChecklistErr('');
    const { data, error } = await supabase
      .from('erp_task_checklist_items')
      .select('id, task_id, title, done, position, created_by, created_at, updated_at')
      .eq('task_id', taskId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      setChecklistErr(error.message || 'Could not load checklist');
      setChecklist([]);
    } else {
      setChecklist(data || []);
    }
    setChecklistLoading(false);
  }, [taskId]);

  const loadComments = useCallback(async () => {
    if (!taskId) return;
    setCommentsLoading(true);
    setCommentsErr('');
    const { data, error } = await supabase
      .from('erp_task_comments')
      .select('id, task_id, author_id, body, created_at, updated_at')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    if (error) {
      setCommentsErr(error.message || 'Could not load comments');
      setComments([]);
    } else {
      setComments(data || []);
    }
    setCommentsLoading(false);
  }, [taskId]);

  useEffect(() => {
    setEditingItemId(null);
    setEditingCommentId(null);
    setNewItemTitle('');
    setNewComment('');
    void loadChecklist();
    void loadComments();
  }, [loadChecklist, loadComments]);

  useEffect(() => {
    if (editingItemId && editingItemInputRef.current) {
      editingItemInputRef.current.focus();
      editingItemInputRef.current.select();
    }
  }, [editingItemId]);

  const addChecklistItem = useCallback(async () => {
    const title = normalizeChecklistItemTitle(newItemTitle);
    if (!taskId || !title || addingItem) return;
    const lengthErr = checklistTitleLengthError(title);
    if (lengthErr) {
      setChecklistErr(lengthErr);
      return;
    }
    setAddingItem(true);
    setChecklistErr('');
    const nextPosition = checklist.length
      ? Math.max(...checklist.map((it) => Number(it.position) || 0)) + 1
      : 0;
    const { data, error } = await supabase
      .from('erp_task_checklist_items')
      .insert({
        task_id: taskId,
        title,
        position: nextPosition,
        created_by: userId || null,
      })
      .select('id, task_id, title, done, position, created_by, created_at, updated_at')
      .single();
    if (error) {
      setChecklistErr(formatChecklistItemError(error.message));
    } else if (data) {
      setChecklist((prev) => [...prev, data]);
      setNewItemTitle('');
    }
    setAddingItem(false);
  }, [newItemTitle, taskId, userId, checklist, addingItem]);

  const toggleChecklistItem = useCallback(
    async (item) => {
      if (!item?.id) return;
      const nextDone = !item.done;
      setChecklist((prev) => prev.map((it) => (it.id === item.id ? { ...it, done: nextDone } : it)));
      const { error } = await supabase
        .from('erp_task_checklist_items')
        .update({ done: nextDone })
        .eq('id', item.id);
      if (error) {
        setChecklist((prev) => prev.map((it) => (it.id === item.id ? { ...it, done: item.done } : it)));
        setChecklistErr(formatChecklistItemError(error.message) || 'Could not update item');
      }
    },
    [],
  );

  const beginEditItem = useCallback((item) => {
    setEditingItemId(item.id);
    setEditingItemTitle(item.title || '');
  }, []);

  const cancelEditItem = useCallback(() => {
    setEditingItemId(null);
    setEditingItemTitle('');
  }, []);

  const saveEditItem = useCallback(async () => {
    if (!editingItemId) return;
    const title = normalizeChecklistItemTitle(editingItemTitle);
    if (!title) {
      cancelEditItem();
      return;
    }
    const lengthErr = checklistTitleLengthError(title);
    if (lengthErr) {
      setChecklistErr(lengthErr);
      return;
    }
    const snapshot = checklist.find((it) => it.id === editingItemId);
    if (snapshot && snapshot.title === title) {
      cancelEditItem();
      return;
    }
    setChecklist((prev) => prev.map((it) => (it.id === editingItemId ? { ...it, title } : it)));
    const { error } = await supabase
      .from('erp_task_checklist_items')
      .update({ title })
      .eq('id', editingItemId);
    if (error) {
      setChecklist((prev) =>
        prev.map((it) => (it.id === editingItemId ? { ...it, title: snapshot?.title || it.title } : it)),
      );
      setChecklistErr(formatChecklistItemError(error.message));
    }
    cancelEditItem();
  }, [editingItemId, editingItemTitle, checklist, cancelEditItem]);

  const deleteChecklistItem = useCallback(async (item) => {
    if (!item?.id) return;
    const prevList = checklist;
    setChecklist((prev) => prev.filter((it) => it.id !== item.id));
    const { error } = await supabase.from('erp_task_checklist_items').delete().eq('id', item.id);
    if (error) {
      setChecklist(prevList);
      setChecklistErr(formatChecklistItemError(error.message) || 'Could not delete item');
    }
  }, [checklist]);

  const postComment = useCallback(async () => {
    const body = newComment.trim();
    if (!taskId || !userId || !body || postingComment) return;
    setPostingComment(true);
    setCommentsErr('');
    const { data, error } = await supabase
      .from('erp_task_comments')
      .insert({ task_id: taskId, author_id: userId, body })
      .select('id, task_id, author_id, body, created_at, updated_at')
      .single();
    if (error) {
      setCommentsErr(error.message || 'Could not post comment');
    } else if (data) {
      setComments((prev) => [...prev, data]);
      setNewComment('');
    }
    setPostingComment(false);
  }, [newComment, taskId, userId, postingComment]);

  const beginEditComment = useCallback((comment) => {
    setEditingCommentId(comment.id);
    setEditingCommentBody(comment.body || '');
  }, []);

  const cancelEditComment = useCallback(() => {
    setEditingCommentId(null);
    setEditingCommentBody('');
  }, []);

  const saveEditComment = useCallback(async () => {
    if (!editingCommentId) return;
    const body = editingCommentBody.trim();
    if (!body) {
      cancelEditComment();
      return;
    }
    const snapshot = comments.find((c) => c.id === editingCommentId);
    if (snapshot && snapshot.body === body) {
      cancelEditComment();
      return;
    }
    setComments((prev) => prev.map((c) => (c.id === editingCommentId ? { ...c, body } : c)));
    const { error } = await supabase
      .from('erp_task_comments')
      .update({ body })
      .eq('id', editingCommentId);
    if (error) {
      setComments((prev) =>
        prev.map((c) => (c.id === editingCommentId ? { ...c, body: snapshot?.body || c.body } : c)),
      );
      setCommentsErr(error.message || 'Could not save comment');
    }
    cancelEditComment();
  }, [editingCommentId, editingCommentBody, comments, cancelEditComment]);

  const deleteComment = useCallback(async (comment) => {
    if (!comment?.id) return;
    const prevList = comments;
    setComments((prev) => prev.filter((c) => c.id !== comment.id));
    const { error } = await supabase.from('erp_task_comments').delete().eq('id', comment.id);
    if (error) {
      setComments(prevList);
      setCommentsErr(error.message || 'Could not delete comment');
    }
  }, [comments]);

  const progress = useMemo(() => {
    const total = checklist.length;
    const done = checklist.filter((it) => it.done).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, pct };
  }, [checklist]);

  return (
    <div className="space-y-5">
      {/* Checklist */}
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50/60 p-3.5 shadow-sm dark:border-teal-800/40 dark:bg-[#101824] dark:[background-image:none] dark:shadow-black/25">
        <header className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-100">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                <path d="M4 6h10M4 12h8M4 18h6" strokeLinecap="round" />
                <path d="M16 14l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">Checklist</h4>
            {progress.total > 0 ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 dark:bg-teal-950/55 dark:text-slate-300">
                {progress.done}/{progress.total}
              </span>
            ) : null}
          </div>
          {progress.total > 0 ? (
            <span className="text-[10px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{progress.pct}%</span>
          ) : null}
        </header>

        {progress.total > 0 ? (
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/90">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all dark:bg-teal-600 dark:[background-image:none]"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        ) : null}

        {checklistLoading ? (
          <p className="py-2 text-center text-xs text-slate-400 dark:text-slate-500">Loading…</p>
        ) : checklist.length === 0 ? (
          <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">
            No checklist items yet. Break this task into smaller steps below.
          </p>
        ) : (
          <div className="mb-2 max-h-[min(260px,42vh)] overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
          <ul className="space-y-1.5">
            {checklist.map((item) => {
              const isEditing = editingItemId === item.id;
              return (
                <li
                  key={item.id}
                  className={`group flex items-start gap-2 rounded-xl border px-2 py-1.5 transition-colors ${
                    item.done
                      ? 'border-emerald-200/80 bg-emerald-50/60 dark:border-emerald-900/45 dark:bg-emerald-950/30'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-teal-900/40 dark:bg-[#121f28] dark:hover:border-teal-800/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleChecklistItem(item)}
                    className={`mt-0.5 flex-none transition-colors ${
                      item.done
                        ? 'text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300'
                        : 'text-slate-400 hover:text-teal-700 dark:text-slate-500 dark:hover:text-teal-400'
                    }`}
                    aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
                    title={item.done ? 'Mark as not done' : 'Mark as done'}
                  >
                    <IconCheckbox checked={item.done} className="h-4 w-4" />
                  </button>
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        ref={editingItemInputRef}
                        value={editingItemTitle}
                        maxLength={ERP_TASK_CHECKLIST_TITLE_MAX_CHARS}
                        onChange={(e) => setEditingItemTitle(e.target.value)}
                        onBlur={saveEditItem}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void saveEditItem();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelEditItem();
                          }
                        }}
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-900 outline-none focus:border-[#103D4D]/50 dark:border-teal-800/50 dark:bg-[#0c141c] dark:text-slate-100 dark:focus:border-teal-500/45"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => beginEditItem(item)}
                        className={`block w-full cursor-text break-words text-left text-[13px] ${
                          item.done
                            ? 'text-slate-500 line-through dark:text-slate-500'
                            : 'text-slate-800 dark:text-slate-100'
                        }`}
                        title="Click to edit"
                      >
                        {item.title}
                      </button>
                    )}
                  </div>
                  {!isEditing ? (
                    <div className="flex flex-none items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => beginEditItem(item)}
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
                        aria-label="Edit item"
                        title="Edit"
                      >
                        <IconEdit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteChecklistItem(item)}
                        className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                        aria-label="Delete item"
                        title="Delete"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          </div>
        )}

        <div className="mt-2 flex items-center gap-2">
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-400 dark:border-teal-800/60 dark:text-slate-500">
            <IconPlus className="h-3.5 w-3.5" />
          </span>
          <input
            value={newItemTitle}
            maxLength={ERP_TASK_CHECKLIST_TITLE_MAX_CHARS}
            onChange={(e) => setNewItemTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              void addChecklistItem();
            }}
            placeholder="Add checklist item and press Enter"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-900 outline-none focus:border-[#103D4D]/40 dark:border-teal-800/50 dark:bg-[#121f28] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-500/45"
          />
          <button
            type="button"
            disabled={
              addingItem ||
              !normalizeChecklistItemTitle(newItemTitle) ||
              Boolean(checklistTitleLengthError(normalizeChecklistItemTitle(newItemTitle)))
            }
            onClick={() => void addChecklistItem()}
            className="rounded-lg erp-brand-fill px-3 py-1.5 text-[11px] font-bold text-white shadow-sm disabled:opacity-50"
          >
            {addingItem ? 'Adding…' : 'Add'}
          </button>
        </div>

        {checklistErr ? (
          <p className="mt-2 text-[11px] font-medium text-rose-600 dark:text-rose-400">{checklistErr}</p>
        ) : null}
      </section>

      {/* Comments */}
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-cyan-50/25 p-3.5 shadow-sm dark:border-teal-800/40 dark:bg-[#101e28] dark:[background-image:none] dark:shadow-black/25">
        <header className="mb-2 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-100 text-cyan-800 dark:bg-teal-900/45 dark:text-teal-100">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path d="M21 12a8 8 0 01-11.8 7L4 20l1-5.2A8 8 0 1121 12z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">Comments</h4>
          {comments.length > 0 ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-600 dark:bg-teal-950/55 dark:text-slate-300">
              {comments.length}
            </span>
          ) : null}
        </header>

        {commentsLoading ? (
          <p className="py-2 text-center text-xs text-slate-400 dark:text-slate-500">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">
            No comments yet. Share progress, blockers, or context below.
          </p>
        ) : (
          <div className="mb-2 max-h-[min(280px,48vh)] overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
          <ul className="space-y-2.5">
            {comments.map((c) => {
              const mine = c.author_id === userId;
              const canDelete = mine || canManageProject;
              const authorName = nameMap[c.author_id] || 'Member';
              const isEditing = editingCommentId === c.id;
              const edited =
                c.updated_at && c.created_at && new Date(c.updated_at).getTime() - new Date(c.created_at).getTime() > 1500;
              return (
                <li key={c.id} className="group flex items-start gap-2.5">
                  <div className="flex-none pt-0.5">
                    {avatarProfileFor ? (
                      <ErpUserAvatar
                        profile={avatarProfileFor(c.author_id)}
                        size="sm"
                        alt=""
                        className="!h-8 !w-8 shadow-none ring-1 ring-slate-200/70 dark:ring-teal-900/55"
                      />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600 dark:bg-teal-950/55 dark:text-slate-300">
                        {authorName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="rounded-2xl border border-slate-200/90 bg-white/90 px-3 py-2 shadow-sm dark:border-slate-600/60 dark:bg-[#121a22]">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-[12px] font-bold text-slate-800 dark:text-slate-100">{authorName}</span>
                          <span className="text-[10px] text-slate-400">{formatWhen(c.created_at)}</span>
                          {edited ? (
                            <span className="text-[10px] italic text-slate-400">edited</span>
                          ) : null}
                        </div>
                        {!isEditing ? (
                          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            {mine ? (
                              <button
                                type="button"
                                onClick={() => beginEditComment(c)}
                                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
                                aria-label="Edit comment"
                                title="Edit"
                              >
                                <IconEdit className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            {canDelete ? (
                              <button
                                type="button"
                                onClick={() => void deleteComment(c)}
                                className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                                aria-label="Delete comment"
                                title="Delete"
                              >
                                <IconTrash className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingCommentBody}
                            onChange={(e) => setEditingCommentBody(e.target.value)}
                            rows={3}
                            className="w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-900 outline-none focus:border-[#103D4D]/40 dark:border-teal-800/50 dark:bg-[#0c141c] dark:text-slate-100 dark:focus:border-teal-500/45"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={cancelEditComment}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-teal-800/50 dark:bg-[#121f28] dark:text-slate-300 dark:hover:bg-[#1a2732]"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveEditComment()}
                              disabled={!editingCommentBody.trim()}
                              className="rounded-lg erp-brand-fill px-3 py-1 text-[11px] font-bold text-white shadow-sm disabled:opacity-50"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-800 dark:text-slate-100">
                          {c.body}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          </div>
        )}

        <div className="mt-3 flex items-start gap-2">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void postComment();
              }
            }}
            placeholder="Write a comment… (Ctrl/Cmd+Enter to send)"
            rows={2}
            className="min-h-[52px] flex-1 resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none focus:border-[#103D4D]/40 [scrollbar-width:thin] dark:border-teal-800/50 dark:bg-[#121f28] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-500/45"
          />
          <button
            type="button"
            disabled={postingComment || !newComment.trim()}
            onClick={() => void postComment()}
            className="shrink-0 self-stretch rounded-xl erp-brand-fill px-4 text-[12px] font-bold text-white shadow-sm disabled:opacity-50"
          >
            {postingComment ? '…' : 'Post'}
          </button>
        </div>

        {commentsErr ? (
          <p className="mt-2 text-[11px] font-medium text-rose-600 dark:text-rose-400">{commentsErr}</p>
        ) : null}
      </section>
    </div>
  );
}
