/**
 * App-level toasts (success / error / info) shown by ErpShell.
 * Prefer this over `window.alert` in ERP admin UI.
 *
 * @param {{ title: string, body?: string, tone?: 'success' | 'error' | 'info', link?: string, durationMs?: number }} opts
 */
export function pushErpAppToast({ title, body = '', tone = 'success', link, durationMs }) {
  if (typeof window === 'undefined') return;
  const id = `app-toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  window.dispatchEvent(
    new CustomEvent('erp-app-toast', {
      detail: {
        id,
        title: String(title || '').trim() || 'Done',
        body: String(body || '').trim(),
        tone,
        link: link || null,
        durationMs,
        ephemeral: tone !== 'error',
      },
    }),
  );
}
