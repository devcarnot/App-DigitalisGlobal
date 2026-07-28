'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** Renderer checks `window.__DIGITALIS_DESKTOP__` (session bootstrap tweaks, UX). */
contextBridge.exposeInMainWorld('__DIGITALIS_DESKTOP__', true);

/**
 * Minimal renderer ↔ main bridge for things the renderer can't do on its own.
 *
 * Today this only carries `focusWindow()`, which the OS-notification handler
 * in `src/lib/erp-desktop-notifier.js` calls when the user clicks a toast.
 * The renderer's own `window.focus()` is a no-op on a minimised / hidden
 * BrowserWindow, so we route through `digitalis:focus-window` to restore
 * + raise the actual window before navigating.
 *
 * `ipcRenderer.invoke` returns a promise but callers don't need to await it;
 * the main process will have raised the window long before the renderer's
 * subsequent navigation lands.
 */
contextBridge.exposeInMainWorld('__DIGITALIS_DESKTOP_BRIDGE__', {
  focusWindow() {
    try {
      ipcRenderer.invoke('digitalis:focus-window').catch(() => {});
    } catch {
      /* main process gone / not yet ready — no-op */
    }
  },
  getAppVersion() {
    try {
      return ipcRenderer.invoke('digitalis:app-version');
    } catch {
      return Promise.resolve(null);
    }
  },
});
