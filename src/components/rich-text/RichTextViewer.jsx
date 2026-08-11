'use client';

import { useMemo } from 'react';
import { contentToViewerHtml } from '../../lib/rich-text/rich-text-format';

const PROSE =
  'erp-rich-content erp-md-content min-w-0 max-w-full break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-slate-900 dark:text-slate-100';

export default function RichTextViewer({
  body = '',
  format = 'markdown',
  className = '',
  compact = false,
}) {
  const html = useMemo(() => contentToViewerHtml({ body, format }), [body, format]);
  if (!html) return null;

  return (
    <div
      className={`${PROSE} ${compact ? 'text-xs leading-relaxed' : ''} ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
