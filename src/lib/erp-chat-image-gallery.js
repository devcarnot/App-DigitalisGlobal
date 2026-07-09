/**
 * Build a chronological image gallery for chat threads (DM, group, project).
 */

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|svg|avif|heic|heif)(?:\?|#|$)/i;

/** @param {{ path?: string, url?: string, name?: string, mime?: string | null, mimetype?: string | null } | null | undefined} item */
export function isChatImagePreviewItem(item) {
  if (!item) return false;
  const mime = String(item.mime || item.mimetype || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const ref = String(item.path || item.url || item.name || '');
  return IMAGE_EXT_RE.test(ref);
}

/** @param {string} body */
export function extractInlineImagesFromMarkdown(body) {
  const items = [];
  const text = String(body || '');
  const mdRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match = mdRe.exec(text);
  while (match) {
    const url = String(match[2] || '').trim();
    if (/^https?:\/\//i.test(url)) {
      items.push({
        url,
        name: String(match[1] || '').trim() || 'image',
        mime: null,
      });
    }
    match = mdRe.exec(text);
  }
  return items;
}

/** @param {object} a */
export function normalizeChatPreviewAttachment(a) {
  return {
    path: String(a?.path || '').trim(),
    url: String(a?.url || '').trim(),
    name: String(a?.name || 'file'),
    mime: a?.mime || a?.mimetype || null,
  };
}

/**
 * @param {object[]} messages
 * @param {{ normalizeAttachments?: (m: object) => object[] }} [opts]
 * @returns {object[]}
 */
export function buildChatImageGallery(messages, opts = {}) {
  const normalizeAttachments =
    opts.normalizeAttachments ||
    ((m) => (Array.isArray(m?.attachments) ? m.attachments : []));

  const gallery = [];
  const sorted = [...(messages || [])].sort((a, b) => {
    const ta = new Date(a?.created_at || 0).getTime();
    const tb = new Date(b?.created_at || 0).getTime();
    return ta - tb;
  });

  for (const message of sorted) {
    if (message?.deleted_at) continue;

    for (const raw of normalizeAttachments(message)) {
      const item = normalizeChatPreviewAttachment(raw);
      if (item.path && isChatImagePreviewItem(item)) {
        gallery.push({ path: item.path, name: item.name, mime: item.mime });
      }
    }

    for (const inline of extractInlineImagesFromMarkdown(message?.body)) {
      if (isChatImagePreviewItem(inline)) {
        gallery.push({ url: inline.url, name: inline.name, mime: null });
      }
    }
  }

  return gallery;
}

/**
 * @param {object[]} gallery
 * @param {{ path?: string, url?: string }} target
 */
export function findChatImageGalleryIndex(gallery, target) {
  if (!Array.isArray(gallery) || gallery.length === 0) return -1;
  const path = String(target?.path || '').trim();
  const url = String(target?.url || '').trim();

  if (path) {
    const idx = gallery.findIndex((item) => item.path === path);
    if (idx >= 0) return idx;
  }

  if (url) {
    const exact = gallery.findIndex((item) => item.url === url);
    if (exact >= 0) return exact;
    const base = url.split('?')[0];
    const fuzzy = gallery.findIndex((item) => item.url && item.url.split('?')[0] === base);
    if (fuzzy >= 0) return fuzzy;
  }

  return -1;
}

/**
 * @param {object} target
 * @param {object[]} gallery
 */
export function mergePreviewWithGallery(target, gallery) {
  // Only image previews participate in the swipeable gallery. Attaching the
  // thread's image list to a PDF/DOCX/etc. made findChatImageGalleryIndex fall
  // back to 0, so the modal showed the first chat image instead of the file.
  if (!isChatImagePreviewItem(target)) {
    return { ...target, gallery: null, galleryIndex: 0 };
  }
  const normalizedTarget = normalizeChatPreviewAttachment(target);
  const list = Array.isArray(gallery) ? gallery.filter(isChatImagePreviewItem) : [];
  const index = findChatImageGalleryIndex(list, normalizedTarget);

  // Brief attachments and inline images may not be in the chat-only gallery.
  // Never default to index 0 — that showed the wrong image in the lightbox.
  if (index < 0) {
    return { ...target, gallery: null, galleryIndex: 0 };
  }

  if (list.length <= 1) {
    return { ...target, gallery: list.length ? list : null, galleryIndex: 0 };
  }

  return {
    ...target,
    gallery: list,
    galleryIndex: index,
  };
}
