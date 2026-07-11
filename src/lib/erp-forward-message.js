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

function parseForwardAttributionLine(line) {
  const trimmed = String(line || '').trim();
  const patterns = [
    /^>\s*_Forwarded(?:\s+from\s+\*\*(.+?)\*\*)?_\s*$/i,
    /^>\s*\*Forwarded(?:\s+from\s+\*\*(.+?)\*\*)?\*\s*$/i,
    /^>\s*Forwarded(?:\s+from)?\s+\*\*(.+?)\*\*/i,
    /^>\s*_Forwarded(?:\s+from)?\s+(.+?)_\s*$/i,
  ];
  for (const re of patterns) {
    const match = trimmed.match(re);
    if (match) {
      const senderName = String(match[1] || '')
        .replace(/\*\*/g, '')
        .trim();
      return { senderName };
    }
  }
  return null;
}

/** True when the stored body starts with a forwarded-message attribution line. */
export function isForwardedMessageBody(body) {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    return parseForwardAttributionLine(line) !== null;
  }
  return false;
}

/** Sender name from the outermost forward attribution, if any. */
export function extractOutermostForwardSender(body) {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const parsed = parseForwardAttributionLine(line);
    return parsed ? parsed.senderName : '';
  }
  return '';
}

/**
 * Strip one or more nested "Forwarded from …" wrappers and return the inner
 * message text (attachments are handled separately).
 */
export function unwrapForwardedBody(body) {
  let current = String(body || '').replace(/\r\n/g, '\n');

  for (let depth = 0; depth < 12; depth += 1) {
    const lines = current.split('\n');
    let index = 0;
    while (index < lines.length && !lines[index].trim()) index += 1;
    if (index >= lines.length) return '';

    const attribution = parseForwardAttributionLine(lines[index]);
    if (!attribution) return current.replace(/\s+$/g, '');

    index += 1;
    while (index < lines.length) {
      const trimmed = lines[index].trim();
      if (!trimmed) {
        index += 1;
        continue;
      }
      if (trimmed === '>') {
        index += 1;
        break;
      }
      break;
    }

    const rest = lines.slice(index).map((line) => {
      if (line.startsWith('> ')) return line.slice(2);
      if (line.trim() === '>') return '';
      return line;
    });
    current = rest.join('\n').replace(/\s+$/g, '');
  }

  return current.replace(/\s+$/g, '');
}

/** Collapse nested forwards to a single attribution + inner body for display. */
export function flattenForwardedBodyForDisplay(body) {
  if (!isForwardedMessageBody(body)) return String(body || '');
  const senderName = extractOutermostForwardSender(body) || 'Member';
  const inner = unwrapForwardedBody(body);
  return buildForwardedBody({ body: inner, senderName });
}

/** Structured forward payload for chat renderers (avoids nested markdown blockquotes). */
export function parseForwardForDisplay(body) {
  if (!isForwardedMessageBody(body)) return null;
  return {
    senderName: extractOutermostForwardSender(body) || 'Member',
    innerBody: unwrapForwardedBody(body),
  };
}

/**
 * Build the forwarded message body. Uses a markdown blockquote so renderers
 * (`ChatMessageHtml`) display it as a quoted attribution.
 */
export function buildForwardedBody({ body, senderName }) {
  const cleanName = senderName ? String(senderName).replace(/[*_`]/g, '') : '';
  const attribution = `> _Forwarded${cleanName ? ` from **${cleanName}**` : ''}_`;
  const innerBody = unwrapForwardedBody(body);
  const quoted = quoteMarkdown(innerBody);
  if (!quoted) return attribution;
  return `${attribution}\n>\n${quoted}`;
}

/** Build the payload the forward modal / API expects from a chat message row. */
export function messageToForwardSource(message, senderName) {
  const rawBody = String(message?.body || '');
  return {
    body: unwrapForwardedBody(rawBody),
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
