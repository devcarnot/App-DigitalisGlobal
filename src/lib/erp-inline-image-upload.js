'use client';

import { erpAuthorizedFetch } from './erp-client-api';
import { ERP_MAX_UPLOAD_BYTES, ERP_MAX_UPLOAD_MB } from './erp-upload-limits';

/** Cap on a single inline image (same as general ERP file uploads). */
export const ERP_INLINE_IMAGE_MAX_BYTES = ERP_MAX_UPLOAD_BYTES;

/**
 * Upload a single image for inline description editors (paste / drop).
 * Uses the server API so storage RLS cannot block the upload.
 *
 * @param {File} file
 * @param {{ folder?: string, projectId?: string }} [opts]
 * @returns {Promise<{ url: string, path: string } | null>}
 */
export async function uploadInlineImageToErpFiles(file, opts = {}) {
  if (!file) return null;

  if (!String(file.type || '').startsWith('image/')) {
    throw new Error('File is not an image');
  }
  if (typeof file.size === 'number' && file.size > ERP_INLINE_IMAGE_MAX_BYTES) {
    throw new Error(`Image too large (max ${ERP_MAX_UPLOAD_MB} MB)`);
  }

  const form = new FormData();
  form.append('file', file);
  if (opts.folder) form.append('folder', String(opts.folder));
  if (opts.projectId) form.append('projectId', String(opts.projectId));

  const res = await erpAuthorizedFetch('/api/erp/uploads/inline-image', {
    method: 'POST',
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Could not upload image');
  }
  if (!data.url) {
    throw new Error('Could not resolve an image URL after upload');
  }
  return { url: data.url, path: data.path };
}
