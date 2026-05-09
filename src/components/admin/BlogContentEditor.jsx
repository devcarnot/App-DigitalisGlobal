'use client';
import React, { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';

// Lazy-load the editor so the admin shell + blog list pages don't pay the
// `isomorphic-dompurify` / `turndown` cost up-front (~250-300KB).
const MarkdownWysiwygEditor = dynamic(() => import('../MarkdownWysiwygEditor'), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden
      className="h-32 w-full animate-pulse rounded-2xl border border-slate-200 bg-slate-100/70 dark:border-slate-700 dark:bg-slate-900"
    />
  ),
});

const MAX_INLINE_IMAGE_BYTES = 6 * 1024 * 1024;
const EMOJIS = ['😀', '👍', '❤️', '🎉', '🔥', '🚀', '✨', '💡'];

function btnCls(active = false) {
  return `flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
    active
      ? 'border-[#103D4D]/40 bg-cyan-50 text-[#103D4D]'
      : 'border-transparent bg-slate-100/90 text-slate-600 hover:bg-slate-200/90'
  }`;
}

/**
 * @param {{ value: string, onChange: (v: string) => void, placeholder?: string, onError?: (m: string) => void, editorResetKey: string }} props
 * `editorResetKey` should change when switching posts so the WYSIWYG reloads the right content.
 */
export default function BlogContentEditor({ value, onChange, placeholder, onError, editorResetKey = 'default' }) {
  const wysRef = useRef(null);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const uploadInlineImage = async (file) => {
    if (file == null) return;
    if (!supabase) return;
    if (file.size > MAX_INLINE_IMAGE_BYTES) {
      onError?.(`Image must be under ${Math.round(MAX_INLINE_IMAGE_BYTES / 1024 / 1024)} MB.`);
      return;
    }
    const alt =
      typeof window !== 'undefined'
        ? window.prompt('Alt text for this image (describe it for screen readers & SEO):', '')
        : '';
    const safeAlt = String(alt || '').replace(/[\]\r\n]+/g, ' ').trim();
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const fname = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `inline/${fname}`;
      const { error } = await supabase.storage
        .from('blog-images')
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || 'image/jpeg' });
      if (error) {
        onError?.(error.message || 'Upload failed');
        return;
      }
      const { data } = supabase.storage.from('blog-images').getPublicUrl(path);
      const url = data?.publicUrl;
      if (!url) {
        onError?.('Could not resolve image URL');
        return;
      }
      wysRef.current?.insertImageFromUrl(url, safeAlt);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60">
      <div className="px-0 pt-0">
        <MarkdownWysiwygEditor
          ref={wysRef}
          value={value || ''}
          onChange={onChange}
          resetKey={editorResetKey}
          placeholder={placeholder}
          editorClassName="min-h-[22rem] font-sans !rounded-2xl !border-0"
          className="border-0 bg-transparent"
          extraToolbar={
            <>
              <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden />
              {[1, 2, 3, 4, 5].map((lvl) => (
                <button
                  key={`blog-h${lvl}`}
                  type="button"
                  title={`Heading ${lvl}`}
                  className={btnCls()}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => wysRef.current?.insertHeading(lvl)}
                >
                  H{lvl}
                </button>
              ))}
              <button
                type="button"
                title="Code block"
                className={btnCls()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wysRef.current?.insertFencedCodeBlock()}
              >
                <span className="font-mono text-[10px] leading-none">{'{ }'}</span>
              </button>
              <button
                type="button"
                disabled={uploading}
                title="Insert image"
                className={btnCls()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  <span
                    className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent"
                    aria-hidden
                  />
                ) : (
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void uploadInlineImage(f);
                }}
              />
              <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden />
              <span className="flex flex-wrap items-center gap-0.5" title="Quick emoji">
                {EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-sm hover:bg-slate-200/80"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => wysRef.current?.insertTextSnippet(em)}
                  >
                    {em}
                  </button>
                ))}
              </span>
            </>
          }
        />
      </div>
    </div>
  );
}
