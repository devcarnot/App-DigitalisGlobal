'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Matches ErpShell mobile bottom nav (3.25rem grid + safe area). */
export const ERP_MOBILE_SHEET_BOTTOM_NAV_PX = 52;
/** Center FAB (h-11) sits half above the nav bar — used for inner scroll padding only. */
export const ERP_MOBILE_SHEET_FAB_OVERHANG_PX = 22;
/** Extra scroll padding so list content clears the FAB zone. */
export const ERP_MOBILE_SHEET_FAB_CLEARANCE_PX = 16;
export const ERP_MOBILE_SHEET_TOP_MARGIN_PX = 12;
export const ERP_MOBILE_SHEET_PEEK_BUFFER_PX = 24;

/** Mobile bottom nav total height (bar + home-indicator safe area). */
export const ERP_MOBILE_NAV_HEIGHT_CSS = 'calc(3.25rem + env(safe-area-inset-bottom))';

/** Panel `bottom` — flush on top of the bottom nav bar. */
export const ERP_MOBILE_SHEET_BOTTOM_CSS = ERP_MOBILE_NAV_HEIGHT_CSS;

/** Neutral scrim above the nav — does not dim or cover the bottom bar. */
export const ERP_MOBILE_SHEET_BACKDROP_CLASS =
  'absolute top-0 right-0 left-0 bottom-[calc(3.25rem+env(safe-area-inset-bottom))] bg-slate-900/40 backdrop-blur-[2px] motion-safe:animate-[erpFadeIn_180ms_ease-out] dark:bg-black/50';

export function readMobileSafeAreaBottomPx() {
  if (typeof window === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.bottom = '0';
  probe.style.height = 'env(safe-area-inset-bottom)';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  document.body.appendChild(probe);
  const px = probe.offsetHeight || 0;
  probe.remove();
  return px;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Height-based snap sheet: peek (default), expanded, or dismiss on drag.
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {{ panelRef: import('react').RefObject, handleRef: import('react').RefObject, scrollRef: import('react').RefObject, chromeRef?: import('react').RefObject }} refs
 * @param {{ measurePeekContent?: (scroll: HTMLElement) => number, defaultSnap?: 'peek'|'expanded', contentKey?: unknown }} [options]
 */
export function useErpMobileSnapSheet(open, onClose, { panelRef, handleRef, scrollRef, chromeRef }, options = {}) {
  const { measurePeekContent, defaultSnap = 'peek', contentKey } = options;
  const metricsRef = useRef({ maxH: 420, peekH: 280, handleH: 36, chromeH: 0 });
  const dragRef = useRef({ active: false, pointerId: null, startY: 0, startH: 0 });
  const snapRef = useRef(defaultSnap);
  const heightRef = useRef(420);
  const [ready, setReady] = useState(false);

  const defaultMeasurePeek = useCallback((scroll) => {
    const style = getComputedStyle(scroll);
    const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    return Math.min(scroll.scrollHeight, scroll.clientHeight || scroll.scrollHeight) + padY + ERP_MOBILE_SHEET_PEEK_BUFFER_PX;
  }, []);

  const applyHeight = useCallback(
    (heightPx, { animate = true } = {}) => {
      const panel = panelRef.current;
      if (!panel) return;
      const h = Math.max(0, Math.round(heightPx));
      heightRef.current = h;
      panel.style.transition = animate ? 'height 280ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
      panel.style.height = `${h}px`;
    },
    [panelRef],
  );

  const measure = useCallback(() => {
    const panel = panelRef.current;
    const scroll = scrollRef.current;
    const handle = handleRef.current;
    const chrome = chromeRef?.current;
    if (!panel || !scroll || typeof window === 'undefined') return;

    const safeBottom = readMobileSafeAreaBottomPx();
    const navTotal = ERP_MOBILE_SHEET_BOTTOM_NAV_PX + safeBottom;
    const maxAvailable = Math.max(300, window.innerHeight - navTotal - ERP_MOBILE_SHEET_TOP_MARGIN_PX);
    const handleH = handle?.offsetHeight || 36;
    const chromeH = chrome?.offsetHeight || 0;

    panel.style.transition = 'none';
    panel.style.height = `${maxAvailable}px`;
    const scrollH = scroll.scrollHeight;
    const expandedH = Math.min(maxAvailable, handleH + chromeH + scrollH + 8);
    const peekScrollH = (measurePeekContent || defaultMeasurePeek)(scroll);
    const peekH = Math.min(
      expandedH,
      handleH + chromeH + peekScrollH + ERP_MOBILE_SHEET_FAB_CLEARANCE_PX,
    );

    metricsRef.current = { maxH: expandedH, peekH, handleH, chromeH };
    panel.style.maxHeight = `${maxAvailable}px`;
  }, [panelRef, scrollRef, handleRef, chromeRef, measurePeekContent, defaultMeasurePeek]);

  const snapTo = useCallback(
    (target, { animate = true } = {}) => {
      const { maxH, peekH } = metricsRef.current;
      snapRef.current = target;

      if (target === 'closed') {
        applyHeight(0, { animate });
        window.setTimeout(() => onClose(), animate ? 260 : 0);
        return;
      }

      applyHeight(target === 'expanded' ? maxH : peekH, { animate });
    },
    [applyHeight, onClose],
  );

  const resolveSnapAfterDrag = useCallback(() => {
    const { maxH, peekH } = metricsRef.current;
    const h = heightRef.current;

    if (h <= peekH * 0.42) {
      snapTo('closed');
      return;
    }
    if (h >= (peekH + maxH) / 2) {
      snapTo('expanded');
      return;
    }
    snapTo('peek');
  }, [snapTo]);

  useEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }

    snapRef.current = defaultSnap;
    applyHeight(0, { animate: false });

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      measure();
      raf2 = requestAnimationFrame(() => {
        measure();
        snapTo(defaultSnap, { animate: true });
        setReady(true);
      });
    });

    const onResize = () => {
      measure();
      applyHeight(snapRef.current === 'peek' ? metricsRef.current.peekH : metricsRef.current.maxH, {
        animate: false,
      });
    };

    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener('resize', onResize);
    };
  }, [open, measure, applyHeight, snapTo, defaultSnap]);

  useEffect(() => {
    if (!open) return;
    measure();
    applyHeight(snapRef.current === 'peek' ? metricsRef.current.peekH : metricsRef.current.maxH, {
      animate: false,
    });
  }, [contentKey, open, measure, applyHeight]);

  const onHandlePointerDown = useCallback((e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startY: e.clientY,
      startH: heightRef.current,
    };
  }, []);

  const onHandlePointerMove = useCallback(
    (e) => {
      if (!dragRef.current.active || dragRef.current.pointerId !== e.pointerId) return;
      const dy = e.clientY - dragRef.current.startY;
      const { maxH } = metricsRef.current;
      const next = clamp(dragRef.current.startH - dy, 0, maxH);
      applyHeight(next, { animate: false });
      e.preventDefault();
    },
    [applyHeight],
  );

  const onHandlePointerUp = useCallback(
    (e) => {
      if (!dragRef.current.active || dragRef.current.pointerId !== e.pointerId) return;
      dragRef.current.active = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      resolveSnapAfterDrag();
    },
    [resolveSnapAfterDrag],
  );

  const onHandlePointerCancel = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    resolveSnapAfterDrag();
  }, [resolveSnapAfterDrag]);

  return {
    ready,
    onHandlePointerDown,
    onHandlePointerMove,
    onHandlePointerUp,
    onHandlePointerCancel,
  };
}
