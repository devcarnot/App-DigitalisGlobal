/**
 * Project brief attachments (same shape as erp_messages.attachments).
 * @param {unknown} raw
 * @returns {{ path: string, name: string, mime?: string }[]}
 */
export function normalizeProjectAttachments(raw) {
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
  return raw.filter((a) => a && typeof a.path === 'string' && typeof a.name === 'string');
}

const DEFAULT_MAX_FILES = 5;
const DEFAULT_MAX_BYTES_PER_FILE = 9 * 1024 * 1024; // stay under typical provider limits

function safeAttachmentFilename(name) {
  const base = String(name || 'file')
    .replace(/[/\\]/g, '_')
    .replace(/[^\w.\-()\s+]/g, '_')
    .trim()
    .slice(0, 180);
  return base || 'file';
}

/**
 * Download project brief files for outbound email (service role).
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {unknown} rawMeta
 * @param {{ maxFiles?: number, maxBytesPerFile?: number }} [opts]
 */
export async function downloadProjectAttachmentsForEmail(admin, rawMeta, opts = {}) {
  if (!admin) return { resendAttachments: [], skippedNames: [] };
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
  const maxBytes = opts.maxBytesPerFile ?? DEFAULT_MAX_BYTES_PER_FILE;
  const list = normalizeProjectAttachments(rawMeta).slice(0, maxFiles);
  const resendAttachments = [];
  const skippedNames = [];

  for (const a of list) {
    const { data, error } = await admin.storage.from('erp-files').download(a.path);
    if (error || !data) {
      skippedNames.push(a.name);
      continue;
    }
    const buf = Buffer.from(await data.arrayBuffer());
    if (buf.length > maxBytes) {
      skippedNames.push(a.name);
      continue;
    }
    resendAttachments.push({
      filename: safeAttachmentFilename(a.name),
      content: buf,
    });
  }

  return { resendAttachments, skippedNames };
}
