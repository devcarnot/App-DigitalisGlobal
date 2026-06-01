'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { downloadFromSignedUrlWithFallback } from '../../lib/browser-download';
import { getCachedSignedUrl, readCachedSignedUrl } from '../../lib/erp-signed-url-cache';
import ErpBodyPortal from './ErpBodyPortal';

const ERP_FILES_BUCKET = 'erp-files';

function shortName(path) {
  const s = String(path || '');
  const parts = s.split('/');
  return parts[parts.length - 1] || s || 'file';
}

function galleryItemKey(item) {
  if (!item) return '';
  return String(item.path || item.url || '').trim();
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

async function resolvePreviewUrl(item, bucket) {
  if (!item) return null;
  if (item.url) return item.url;
  if (!item.path) return null;
  const cached = readCachedSignedUrl(item.path, { bucket });
  if (cached !== undefined) return cached;
  return getCachedSignedUrl(item.path, { bucket });
}

function GalleryThumbnailStrip({ gallery, urlMap, activeIndex, bucket, onSelect }) {
  const stripRef = useRef(null);
  const thumbRefs = useRef([]);

  useEffect(() => {
    const el = thumbRefs.current[activeIndex];
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeIndex]);

  return (
    <div
      ref={stripRef}
      className="shrink-0 overflow-x-auto border-t border-slate-200/80 bg-slate-50/95 px-2 py-2 [scrollbar-width:thin] [scrollbar-color:rgba(100,116,139,0.35)_transparent] dark:border-teal-900/45 dark:bg-[#0b1822]/90 dark:[scrollbar-color:rgba(54,211,208,0.35)_rgba(15,23,42,0.45)]"
    >
      <div className="flex min-w-min gap-1.5">
        {gallery.map((item, index) => {
          const key = galleryItemKey(item);
          const thumbUrl = item.url || urlMap[key] || (item.path ? readCachedSignedUrl(item.path, { bucket }) : null);
          const active = index === activeIndex;
          return (
            <button
              key={`${key}-${index}`}
              type="button"
              ref={(node) => {
                thumbRefs.current[index] = node;
              }}
              onClick={() => onSelect(index)}
              aria-label={`View image ${index + 1}`}
              aria-current={active ? 'true' : undefined}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-md transition ${
                active
                  ? 'ring-2 ring-[#103D4D] ring-offset-1 ring-offset-slate-50 dark:ring-teal-400 dark:ring-offset-[#0b1822]'
                  : 'opacity-80 hover:opacity-100'
              }`}
            >
              {thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-slate-200/80 text-[10px] text-slate-500 dark:bg-[#1f2c34] dark:text-white/50">
                  …
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Reusable preview modal for ERP files stored in the `erp-files` bucket.
 */
export default function ErpFilePreviewModal({ file, onClose, extraActions = null }) {
  const open = Boolean(file?.path || file?.url);
  const bucket = file?.bucket || ERP_FILES_BUCKET;
  const projectName = file?.projectName || '';
  const gallery =
    Array.isArray(file?.gallery) && file.gallery.length > 1 ? file.gallery : null;

  const [activeIndex, setActiveIndex] = useState(() => file?.galleryIndex ?? 0);
  const [urlMap, setUrlMap] = useState({});
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [textContent, setTextContent] = useState(null);
  const [textError, setTextError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [openingNewTab, setOpeningNewTab] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setActiveIndex(file?.galleryIndex ?? 0);
  }, [file?.path, file?.url, file?.galleryIndex]);

  const activeItem = gallery ? gallery[activeIndex] || gallery[0] : file;
  const path = activeItem?.path || '';
  const directUrl = activeItem?.url || '';
  const mime = activeItem?.mime ?? file?.mime ?? null;
  const name =
    activeItem?.name ||
    file?.name ||
    (path ? shortName(path) : directUrl ? shortName(directUrl.split('?')[0]) : '');
  const isImagePreview = isImage(path, mime);
  const canGalleryNavigate = Boolean(gallery && gallery.length > 1 && isImagePreview);
  const isGalleryViewer = Boolean(canGalleryNavigate);
  const isFullscreen = expanded;
  const isCompactMediaPreview =
    !isFullscreen && !isGalleryViewer && (isImagePreview || isVideo(path, mime) || isAudio(path, mime));

  useEffect(() => {
    if (!open) {
      setExpanded(false);
      setUrlMap({});
      setUrl(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /** Prefetch every gallery image URL once when the modal opens. */
  useEffect(() => {
    if (!open || !gallery?.length) return undefined;
    let alive = true;

    void (async () => {
      const pairs = await Promise.all(
        gallery.map(async (item) => {
          const key = galleryItemKey(item);
          if (!key) return null;
          const resolved = await resolvePreviewUrl(item, bucket);
          return resolved ? [key, resolved] : null;
        }),
      );
      if (!alive) return;
      const next = {};
      for (const pair of pairs) {
        if (pair) next[pair[0]] = pair[1];
      }
      setUrlMap(next);
      for (const u of Object.values(next)) {
        if (typeof u === 'string' && u.startsWith('http')) {
          const img = new Image();
          img.decoding = 'async';
          img.src = u;
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, gallery, bucket]);

  /** Resolve the active preview URL (cached first, then fetch). */
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;

    const key = galleryItemKey(activeItem);
    const cached = directUrl || urlMap[key] || (path ? readCachedSignedUrl(path, { bucket }) : null);

    if (cached) {
      setUrl(cached);
      setLoading(false);
    } else if (path || directUrl) {
      setLoading(true);
    } else {
      setUrl(null);
      setLoading(false);
    }

    setTextContent(null);
    setTextError('');

    if (cached || !path) {
      if (cached && isTextLike(path, mime)) {
        void loadTextPreview(cached, path, mime, () => alive, setTextContent, setTextError);
      }
      return () => {
        alive = false;
      };
    }

    void (async () => {
      const resolved = await resolvePreviewUrl(activeItem, bucket);
      if (!alive) return;
      setUrl(resolved);
      setLoading(false);
      if (resolved && key) {
        setUrlMap((prev) => (prev[key] === resolved ? prev : { ...prev, [key]: resolved }));
      }
      if (resolved && isTextLike(path, mime)) {
        await loadTextPreview(resolved, path, mime, () => alive, setTextContent, setTextError);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, path, directUrl, mime, activeItem, urlMap, bucket]);

  const goToPreviousImage = useCallback(() => {
    if (!gallery) return;
    setActiveIndex((index) => Math.max(0, index - 1));
  }, [gallery]);

  const goToNextImage = useCallback(() => {
    if (!gallery) return;
    setActiveIndex((index) => Math.min(gallery.length - 1, index + 1));
  }, [gallery]);

  const handleKey = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (!canGalleryNavigate) return;
      if (e.key === 'ArrowLeft' && activeIndex > 0) {
        e.preventDefault();
        goToPreviousImage();
      } else if (e.key === 'ArrowRight' && gallery && activeIndex < gallery.length - 1) {
        e.preventDefault();
        goToNextImage();
      }
    },
    [onClose, canGalleryNavigate, activeIndex, gallery, goToPreviousImage, goToNextImage],
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

  const handleOpenInNewTab = useCallback(async () => {
    if (!url || openingNewTab) return;
    const win = typeof window !== 'undefined'
      ? window.open('', '_blank', 'noopener,noreferrer')
      : null;
    setOpeningNewTab(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let blob = await res.blob();
      const originalType = res.headers.get('content-type') || mime || blob.type || 'application/octet-stream';
      const lower = String(name || path || '').toLowerCase();
      const isMarkdown = /\.(md|markdown)$/i.test(lower);
      const isPlainCode = /\.(txt|log|csv|tsv|ini|toml|env|yaml|yml|json|xml|js|jsx|ts|tsx|css|scss|less|html?|py|rb|rs|go|java|kt|swift|sh|bash|zsh|ps1|sql|lock|gitignore)$/i.test(lower);
      const forceTextInline = isMarkdown || isPlainCode || /^application\/octet-stream$/i.test(originalType);
      const effectiveType = forceTextInline ? 'text/plain; charset=utf-8' : originalType;
      if (effectiveType !== blob.type) {
        blob = blob.slice(0, blob.size, effectiveType);
      }
      const objUrl = URL.createObjectURL(blob);
      if (win && !win.closed) {
        win.location.href = objUrl;
      } else {
        const a = document.createElement('a');
        a.href = objUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
    } catch {
      try {
        if (win && !win.closed) {
          win.location.href = url;
        } else if (typeof window !== 'undefined') {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      } catch {
        /* ignored */
      }
    } finally {
      setOpeningNewTab(false);
    }
  }, [url, openingNewTab, mime, name, path]);

  const embedFrameClass = isFullscreen
    ? 'mx-auto block h-[calc(100dvh-9rem)] min-h-0 w-full rounded-none border-0 bg-slate-100 sm:h-[calc(100dvh-9.5rem)]'
    : 'mx-auto block h-[min(78vh,720px)] w-full rounded-2xl border border-slate-200 bg-slate-100 shadow-sm';

  const mediaMaxClass = isFullscreen
    ? 'max-h-[calc(100dvh-9rem)] max-w-[min(100vw-1rem,100%)] sm:max-h-[calc(100dvh-9.5rem)]'
    : isGalleryViewer
      ? 'max-h-[min(52dvh,420px)] max-w-full'
      : isImagePreview
        ? 'max-h-[min(48dvh,360px)] max-w-full'
        : 'max-h-[min(58dvh,520px)]';

  if (!open) return null;

  const shellClass = isFullscreen
    ? `relative z-[1] flex h-[100dvh] w-[100vw] max-h-[100dvh] max-w-[100vw] flex-col overflow-hidden rounded-none border-0 shadow-none bg-white dark:bg-[#0f1a24]`
    : isGalleryViewer
      ? 'relative z-[1] flex w-full max-h-[min(92dvh,720px)] max-w-[min(calc(100vw-1rem),52rem)] flex-col overflow-hidden rounded-2xl border border-cyan-200/60 bg-white/95 shadow-[0_28px_80px_-18px_rgba(16,61,77,0.35)] backdrop-blur-xl sm:rounded-3xl dark:border-teal-800/50 dark:bg-gradient-to-b dark:from-[#0f1a24] dark:to-[#080c10] dark:shadow-[0_28px_80px_-18px_rgba(0,0,0,0.55)]'
      : isCompactMediaPreview
        ? 'relative z-[1] flex h-auto max-h-[min(88dvh,640px)] w-full max-w-[min(calc(100vw-1.5rem),42rem)] flex-col overflow-hidden rounded-2xl border border-cyan-200/60 bg-white/95 shadow-[0_28px_80px_-18px_rgba(16,61,77,0.35)] backdrop-blur-xl sm:rounded-3xl dark:border-teal-800/50 dark:bg-gradient-to-b dark:from-[#0f1a24] dark:to-[#080c10] dark:shadow-[0_28px_80px_-18px_rgba(0,0,0,0.55)]'
        : 'relative z-[1] flex max-h-[min(88dvh,760px)] w-full max-w-[min(100%,56rem)] flex-col overflow-hidden rounded-3xl border border-cyan-200/60 bg-white/95 shadow-[0_28px_80px_-18px_rgba(16,61,77,0.35)] backdrop-blur-xl dark:border-teal-800/50 dark:bg-gradient-to-b dark:from-[#0f1a24] dark:to-[#080c10] dark:shadow-[0_28px_80px_-18px_rgba(0,0,0,0.55)]';

  return (
    <ErpBodyPortal>
      <div
        className={`fixed inset-0 z-[800] flex ${isFullscreen ? 'items-stretch p-0' : 'items-center justify-center p-0 sm:p-4'}`}
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          className={`absolute inset-0 ${isFullscreen ? 'bg-black/85' : 'bg-[#103D4D]/35 backdrop-blur-sm dark:bg-black/70'}`}
          onClick={onClose}
          aria-label="Close preview"
        />
        <div className={shellClass}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-cyan-50/40 px-4 py-3 dark:border-teal-900/45 dark:bg-gradient-to-r dark:from-[#0f2438] dark:via-[#0b1e2e] dark:to-[#061018] sm:px-5 sm:py-4">
          <div className="min-w-0">
            {projectName ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Project</p>
                <p className="mt-1 truncate text-base font-bold text-slate-900 dark:text-white">{projectName}</p>
                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{name}</p>
              </>
            ) : (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">File preview</p>
                <p className="mt-1 truncate text-base font-bold text-slate-900 dark:text-white">{name}</p>
                {canGalleryNavigate ? (
                  <p className="mt-1 text-xs font-semibold text-[#103D4D] dark:text-teal-300">
                    {activeIndex + 1} / {gallery.length}
                  </p>
                ) : null}
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

        <div
          className={
            isGalleryViewer
              ? isFullscreen
                ? 'relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-slate-100/90 px-2 py-2 dark:bg-[#0b141a] sm:px-3'
                : 'relative shrink-0 overflow-hidden bg-slate-100/90 px-2 py-3 dark:bg-[#0b141a] sm:px-3'
              : isCompactMediaPreview
                ? 'shrink-0 overflow-hidden px-3 py-3 sm:px-4'
                : 'min-h-0 flex-1 overflow-y-auto p-5 [scrollbar-color:rgba(100,116,139,0.35)_transparent] [scrollbar-width:thin]'
          }
        >
          {loading && !url ? (
            <div className="flex justify-center py-12">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D] dark:border-teal-800 dark:border-t-teal-300" />
            </div>
          ) : !url ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Could not generate a preview link. The file may have been removed or your session expired.
            </p>
          ) : isImage(path, mime) ? (
            <div className={`relative flex items-center justify-center ${isFullscreen ? 'h-full min-h-0 w-full' : 'min-h-[12rem]'}`}>
              {canGalleryNavigate ? (
                <>
                  <button
                    type="button"
                    onClick={goToPreviousImage}
                    disabled={activeIndex <= 0}
                    aria-label="Previous image"
                    className="absolute left-1 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-xl font-bold leading-none text-white transition hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-30 sm:left-2"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={goToNextImage}
                    disabled={activeIndex >= gallery.length - 1}
                    aria-label="Next image"
                    className="absolute right-1 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-xl font-bold leading-none text-white transition hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-30 sm:right-2"
                  >
                    ›
                  </button>
                </>
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={name}
                decoding="async"
                fetchPriority="high"
                className={`mx-auto block h-auto w-auto object-contain rounded-xl border border-slate-200 bg-white shadow-sm ${mediaMaxClass}`}
              />
            </div>
          ) : isVideo(path, mime) ? (
            <video src={url} controls className={`mx-auto w-full rounded-2xl border border-slate-200 bg-black shadow-sm ${mediaMaxClass}`} />
          ) : isAudio(path, mime) ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-100 to-cyan-100 text-4xl shadow-inner">
                🎵
              </div>
              <audio src={url} controls className="w-full max-w-lg" />
            </div>
          ) : isPdf(path, mime) ? (
            <iframe title={name} src={url} className={embedFrameClass} />
          ) : isOffice(path, mime) ? (
            <div className="space-y-2">
              <iframe title={name} src={officeEmbedSrc} className={embedFrameClass} />
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Preview rendered by Microsoft Office Online. If it fails to load, use Open in new tab or Download.
              </p>
            </div>
          ) : isTextLike(path, mime) ? (
            textError ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">{textError}</p>
            ) : textContent === null ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D] dark:border-teal-800 dark:border-t-teal-300" />
              </div>
            ) : (
              <pre
                className={`overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[12px] leading-relaxed text-slate-800 dark:border-teal-900/55 dark:bg-[#0c1820] dark:text-slate-100 ${isFullscreen ? 'max-h-[min(calc(100dvh-9rem),92dvh)] sm:max-h-[min(calc(100dvh-9.5rem),94dvh)]' : 'max-h-[min(70vh,640px)]'}`}
              >
                {textContent}
              </pre>
            )
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center dark:border-teal-900/55 dark:bg-[#0c1820]/50">
              <p className="text-4xl" aria-hidden>📄</p>
              <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Preview not available for this file type.</p>
            </div>
          )}
        </div>

        {canGalleryNavigate ? (
          <GalleryThumbnailStrip
            gallery={gallery}
            urlMap={urlMap}
            activeIndex={activeIndex}
            bucket={bucket}
            onSelect={setActiveIndex}
          />
        ) : null}

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 bg-slate-50/90 px-4 py-2.5 dark:border-teal-900/45 dark:bg-[#0b1822]/85 sm:px-5 sm:py-3">
          <div className="flex flex-wrap items-center gap-2">{extraActions}</div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {url ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleOpenInNewTab()}
                  disabled={openingNewTab}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-100 dark:hover:bg-[#1a2732]"
                >
                  {openingNewTab ? 'Opening…' : 'Open in new tab'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownload()}
                  disabled={downloading}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl erp-brand-fill px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-teal-900/25 disabled:opacity-60"
                >
                  {downloading ? 'Downloading…' : 'Download'}
                </button>
              </>
            ) : (
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {loading ? 'Preparing link…' : 'Download unavailable'}
              </span>
            )}
          </div>
        </div>
        </div>
      </div>
    </ErpBodyPortal>
  );
}

async function loadTextPreview(signed, path, mime, isAlive, setTextContent, setTextError) {
  try {
    const TEXT_PREVIEW_BYTES = 512 * 1024;
    let res = await fetch(signed, { headers: { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` } });
    if (!isAlive()) return;
    if (res.status === 416) {
      res = await fetch(signed);
      if (!isAlive()) return;
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
    if (!isAlive()) return;
    const safeTxt = txt.length > TEXT_PREVIEW_BYTES ? txt.slice(0, TEXT_PREVIEW_BYTES) : txt;
    setTextContent(
      truncated ? `${safeTxt}\n\n…(preview truncated to ${Math.round(TEXT_PREVIEW_BYTES / 1024)}KB — use Download for the full file)` : safeTxt,
    );
  } catch (e) {
    if (isAlive()) setTextError(e?.message || 'Could not load preview');
  }
}
