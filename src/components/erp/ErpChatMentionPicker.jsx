'use client';

import { useLayoutEffect, useState } from 'react';
import ErpBodyPortal from './ErpBodyPortal';

const LIST_CLASS =
  'overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-xl [scrollbar-width:thin] ' +
  'dark:border-teal-900/50 dark:bg-[#101a22] dark:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.65)]';

/**
 * Portals the @mention list above the composer so overflow-hidden shells do not clip it.
 */
export default function ErpChatMentionPicker({
  open,
  anchorRef,
  pickerRef,
  id = 'erp-mention-listbox',
  children,
  className = '',
}) {
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return undefined;
    }
    const el = anchorRef?.current;
    if (!el) return undefined;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const gap = 6;
      const maxH = 192;
      const spaceAbove = rect.top - gap;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const openAbove = spaceAbove >= 96 || spaceAbove >= spaceBelow;
      const width = Math.min(rect.width, window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));

      if (openAbove) {
        setStyle({
          position: 'fixed',
          left,
          width,
          bottom: window.innerHeight - rect.top + gap,
          maxHeight: Math.min(maxH, Math.max(120, spaceAbove - 8)),
          zIndex: 920,
        });
      } else {
        setStyle({
          position: 'fixed',
          left,
          width,
          top: rect.bottom + gap,
          maxHeight: Math.min(maxH, Math.max(120, spaceBelow - 8)),
          zIndex: 920,
        });
      }
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef]);

  if (!open || !style) return null;

  return (
    <ErpBodyPortal>
      <div ref={pickerRef} id={id} role="listbox" style={style} className={`${LIST_CLASS} ${className}`.trim()}>
        {children}
      </div>
    </ErpBodyPortal>
  );
}
