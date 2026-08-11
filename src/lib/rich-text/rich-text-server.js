import { sanitizeRichHtml } from './sanitize-rich-html';
import { prepareRichContentForSave, normalizeFormat } from './rich-text-format';

export { sanitizeRichHtml, prepareRichContentForSave, normalizeFormat };

/** Server-side authoritative sanitise before DB write. */
export function sanitizeRichBodyForPersist(body, format) {
  const fmt = normalizeFormat(format);
  if (fmt !== 'html') {
    return { body: String(body || ''), format: fmt };
  }
  const prepared = prepareRichContentForSave(body);
  return { body: prepared.body, format: prepared.format };
}
