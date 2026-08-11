export async function downloadFromUrl(url, fileName = 'download') {
  const targetUrl = String(url || '').trim();
  if (!targetUrl) throw new Error('Missing download URL');

  const res = await fetch(targetUrl);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }

  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = String(fileName || 'download').trim() || 'download';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objUrl), 1200);
}

/** Last segment of a storage path: safe default download filename. */
export function basenameFromStoragePath(path, fallback = 'download') {
  const s = String(path || '').trim();
  if (!s) return fallback;
  const i = s.lastIndexOf('/');
  const base = i >= 0 ? s.slice(i + 1) : s;
  return base || fallback;
}

/**
 * Try blob download; if fetch/CORS blocks it, open the URL in a new tab.
 * Use for signed Supabase (or trash API) URLs where <a download> is unreliable.
 */
export async function downloadFromSignedUrlWithFallback(url, fileName = 'download') {
  const targetUrl = String(url || '').trim();
  if (!targetUrl) return;
  try {
    await downloadFromUrl(targetUrl, fileName);
  } catch {
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  }
}

