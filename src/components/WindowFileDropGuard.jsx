'use client';

import { useEffect } from 'react';

/**
 * App-wide guard that prevents the browser default for stray file drops.
 *
 * Without this, dragging an image file onto any non-dropzone region (a
 * description editor that hasn't wired drop handlers yet, blank space inside
 * a modal, etc.) makes the browser navigate the current tab to the file URL,
 * which in the desktop shell looks like "the image opened in a new browser
 * tab and didn't paste". By calling `preventDefault()` on any drag/drop that
 * carries `Files`, descendants stay in control: they can still preventDefault
 * + handle the drop themselves, but if nobody handles it, nothing breaks.
 *
 * We intentionally only intercept when the payload has a file: text drags
 * (e.g. selecting and dragging text within a textarea) keep their native
 * behaviour.
 */
export default function WindowFileDropGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const carriesFiles = (e) => {
      const types = e?.dataTransfer?.types;
      if (!types) return false;
      // `types` can be a DOMStringList or array; `.includes` works on both
      // in evergreen browsers, with a length-loop fallback for safety.
      if (typeof types.includes === 'function') return types.includes('Files');
      for (let i = 0; i < types.length; i += 1) {
        if (types[i] === 'Files') return true;
      }
      return false;
    };

    const onDragOver = (e) => {
      if (carriesFiles(e)) e.preventDefault();
    };
    const onDrop = (e) => {
      if (carriesFiles(e)) e.preventDefault();
    };

    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return null;
}
