/**
 * Helpers for chat read / seen receipts (cursor-based, WhatsApp-style).
 */

/** @param {string | null | undefined} messageCreatedAt */
export function messageReadByCursor(messageCreatedAt, readerLastReadAt) {
  if (!messageCreatedAt || !readerLastReadAt) return false;
  return new Date(readerLastReadAt).getTime() >= new Date(messageCreatedAt).getTime();
}

/**
 * @param {{
 *   messageCreatedAt: string,
 *   readStatesByUserId?: Record<string, { last_read_at?: string | null } | null | undefined>,
 *   audienceUserIds?: string[],
 *   excludeUserId?: string | null,
 *   nameById?: Record<string, string>,
 * }} opts
 */
export function computeMessageSeenBy(opts) {
  const {
    messageCreatedAt,
    readStatesByUserId = {},
    audienceUserIds = [],
    excludeUserId = null,
    nameById = {},
  } = opts;

  const seenBy = [];
  const pendingBy = [];

  for (const userId of audienceUserIds) {
    if (!userId || userId === excludeUserId) continue;
    const readAt = readStatesByUserId[userId]?.last_read_at || null;
    const name = nameById[userId] || 'Member';
    if (messageReadByCursor(messageCreatedAt, readAt)) {
      seenBy.push({ userId, name, readAt });
    } else {
      pendingBy.push({ userId, name });
    }
  }

  seenBy.sort((a, b) => new Date(a.readAt).getTime() - new Date(b.readAt).getTime());

  return {
    seenBy,
    pendingBy,
    seenCount: seenBy.length,
    totalCount: seenBy.length + pendingBy.length,
  };
}

/**
 * @param {{ seenCount?: number, totalCount?: number }} summary
 */
export function groupReceiptStatus(summary) {
  const seenCount = Number(summary?.seenCount) || 0;
  const totalCount = Number(summary?.totalCount) || 0;
  if (totalCount <= 0) return 'sent';
  if (seenCount <= 0) return 'sent';
  if (seenCount >= totalCount) return 'read';
  return 'partial';
}

export function formatChatReceiptTime(iso) {
  if (!iso) return 'n/a';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'n/a';
  }
}
