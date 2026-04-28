/** localStorage key — keep in sync with inline script in `app/layout.jsx`. */
export const ERP_COLOR_SCHEME_KEY = 'erp_color_scheme';

export function applyColorScheme(mode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function getStoredColorScheme() {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(ERP_COLOR_SCHEME_KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function setColorScheme(mode) {
  applyColorScheme(mode);
  try {
    localStorage.setItem(ERP_COLOR_SCHEME_KEY, mode);
  } catch {
    /* ignore */
  }
}
