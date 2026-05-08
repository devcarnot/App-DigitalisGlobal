/**
 * WhatsApp-style: senders may edit chat text shortly after sending.
 */

export const ERP_MESSAGE_EDIT_WINDOW_MS = 30 * 60 * 1000;

export function canEditChatMessageByAge(createdAtIso, nowMs = Date.now()) {
  const t = createdAtIso ? new Date(createdAtIso).getTime() : NaN;
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= ERP_MESSAGE_EDIT_WINDOW_MS;
}
