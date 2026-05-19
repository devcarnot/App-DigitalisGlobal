'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { blogSlugFromTitle, blogPostCoverUrl, estimateReadMinutes } from '../../lib/blog-format';
import { getMarketingSiteOrigin } from '../../lib/public-site-url';
import ErpConfirmDialog from '../erp/ErpConfirmDialog';
import BlogContentEditor from './BlogContentEditor';
import { ERP_MAX_UPLOAD_BYTES, ERP_MAX_UPLOAD_MB } from '../../lib/erp-upload-limits';

// Blog posts are managed here but rendered on the public marketing site —
// these preview links must point there, not at the workspace app.
const MARKETING_ORIGIN = getMarketingSiteOrigin();

const PAGE_SIZE = 8;
const MAX_COVER_BYTES = ERP_MAX_UPLOAD_BYTES;

const sectionCardFrame =
  'rounded-2xl border border-[#589CD5]/20 bg-white/90 shadow-[0_8px_32px_-14px_rgba(88,156,213,0.22)] ring-1 ring-[#52C4C9]/10 backdrop-blur-sm';

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200/90 bg-slate-50/50 text-slate-900 shadow-inner shadow-slate-900/[0.02] transition-colors focus:border-sky-400/80 focus:bg-white focus:outline-none focus:ring-4 focus:ring-sky-500/12';

const labelCls = 'mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500';

const emptyForm = () => ({
  id: null,
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  tags: '',
  author_name: '',
  read_minutes: '',
  cover_image_path: '',
  cover_image_url: '',
  cover_image_alt: '',
  cover_image_caption: '',
  published: false,
});

