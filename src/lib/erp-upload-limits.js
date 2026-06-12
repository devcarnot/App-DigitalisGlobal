/** Max size for a single ERP file or image upload (client + server). */
export const ERP_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ERP_MAX_UPLOAD_MB = Math.round(ERP_MAX_UPLOAD_BYTES / (1024 * 1024));

/** Fallback `<input accept>` when a parent does not supply its own file picker. */
export const ERP_CHAT_ATTACHMENT_ACCEPT =
  'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.html,.htm,text/html';

/**
 * Infer a sensible MIME type when the browser leaves `file.type` empty (common for .html on Windows).
 * @param {File | Blob | { name?: string, type?: string }} file
 */
export function guessErpFileMime(file) {
  const declared = String(file?.type || '').trim();
  if (declared && declared !== 'application/octet-stream') return declared;
  const lower = String(file?.name || '').toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (lower.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.xml')) return 'application/xml';
  if (lower.endsWith('.zip')) return 'application/zip';
  return declared || 'application/octet-stream';
}

/** Wrap a File with a resolved MIME when the browser omitted one. */
export function withGuessedErpFileMime(file) {
  if (!file) return file;
  const mime = guessErpFileMime(file);
  if (file.type === mime) return file;
  try {
    return new File([file], file.name, { type: mime, lastModified: file.lastModified });
  } catch {
    return file;
  }
}
