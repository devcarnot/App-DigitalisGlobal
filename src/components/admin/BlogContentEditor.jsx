'use client';
import React, { useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ERP_MAX_UPLOAD_BYTES, ERP_MAX_UPLOAD_MB } from '../../lib/erp-upload-limits';
import ErpRichTextField from '../erp/ErpWysiwygMarkdownField';

const MAX_INLINE_IMAGE_BYTES = ERP_MAX_UPLOAD_BYTES;

/**
 * @param {{ value: string, onChange: (v: string) => void, placeholder?: string, onError?: (m: string) => void, editorResetKey: string, format?: string }} props
 * `editorResetKey` should change when switching posts so the editor reloads the right content.
 */
export default function BlogContentEditor({
  value,
  onChange,
  placeholder,
  onError,
  editorResetKey = 'default',
  format = 'markdown',
}) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const insertImageFromFile = async (file, editor) => {
    if (file == null || !supabase) return;
    if (file.size > MAX_INLINE_IMAGE_BYTES) {
      onError?.(`Image must be under ${ERP_MAX_UPLOAD_MB} MB.`);
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
      if (editor) {
        editor.chain().focus().setImage({ src: url, alt: safeAlt }).run();
        onChange?.(editor.getHTML());
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60">
      <div className="flex items-center gap-2 border-b border-slate-200/80 bg-white/80 px-3 py-2">
        <button
          type="button"
          disabled={uploading}
          title="Insert image"
          className="rounded-full border border-transparent bg-slate-100/90 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200/90 disabled:opacity-60"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? 'Uploading…' : 'Insert image'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void insertImageFromFile(f, null);
          }}
        />
      </div>
      <div className="px-0 pt-0">
        <ErpRichTextField
          key={editorResetKey}
          value={value || ''}
          format={format}
          onChange={onChange}
          placeholder={placeholder}
          minHeight="22rem"
          editorClassName="min-h-[22rem] font-sans !rounded-none !border-0"
          className="border-0 bg-transparent shadow-none"
          onImagePaste={(files, editor) => {
            const file = Array.isArray(files) ? files[0] : files;
            if (file) void insertImageFromFile(file, editor);
          }}
        />
      </div>
    </div>
  );
}
