'use client';

import { supabase } from './supabase';

import { ERP_MAX_UPLOAD_BYTES, ERP_MAX_UPLOAD_MB } from './erp-upload-limits';

/** Cap on a single inline image (same as general ERP file uploads). */
export const ERP_INLINE_IMAGE_MAX_BYTES = ERP_MAX_UPLOAD_BYTES;

/** Long-lived signed URL (1 year). Most descriptions live for years and we
 *  don't want to render-time re-sign every <img>, so we trade off here. */
const ERP_INLINE_IMAGE_SIGN_SECONDS = 60 * 60 * 24 * 365;

function safeImageExt(file) {
  const fromName = String(file?.name || '').split('.').pop() || '';
  const cleaned = fromName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleaned) return cleaned.slice(0, 8);
  const mime = String(file?.type || '').toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/svg+xml') return 'svg';
  return 'png';
}

/**
 * Upload a single image into the shared `erp-files` bucket and return a
 * long-lived signed URL we can drop into a markdown editor as
 * `![alt](url)`.
 *
 * Throws on any unrecoverable error (bucket misconfig, RLS denial, file
 * too large, …) — callers should `try/catch` and surface the message.
 *
 * @param {File} file
 * @param {{ folder?: string }} [opts]
 *   `folder` = path prefix inside the bucket (default `inline`).
 * @returns {Promise<{ url: string, path: string } | null>}
 */
export async function uploadInlineImageToErpFiles(file, opts = {}) {
  if (!file) return null;
  if (!supabase) throw new Error('Storage not configured');

  if (!String(file.type || '').startsWith('image/')) {
    throw new Error('File is not an image');
  }
  if (typeof file.size === 'number' && file.size > ERP_INLINE_IMAGE_MAX_BYTES) {
    throw new Error(`Image too large (max ${ERP_MAX_UPLOAD_MB} MB)`);
  }

  const ext = safeImageExt(file);
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const folder = String(opts.folder || 'inline').replace(/^\/+|\/+$/g, '') || 'inline';
  const path = `${folder}/${stamp}-${rand}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('erp-files')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'image/png',
    });
  if (upErr) throw upErr;

  // Prefer a long-lived signed URL (works for private buckets).
  const { data: signed, error: signErr } = await supabase.storage
    .from('erp-files')
    .createSignedUrl(path, ERP_INLINE_IMAGE_SIGN_SECONDS);
  if (!signErr && signed?.signedUrl) {
    return { url: signed.signedUrl, path };
  }

  // Public-bucket fallback so we don't lose the upload on private/public mix.
  const { data: pub } = supabase.storage.from('erp-files').getPublicUrl(path);
  if (pub?.publicUrl) return { url: pub.publicUrl, path };

  throw new Error('Could not resolve an image URL after upload');
}
