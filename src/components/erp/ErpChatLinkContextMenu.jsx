'use client';

import { useEffect, useRef } from 'react';
import ErpBodyPortal from './ErpBodyPortal';
import { ERP_DARK_MENU_PORTAL } from '../../lib/erp-dark-surfaces';

/** WhatsApp-style link menu for Electron desktop (old shells lack native link menus). */
export default function ErpChatLinkContextMenu({ menu, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!menu) return undefined;
    function onDoc(e) {
      if (panelRef.current?.contains(e.target)) return;
      onClose?.();
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('mousedown', onDoc);
    window.addEventListener('touchstart', onDoc, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDoc);
      window.removeEventListener('touchstart', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, onClose]);

  if (!menu?.href) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(menu.href);
    } catch {
      /* ignore */
    }
    onClose?.();
  };

  const openLink = () => {
    try {
      window.open(menu.href, '_blank', 'noopener,noreferrer');
    } catch {
      /* ignore */
    }
    onClose?.();
  };

  return (
    <ErpBodyPortal>
      <div
        ref={panelRef}
        role="menu"
        aria-label="Link actions"
        className={`fixed z-[9999] min-w-[11rem] overflow-hidden rounded-xl border border-slate-200/90 bg-white py-1 shadow-[0_10px_38px_rgba(15,23,42,0.16)] ring-1 ring-black/5 ${ERP_DARK_MENU_PORTAL}`}
        style={{ left: menu.x, top: menu.y }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => void copyLink()}
          className="block w-full px-3 py-2 text-left text-[13px] font-medium text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/10"
        >
          Copy link
        </button>
        <div className="my-1 h-px bg-slate-200/90 dark:bg-white/10" aria-hidden />
        <button
          type="button"
          role="menuitem"
          onClick={openLink}
          className="block w-full px-3 py-2 text-left text-[13px] font-medium text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/10"
        >
          Open link in browser
        </button>
      </div>
    </ErpBodyPortal>
  );
}
