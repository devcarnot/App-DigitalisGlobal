'use client';

import { chatMessageBodyToCopyPlain } from './erp-chat-copy-plain';
import { contentToViewerHtml } from './rich-text/rich-text-format';
import { writeRichClipboard } from './erp-rich-clipboard';
import { parseForwardForDisplay } from './erp-forward-message';

/** Copy a stored chat / description body with formatting preserved for Gmail, Word, etc. */
export async function copyRichTextBody(body, format = 'markdown') {
  const forwardInfo = parseForwardForDisplay(body);
  const displayText = forwardInfo ? forwardInfo.innerBody : String(body || '');
  const plain = chatMessageBodyToCopyPlain(body);
  if (!plain && !displayText.trim()) return false;

  const html = contentToViewerHtml({ body: displayText, format });
  return writeRichClipboard({ plain, html });
}

/** @deprecated alias */
export async function copyChatMessageBody(body) {
  return copyRichTextBody(body);
}
