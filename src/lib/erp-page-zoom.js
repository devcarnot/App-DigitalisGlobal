/**
 * Page zoom helpers for ERP (Ctrl/Cmd + wheel, +, -, 0).
 * Electron applies zoom in `desktop/main.js`; this module is used in the browser/PWA shell.
 */

const ZOOM_STORAGE_KEY = 'erp:pageZoomFactor';
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const STEP = 0.1;

function readStoredZoom() {
  if (typeof window === 'undefined') return 1;
  try {
    const raw = sessionStorage.getItem(ZOOM_STORAGE_KEY);
    const n = raw != null ? parseFloat(raw) : 1;
    if (!Number.isFinite(n)) return 1;
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, n));
  } catch {
    return 1;
  }
}

function persistZoom(factor) {
  try {
    sessionStorage.setItem(ZOOM_STORAGE_KEY, String(factor));
  } catch {
    /* ignore */
  }
}

function supportsCssZoom() {
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('zoom', '1.1');
  }
  return true;
}

/** @param {number} factor */
export function applyPageZoom(factor) {
  if (typeof document === 'undefined') return;
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, factor));
  const html = document.documentElement;
  const body = document.body;

  if (supportsCssZoom()) {
    html.style.zoom = clamped === 1 ? '' : String(clamped);
    body.style.transform = '';
    body.style.transformOrigin = '';
    body.style.width = '';
    body.style.minHeight = '';
  } else {
    html.style.zoom = '';
    body.style.transform = clamped === 1 ? '' : `scale(${clamped})`;
    body.style.transformOrigin = 'top left';
    body.style.width = clamped === 1 ? '' : `${100 / clamped}%`;
    body.style.minHeight = clamped === 1 ? '' : `${100 / clamped}vh`;
  }

  persistZoom(clamped);
  return clamped;
}

export function getPageZoom() {
  return readStoredZoom();
}

export function zoomPageIn() {
  return applyPageZoom(readStoredZoom() + STEP);
}

export function zoomPageOut() {
  return applyPageZoom(readStoredZoom() - STEP);
}

export function resetPageZoom() {
  return applyPageZoom(1);
}

function isZoomWheelEvent(e) {
  return Boolean(e && (e.ctrlKey || e.metaKey));
}

function isZoomInKey(e) {
  if (!e || !(e.ctrlKey || e.metaKey) || e.altKey) return false;
  const k = e.key;
  return k === '+' || k === '=' || k === 'Add';
}

function isZoomOutKey(e) {
  if (!e || !(e.ctrlKey || e.metaKey) || e.altKey) return false;
  const k = e.key;
  return k === '-' || k === '_' || k === 'Subtract';
}

function isZoomResetKey(e) {
  if (!e || !(e.ctrlKey || e.metaKey) || e.altKey) return false;
  return e.key === '0' || e.key === 'Digit0' || e.key === 'Numpad0';
}

/**
 * Install zoom shortcuts in the browser/PWA renderer.
 * Skipped when running inside Electron (main process handles zoom there).
 */
export function initErpPageZoom() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (window.__DIGITALIS_DESKTOP__) return () => {};

  applyPageZoom(readStoredZoom());

  const onWheel = (e) => {
    if (!isZoomWheelEvent(e)) return;
    e.preventDefault();
    if (e.deltaY < 0) zoomPageIn();
    else if (e.deltaY > 0) zoomPageOut();
  };

  const onKeyDown = (e) => {
    if (isZoomInKey(e)) {
      e.preventDefault();
      zoomPageIn();
      return;
    }
    if (isZoomOutKey(e)) {
      e.preventDefault();
      zoomPageOut();
      return;
    }
    if (isZoomResetKey(e)) {
      e.preventDefault();
      resetPageZoom();
    }
  };

  window.addEventListener('wheel', onWheel, { passive: false, capture: true });
  window.addEventListener('keydown', onKeyDown, { capture: true });

  return () => {
    window.removeEventListener('wheel', onWheel, { capture: true });
    window.removeEventListener('keydown', onKeyDown, { capture: true });
  };
}