const formatPostedAt = (row) => {
  const d = row?.published_at || row?.created_at;
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

function tagsToString(tags) {
  if (!tags) return '';
  if (Array.isArray(tags)) return tags.join(', ');
  return String(tags);
}

function tagsFromString(s) {
  return String(s || '')
    .split(/[,\n]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 24);
}

export default function AdminBlogManager({ sectionCardFrame: frameFromParent }) {
  const frame = frameFromParent || sectionCardFrame;
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [page, setPage] = useState(1);
  const [contentEditorKey, setContentEditorKey] = useState(0);
  const fileInputRef = useRef(null);

  const loadPosts = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setPosts([]);
      setErr(error.message || 'Failed to load posts');
    } else {
      setPosts(Array.isArray(data) ? data : []);
      setErr('');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  const totalPages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return posts.slice(start, start + PAGE_SIZE);
  }, [posts, pageSafe]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const openNew = () => {
    setForm(emptyForm());
    setContentEditorKey((k) => k + 1);
    setEditorOpen(true);
    setErr('');
  };

  const openEdit = (post) => {
    setContentEditorKey((k) => k + 1);
    setForm({
      id: post.id,
      title: post.title || '',
      slug: post.slug || '',
      excerpt: post.excerpt || '',
      content: post.content || '',
      tags: tagsToString(post.tags),
      author_name: post.author_name || '',
      read_minutes: post.read_minutes ? String(post.read_minutes) : '',
      cover_image_path: post.cover_image_path || '',
      cover_image_url: post.cover_image_url || '',
      cover_image_alt: post.cover_image_alt || '',
      cover_image_caption: post.cover_image_caption || '',
      published: Boolean(post.published),
    });
    setEditorOpen(true);
    setErr('');
  };

  const onTitleChange = (title) =>
    setForm((f) => ({ ...f, title, slug: f.slug || blogSlugFromTitle(title) }));

  const uploadCover = async (file) => {
    if (!supabase || !file) return;
    if (file.size > MAX_COVER_BYTES) {
      setErr(`Cover image must be under ${ERP_MAX_UPLOAD_MB} MB.`);
      return;
    }
    setUploading(true);
    setErr('');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const fname = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = `covers/${fname}`;
    const { error: upErr } = await supabase.storage
      .from('blog-images')
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || 'image/jpeg' });
    setUploading(false);
    if (upErr) {
      setErr(upErr.message || 'Upload failed');
      return;
    }
    setForm((f) => ({ ...f, cover_image_path: path, cover_image_url: '' }));
  };

  const clearCover = () => setForm((f) => ({ ...f, cover_image_path: '', cover_image_url: '' }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!supabase) return;
    const title = form.title.trim();
    if (!title) {
      setErr('Title is required.');
      return;
    }
    const slug = (form.slug || blogSlugFromTitle(title)).trim();
    if (!slug) {
      setErr('A URL slug is required.');
      return;
    }
    setSaving(true);
    setErr('');
    const readNum = Number(form.read_minutes);
    const payload = {
      title,
      slug,
      excerpt: form.excerpt.trim() || null,
      content: form.content || '',
      tags: tagsFromString(form.tags),
      author_name: form.author_name.trim() || null,
      read_minutes: Number.isFinite(readNum) && readNum > 0 ? Math.round(readNum) : estimateReadMinutes(form.content),
      cover_image_path: form.cover_image_path || null,
      cover_image_url: form.cover_image_url.trim() || null,
      cover_image_alt: form.cover_image_alt.trim() || null,
      cover_image_caption: form.cover_image_caption.trim() || null,
      published: Boolean(form.published),
    };
    let res;
    if (form.id) {
      res = await supabase.from('blog_posts').update(payload).eq('id', form.id).select().single();
    } else {
      res = await supabase.from('blog_posts').insert(payload).select().single();
    }
    setSaving(false);
    if (res.error) {
      if (/duplicate/i.test(res.error.message || '')) {
        setErr('A post with that slug already exists. Choose a different slug.');
      } else {
        setErr(res.error.message || 'Could not save post.');
      }
      return;
    }
    if (res.data) {
      if (form.id) {
        setPosts((prev) => prev.map((p) => (p.id === res.data.id ? res.data : p)));
      } else {
        setPosts((prev) => [res.data, ...prev]);
      }
    }
    setEditorOpen(false);
    setForm(emptyForm());
  };

  const deletePost = async () => {
    const target = confirmDelete;
    if (!target || !supabase) return;
    setErr('');
    const { error } = await supabase.from('blog_posts').delete().eq('id', target.id);
    if (error) {
      setErr(error.message || 'Could not delete post');
      return;
    }
    if (target.cover_image_path) {
      await supabase.storage.from('blog-images').remove([target.cover_image_path]).catch(() => {});
    }
    setPosts((prev) => prev.filter((p) => p.id !== target.id));
    setConfirmDelete(null);
    if (editorOpen && form.id === target.id) {
      setEditorOpen(false);
      setForm(emptyForm());
    }
  };

  const togglePublished = async (post) => {
    if (!supabase) return;
    const next = !post.published;
    const { data, error } = await supabase
      .from('blog_posts')
      .update({ published: next })
      .eq('id', post.id)
      .select()
      .single();
    if (error) {
      setErr(error.message || 'Could not update post');
      return;
    }
    if (data) setPosts((prev) => prev.map((p) => (p.id === post.id ? data : p)));
  };

  return (
    <>
      <div className={`mb-6 overflow-hidden ${frame}`}>
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-sm font-semibold text-slate-800">Blog</p>
            <p className="mt-0.5 text-sm text-slate-600">
              Posts appear on the public{' '}
              <a
                href={`${MARKETING_ORIGIN}/blog`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-sky-600 hover:underline"
              >
                /blog
              </a>{' '}
              page when published.
            </p>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="shrink-0 rounded-xl erp-brand-fill px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#589CD5]/25 transition-all hover:shadow-xl"
          >
            New post
          </button>
        </div>
      </div>

      {err ? (
        <div className="mb-6 rounded-xl border border-rose-200/80 bg-rose-50/90 px-4 py-3 text-sm font-medium text-rose-800">
          {err}
        </div>
      ) : null}

      {editorOpen ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-8 overflow-hidden ${frame}`}
        >
          <div className="border-b border-sky-100/80 bg-gradient-to-br from-sky-50/40 via-white to-violet-50/20 px-6 py-4">
            <h2 className="text-lg font-bold text-slate-900">{form.id ? 'Edit post' : 'New blog post'}</h2>
          </div>
          <form onSubmit={onSubmit} className="space-y-4 p-6">
            <div>
              <label className={labelCls}>Title *</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => onTitleChange(e.target.value)}
                className={inputCls}
                placeholder="e.g. 5 CRO wins from a 12-week Shopify rebuild"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Slug (URL) *</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  className={inputCls}
                  placeholder="auto-generated from title"
                />
              </div>
              <div>
                <label className={labelCls}>Author</label>
                <input
                  type="text"
                  value={form.author_name}
                  onChange={(e) => setForm((f) => ({ ...f, author_name: e.target.value }))}
                  className={inputCls}
                  placeholder="e.g. Hamza Ahmed"
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Excerpt</label>
              <textarea
                rows={2}
                value={form.excerpt}
                onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
                className={`${inputCls} resize-none`}
                placeholder="One or two sentences summarising the post — shown on listing cards and social previews."
                maxLength={500}
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Cover image</label>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden />
                  SEO
                </span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <div className="relative flex h-36 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white sm:w-56">
                  {(() => {
                    const preview = blogPostCoverUrl({
                      cover_image_path: form.cover_image_path,
                      cover_image_url: form.cover_image_url,
                    });
                    return preview ? (
                      <img
                        src={preview}
                        alt={form.cover_image_alt || 'Cover preview'}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="px-4 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
                        No cover yet
                      </span>
                    );
                  })()}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-sky-300/70 hover:bg-sky-50/60 hover:text-sky-700 disabled:opacity-60"
                    >
                      {uploading ? 'Uploading…' : 'Upload image'}
                    </button>
                    {(form.cover_image_path || form.cover_image_url) && (
                      <button
                        type="button"
                        onClick={clearCover}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50"
                      >
                        Clear
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void uploadCover(file);
                      }}
                    />
                  </div>
                  <input
                    type="url"
                    value={form.cover_image_url}
                    onChange={(e) => setForm((f) => ({ ...f, cover_image_url: e.target.value, cover_image_path: e.target.value ? '' : f.cover_image_path }))}
                    className={inputCls}
                    placeholder="…or paste an external image URL"
                  />
                  <p className="text-xs text-slate-500">
                    Uploaded cover is served from Supabase Storage (public bucket “blog-images”). Max {ERP_MAX_UPLOAD_MB} MB.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
                    <span>
                      Alt text <span className="text-rose-500">*</span>
                    </span>
                    <span className="font-semibold normal-case text-[10px] tracking-normal text-slate-400">
                      {form.cover_image_alt.length}/125
                    </span>
                  </label>
                  <input
                    type="text"
                    value={form.cover_image_alt}
                    onChange={(e) => setForm((f) => ({ ...f, cover_image_alt: e.target.value }))}
                    className={inputCls}
                    placeholder="e.g. Shopify checkout dashboard showing a 28% lift in conversions"
                    maxLength={125}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Describe the image for screen readers &amp; search engines. Keep it short, specific, and under 125 characters.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Caption (optional)
                  </label>
                  <input
                    type="text"
                    value={form.cover_image_caption}
                    onChange={(e) => setForm((f) => ({ ...f, cover_image_caption: e.target.value }))}
                    className={inputCls}
                    placeholder="Shown below the cover on the article page."
                    maxLength={160}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Image title &amp; filename are also used by search engines — upload with a descriptive file name.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Tags (comma-separated)</label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  className={inputCls}
                  placeholder="Shopify, CRO, Case study"
                />
              </div>
              <div>
                <label className={labelCls}>Read time (minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={form.read_minutes}
                  onChange={(e) => setForm((f) => ({ ...f, read_minutes: e.target.value }))}
                  className={inputCls}
                  placeholder="Auto-calculated if blank"
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Content</label>
              <p className="mb-2 text-xs text-slate-500">
                <strong>Rich text editor</strong> — bold, lists, and links look like the live article. Or paste/write HTML; scripts are stripped. Saved as markdown or HTML; the blog page still renders it safely.
              </p>
              <BlogContentEditor
                value={form.content}
                onChange={(next) => setForm((f) => ({ ...f, content: next }))}
                editorResetKey={form.id ? `${form.id}-${contentEditorKey}` : `new-${contentEditorKey}`}
                placeholder="Write the article here — use the toolbar for bold, headings, images, and code."
                onError={(msg) => setErr(msg)}
              />
            </div>

            <label className="inline-flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
                className="h-4 w-4 accent-sky-600"
              />
              <span className="text-sm font-semibold text-slate-700">Publish (visible on /blog)</span>
            </label>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl erp-brand-fill px-5 py-2.5 font-bold text-white shadow-lg shadow-sky-500/20 disabled:opacity-50"
              >
                {saving ? 'Saving…' : form.id ? 'Update post' : 'Create post'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditorOpen(false);
                  setForm(emptyForm());
                }}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              {form.id && form.slug ? (
                <a
                  href={`${MARKETING_ORIGIN}/blog/${form.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Preview
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 3h7v7m0-7L10 14m-4 0v6h12v-6" />
                  </svg>
                </a>
              ) : null}
            </div>
          </form>
        </motion.div>
      ) : null}

      {loading ? (
        <div className={`overflow-hidden ${frame}`}>
          <div className="flex justify-center py-14">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#589CD5] border-t-transparent" />
          </div>
        </div>
      ) : posts.length === 0 ? (
        <div className={`overflow-hidden text-center ${frame}`}>
          <div className="p-12">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-cyan-100 text-sky-700 ring-2 ring-white">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8.25 15.75l3.5-8.5 3.5 8.5m-6.125-3h5.25M5.25 4.5h13.5c.828 0 1.5.672 1.5 1.5v13.5c0 .828-.672 1.5-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5V6c0-.828.672-1.5 1.5-1.5z" />
              </svg>
            </div>
            <p className="font-semibold text-slate-800">No blog posts yet.</p>
            <p className="mt-1 text-sm text-slate-500">Click “New post” to write your first story.</p>
          </div>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {paginated.map((post) => {
              const cover = blogPostCoverUrl(post);
              return (
                <li key={post.id}>
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`overflow-hidden ${frame}`}
                  >
                    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-stretch sm:gap-5 sm:p-5">
                      <div className="relative h-28 w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-24 sm:w-40">
                        {cover ? (
                          <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-50 to-cyan-50 text-slate-400">
                            <span className="text-[10px] font-bold uppercase tracking-wider">No cover</span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                              post.published
                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${post.published ? 'bg-emerald-500' : 'bg-slate-400'}`}
                              aria-hidden
                            />
                            {post.published ? 'Published' : 'Draft'}
                          </span>
                          <span className="text-xs text-slate-500">{formatPostedAt(post)}</span>
                          {(post.tags || []).slice(0, 3).map((t) => (
                            <span key={t} className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-700 ring-1 ring-sky-100">
                              {t}
                            </span>
                          ))}
                        </div>
                        <h3 className="mt-1.5 truncate text-lg font-bold text-slate-900">{post.title}</h3>
                        {post.excerpt ? (
                          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{post.excerpt}</p>
                        ) : null}
                        <div className="mt-2 text-xs text-slate-500">/blog/{post.slug}</div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch sm:justify-center">
                        <button
                          type="button"
                          onClick={() => togglePublished(post)}
                          className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                            post.published
                              ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                              : 'border border-transparent bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm hover:shadow-md'
                          }`}
                        >
                          {post.published ? 'Unpublish' : 'Publish'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(post)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-sky-300/70 hover:bg-sky-50/60 hover:text-sky-700"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(post)}
                          className="rounded-xl border border-rose-200/80 bg-white px-3 py-2 text-xs font-bold text-rose-700 shadow-sm transition hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 ? (
            <div className="mt-8 flex items-center justify-between gap-4 border-t border-[#589CD5]/15 pt-6">
              <p className="text-sm text-slate-500 tabular-nums">
                Page <span className="font-semibold text-slate-700">{pageSafe}</span> of{' '}
                <span className="font-semibold text-slate-700">{totalPages}</span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pageSafe <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={pageSafe >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <ErpConfirmDialog
        open={Boolean(confirmDelete)}
        title={confirmDelete ? `Delete “${confirmDelete.title}”?` : 'Delete post?'}
        confirmLabel="Delete post"
        tone="danger"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={deletePost}
      >
        <p>This removes the post and its cover image. Anyone visiting its URL will see a 404.</p>
      </ErpConfirmDialog>
    </>
  );
}
