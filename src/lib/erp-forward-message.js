/**
 * Shared helpers for forwarding chat messages (DM, group, project channel).
 */

function safeFileBase(name) {
  const s = String(name || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 100);
  return s || 'file';
}

export function normalizeForwardAttachments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((a) => a && typeof a.path === 'string' && String(a.path).trim())
      .map((a) => ({
        path: String(a.path).trim(),
        name: String(a.name || 'file').slice(0, 200),
        mime: String(a.mime || 'application/octet-stream').slice(0, 120),
      }));
  }
  return [];
}

/** Normalize attachments from a stored message row (array + legacy single fields). */
export function attachmentsFromMessageRow(message) {
  if (!message) return [];
  const fromArray = normalizeForwardAttachments(message.attachments);
  if (fromArray.length) return fromArray;
  const legacyPath = String(message.attachment_path || '').trim();
  if (!legacyPath) return [];
  return [
    {
      path: legacyPath,
      name: String(message.attachment_name || 'file').slice(0, 200),
      mime: String(message.attachment_mime || 'application/octet-stream').slice(0, 120),
    },
  ];
}

function quoteMarkdown(body) {
  const trimmed = String(body || '').replace(/\s+$/g, '');
  if (!trimmed) return '';
  return trimmed
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

/**
 * Build the forwarded message body. Uses a markdown blockquote so renderers
 * (`ChatMessageHtml`) display it as a quoted attribution.
 */
export function buildForwardedBody({ body, senderName }) {
  const cleanName = senderName ? String(senderName).replace(/[*_`]/g, '') : '';
  const attribution = `> _Forwarded${cleanName ? ` from **${cleanName}**` : ''}_`;
  const quoted = quoteMarkdown(body);
  if (!quoted) return attribution;
  return `${attribution}\n>\n${quoted}`;
}

/** Build the payload the forward modal / API expects from a chat message row. */
export function messageToForwardSource(message, senderName) {
  return {
    body: String(message?.body || ''),
    attachments: attachmentsFromMessageRow(message),
    senderName: senderName || 'Member',
  };
}

export function dmPairFolder(a, b) {
  return a < b ? `dm/${a}/${b}` : `dm/${b}/${a}`;
}

export function groupForwardFolder(groupId) {
  return `groups/${groupId}`;
}

export function projectChatForwardFolder(projectId, userId) {
  return `${projectId}/${userId}/chat`;
}

export function forwardDestinationPrefix({ type, userId, recipientId, groupId, projectId }) {
  if (type === 'person') {
    if (!userId || !recipientId) return null;
    return dmPairFolder(userId, recipientId);
  }
  if (type === 'group') {
    if (!groupId) return null;
    return groupForwardFolder(groupId);
  }
  if (type === 'channel') {
    if (!projectId || !userId) return null;
    return projectChatForwardFolder(projectId, userId);
  }
  return null;
}

export function buildForwardStoragePath(prefix, name) {
  const fname = `${crypto.randomUUID()}_${safeFileBase(name)}`;
  return `${prefix}/${fname}`;
}
