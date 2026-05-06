/** Set by Electron `preload.js`; undefined in normal browsers. */
export function isDigitalisDesktop() {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.__DIGITALIS_DESKTOP__);
  } catch {
    return false;
  }
}
