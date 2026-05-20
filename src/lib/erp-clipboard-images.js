/**
 * Extract image files from clipboard / HTML payloads (screenshots, snip tool, etc.).
 */

function fileKey(f) {
  return `${f.name || ''}|${f.type}|${f.size || 0}|${f.lastModified || 0}`;
}

/** @param {DataTransfer | ClipboardEvent['clipboardData']} dt */
export function collectImageFilesFromDataTransfer(dt) {
  if (!dt) return [];
  const out = [];
  const seen = new Set();
  const consider = (f) => {
    if (!f || !f.type || !f.type.startsWith('image/')) return;
    const key = fileKey(f);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(f);
  };
  if (dt.files?.length) {
    for (const f of dt.files) consider(f);
  }
  if (dt.items) {
    for (const it of dt.items) {
      if (it?.kind === 'file') {
        const f = it.getAsFile?.();
        if (f) consider(f);
      }
    }
  }
  return out;
}

/** @param {string} dataUrl */
export function dataUrlToImageFile(dataUrl) {
  try {
    const raw = String(dataUrl || '').trim();
    if (!raw.startsWith('data:image/')) return null;
    const [header, payload] = raw.split(',');
    if (!payload) return null;
    const mime = header.match(/data:([^;]+)/i)?.[1] || 'image/png';
    const bin = atob(payload);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    const ext = mime.split('/')[1]?.replace(/\+xml$/, '') || 'png';
    return new File([arr], `pasted-${Date.now()}.${ext}`, { type: mime });
  } catch {
    return null;
  }
}

/** Pull embedded `data:image/...` sources out of pasted HTML (some OS clipboards). */
export function imageFilesFromHtmlDataUrls(html) {
  const files = [];
  const seen = new Set();
  const re = /src\s*=\s*["'](data:image\/[^"']+)["']/gi;
  let m = re.exec(String(html || ''));
  while (m) {
    const f = dataUrlToImageFile(m[1]);
    if (f) {
      const key = fileKey(f);
      if (!seen.has(key)) {
        seen.add(key);
        files.push(f);
      }
    }
    m = re.exec(String(html || ''));
  }
  return files;
}
