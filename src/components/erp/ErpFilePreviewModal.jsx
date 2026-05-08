'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { downloadFromSignedUrlWithFallback } from '../../lib/browser-download';

const ERP_FILES_BUCKET = 'erp-files';

function shortName(path) {
  const s = String(path || '');
  const parts = s.split('/');
  return parts[parts.length - 1] || s || 'file';
}

function extOf(path) {
  const s = shortName(path).toLowerCase();
  const i = s.lastIndexOf('.');
  return i >= 0 ? s.slice(i + 1) : '';
}

function isImage(path, mime) {
  if (String(mime || '').toLowerCase().startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|bmp|svg|avif|heic|heif)$/i.test(String(path || ''));
}
function isVideo(path, mime) {
  if (String(mime || '').toLowerCase().startsWith('video/')) return true;
  return /\.(mp4|webm|mov|m4v|ogg|ogv)$/i.test(String(path || ''));
}
function isAudio(path, mime) {
  if (String(mime || '').toLowerCase().startsWith('audio/')) return true;
  return /\.(mp3|wav|m4a|aac|oga|flac)$/i.test(String(path || ''));
}
function isPdf(path, mime) {
  const m = String(mime || '').toLowerCase();
  if (m === 'application/pdf' || m === 'application/x-pdf') return true;
  return /\.pdf$/i.test(String(path || ''));
}
function isOffice(path, mime) {
  const m = String(mime || '').toLowerCase();
  const officeMimes = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ];
  if (officeMimes.includes(m)) return true;
  return /\.(docx?|xlsx?|pptx?)$/i.test(String(path || ''));
}
function isTextLike(path, mime) {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('text/')) return true;
  if (m === 'application/json' || m === 'application/xml' || m === 'application/javascript') return true;
  return /\.(txt|md|markdown|json|xml|yaml|yml|csv|tsv|log|js|jsx|ts|tsx|css|scss|less|html|htm|py|rb|rs|go|java|kt|swift|sh|bash|zsh|ps1|sql|ini|toml|env|lock)$/i.test(String(path || ''));
}

async function createSignedUrl(path, expiresIn = 3600, bucket = ERP_FILES_BUCKET) {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl || null;
}

/**
 * Reusable preview modal for ERP files stored in the `erp-files` bucket.
 *
 * Props:
 *  - file: { path, name?, mime?, projectName?, bucket? } | null
 *  - onClose: () => void
 *  - extraActions?: ReactNode  (e.g. a "Move to trash" button, rendered on the left of the footer)
 *
 * Preview matrix:
 *  - Images → <img>
 *  - Video  → <video controls>
 *  - Audio  → <audio controls>
 *  - PDF    → <iframe>
 *  - Office (doc/docx/xls/xlsx/ppt/pptx) → Office Online embed (view.officeapps.live.com)
 *  - Text-like → inline <pre> with fetched contents (≤ 512KB)
 *  - Anything else → graceful fallback with download button
 */
