'use client';

import { chatMessageBodyToCopyPlain } from './erp-chat-copy-plain';
import { erpMarkdownToClipboardHtml } from './erp-chat-markdown-sync';
import { writeRichClipboard } from './erp-rich-clipboard';
import { parseForwardForDisplay } from './erp-forward-message';

/** Copy a stored chat / description body with formatting preserved for Gmail, Word, etc. */
export async function copyRichTextBody(body) {
  const forwardInfo = parseForwardForDisplay(body);
  const displayText = forwardInfo ? forwardInfo.innerBody : String(body || '');
  const plain = chatMessageBodyToCopyPlain(body);
  if (!plain && !displayText.trim()) return false;

  const html = await erpMarkdownToClipboardHtml(displayText);
  return writeRichClipboard({ plain, html });
}

/** @deprecated alias */
export async function copyChatMessageBody(body) {
  return copyRichTextBody(body);
}
