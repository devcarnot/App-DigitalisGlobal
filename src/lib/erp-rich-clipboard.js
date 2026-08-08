'use client';

/**
 * Write both plain text and HTML to the clipboard (Gmail / Word / Docs style).
 * Falls back to plain text when the ClipboardItem API is unavailable.
 */
export async function writeRichClipboard({ plain = '', html = '' }) {
  const text = String(plain ?? '');
  const htmlBody = String(html ?? '').trim();
  const htmlPayload = htmlBody
    ? htmlBody.includes('<meta charset')
      ? htmlBody
      : `<meta charset='utf-8'>${htmlBody}`
    : '';

  if (htmlPayload && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([htmlPayload], { type: 'text/html' }),
        }),
      ]);
      return true;
    } catch {
      /* fall through */
    }
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  return false;
}