export default function ErpFilePreviewModal({ file, onClose, extraActions = null }) {
  const open = Boolean(file?.path);
  const bucket = file?.bucket || ERP_FILES_BUCKET;
  const name = file?.name || (file?.path ? shortName(file.path) : '');
  const projectName = file?.projectName || '';
  const mime = file?.mime || null;
  const path = file?.path || '';

  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState(null);
  const [textContent, setTextContent] = useState(null);
  const [textError, setTextError] = useState('');
  const [downloading, setDownloading] = useState(false);
  /** Larger viewport for Office/PDF/embed previews without leaving the app. */
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setTextContent(null);
    setTextError('');
    if (!open) return () => {};

    setLoading(true);
    (async () => {
      try {
        const signed = await createSignedUrl(path, 3600, bucket);
        if (!alive) return;
        setUrl(signed);

        if (signed && isTextLike(path, mime)) {
          try {
            // Use a Range request so a 50MB log file never streams across the
            // wire just to be sliced client-side. Falls back to a full GET if
            // the storage layer doesn't honor Range.
            const TEXT_PREVIEW_BYTES = 512 * 1024;
            let res = await fetch(signed, { headers: { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` } });
            if (!alive) return;
            if (res.status === 416) {
              res = await fetch(signed);
              if (!alive) return;
            }
            if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
            const contentLength = Number(res.headers.get('content-length') || 0);
            const totalSize = (() => {
              const cr = res.headers.get('content-range');
              const m = cr && /\/(\d+)/.exec(cr);
              return m ? Number(m[1]) : contentLength;
            })();
            const truncated = res.status === 206 || (totalSize && totalSize > TEXT_PREVIEW_BYTES);
            const txt = await res.text();
            if (!alive) return;
            const safeTxt = txt.length > TEXT_PREVIEW_BYTES ? txt.slice(0, TEXT_PREVIEW_BYTES) : txt;
            setTextContent(truncated ? `${safeTxt}\n\n…(preview truncated to ${Math.round(TEXT_PREVIEW_BYTES / 1024)}KB — use Download for the full file)` : safeTxt);
          } catch (e) {
            if (alive) setTextError(e?.message || 'Could not load preview');
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, path, bucket, mime]);

  const handleKey = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose?.();
    },
    [onClose],
  );
  useEffect(() => {
    if (!open) return () => {};
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, handleKey]);

  const officeEmbedSrc = useMemo(() => {
    if (!url) return null;
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }, [url]);

  const handleDownload = useCallback(async () => {
    if (!url || downloading) return;
    setDownloading(true);
    try {
      await downloadFromSignedUrlWithFallback(url, name || shortName(path));
    } finally {
      setDownloading(false);
    }
  }, [url, downloading, name, path]);

  const embedFrameClass = expanded
    ? 'mx-auto block min-h-[min(55dvh,480px)] h-[calc(100dvh-13rem)] w-full rounded-2xl border border-slate-200 bg-slate-100 shadow-sm sm:h-[calc(100dvh-14rem)]'
    : 'mx-auto block h-[min(78vh,720px)] w-full rounded-2xl border border-slate-200 bg-slate-100 shadow-sm';

  const mediaMaxClass = expanded
    ? 'max-h-[min(calc(100dvh-13rem),92dvh)] sm:max-h-[min(calc(100dvh-14rem),94dvh)]'
    : 'max-h-[min(70vh,640px)]';

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[700] flex justify-center ${expanded ? 'items-stretch p-0 sm:items-center sm:p-3' : 'items-center p-0 sm:p-4'}`}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#103D4D]/35 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close preview"
      />
      <div
        className={
          `relative z-[1] flex w-full flex-col overflow-hidden border border-cyan-200/60 bg-white/95 shadow-[0_28px_80px_-18px_rgba(16,61,77,0.35)] backdrop-blur-xl dark:border-teal-800/50 dark:bg-gradient-to-b dark:from-[#0f1a24] dark:to-[#080c10] dark:shadow-[0_28px_80px_-18px_rgba(0,0,0,0.55)] ` +
          (expanded
            ? 'h-[100dvh] max-h-[100dvh] max-w-none rounded-none sm:h-[min(98dvh,calc(100dvh-1.5rem))] sm:max-h-[min(98dvh,calc(100dvh-1.5rem))] sm:max-w-[min(calc(100vw-1.5rem),120rem)] sm:rounded-3xl '
            : 'max-h-[min(92dvh,880px)] max-w-[min(100%,64rem)] rounded-3xl ')
        }
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-cyan-50/40 px-5 py-4 dark:border-teal-900/45 dark:bg-gradient-to-r dark:from-[#0f2438] dark:via-[#0b1e2e] dark:to-[#061018]">
          <div className="min-w-0">
            {projectName ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Project</p>
                <p className="mt-1 truncate text-base font-bold text-slate-900 dark:text-white">{projectName}</p>
                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{name}</p>
              </>
            ) : (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">File preview</p>
                <p className="mt-1 truncate text-base font-bold text-slate-900">{name}</p>
              </>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              title={expanded ? 'Use smaller viewer' : 'Expand viewer'}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                {expanded ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0v5m0-5h5m2 15h5m5 0v-5m0 5l-5-5M4 15h5v5m11-15h-5V4" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 9l5-5m0 0v5m0-5h-5M9 15l-5 5m0 0v-5m0 5h5m6-15h5v5M3 15H8v5" />
                )}
              </svg>
              <span className="hidden sm:inline">{expanded ? 'Shrink' : 'Expand'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 [scrollbar-color:rgba(100,116,139,0.35)_transparent] [scrollbar-width:thin]">
          {loading && !url ? (
            <div className="flex justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D] dark:border-teal-800 dark:border-t-teal-300" />
            </div>
          ) : !url ? (
            <p className="text-sm text-slate-600">
              Could not generate a preview link. The file may have been removed or your session expired.
            </p>
          ) : isImage(path, mime) ? (
            <img
              src={url}
              alt={name}
              className={`mx-auto w-auto rounded-2xl border border-slate-200 bg-white shadow-sm ${mediaMaxClass}`}
            />
          ) : isVideo(path, mime) ? (
            <video
              src={url}
              controls
              className={`mx-auto w-full rounded-2xl border border-slate-200 bg-black shadow-sm ${mediaMaxClass}`}
            />
          ) : isAudio(path, mime) ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-100 to-cyan-100 text-4xl shadow-inner">
                🎵
              </div>
              <audio src={url} controls className="w-full max-w-lg" />
            </div>
          ) : isPdf(path, mime) ? (
            <iframe
              title={name}
              src={url}
              className={embedFrameClass}
            />
          ) : isOffice(path, mime) ? (
            <div className="space-y-2">
              <iframe
                title={name}
                src={officeEmbedSrc}
                className={embedFrameClass}
              />
              <p className="text-[11px] text-slate-500">
                Preview rendered by Microsoft Office Online. If it fails to load, use Open in new tab or Download.
              </p>
            </div>
          ) : isTextLike(path, mime) ? (
            textError ? (
              <p className="text-sm text-slate-600">{textError}</p>
            ) : textContent === null ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
              </div>
            ) : (
              <pre
                className={`overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[12px] leading-relaxed text-slate-800 ${expanded ? 'max-h-[min(calc(100dvh-13rem),90dvh)] sm:max-h-[min(calc(100dvh-14rem),92dvh)]' : 'max-h-[min(70vh,640px)]'}`}
              >
                {textContent}
              </pre>
            )
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
              <p className="text-4xl" aria-hidden>
                📄
              </p>
              <p className="mt-3 text-sm font-semibold text-slate-800">Preview not available for this file type.</p>
              <p className="mt-1 text-xs text-slate-500">
                Use the buttons below to open the file in a new tab or download it.
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 bg-slate-50/90 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">{extraActions}</div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {url ? (
              <>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 touch-manipulation"
                >
                  Open in new tab
                </a>
                <a
                  href={url}
                  onClick={(e) => {
                    e.preventDefault();
                    void handleDownload();
                  }}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl erp-brand-fill px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-teal-900/25 touch-manipulation"
                >
                  {downloading ? 'Downloading…' : 'Download'}
                </a>
              </>
            ) : (
              <span className="text-xs font-medium text-slate-500">
                {loading ? 'Preparing link…' : 'Download unavailable'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
