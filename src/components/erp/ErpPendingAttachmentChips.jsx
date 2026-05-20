'use client';

import { useEffect, useState } from 'react';

function IconClose({ className = 'h-3 w-3' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function PendingAttachmentChip({ file, onRemove, removeLabel = 'Remove attachment' }) {
  const isImage = Boolean(file?.type?.startsWith('image/'));
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!isImage || !file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  if (previewUrl) {
    return (
      <li className="relative shrink-0">
        <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200/90 bg-slate-100 shadow-sm dark:border-teal-900/55 dark:bg-[#0c141c] dark:shadow-black/35 sm:h-[4.5rem] sm:w-[4.5rem]">
          <img src={previewUrl} alt={file.name || 'Attached image'} className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md border border-white/20 bg-slate-900/75 text-white shadow-md backdrop-blur-sm transition hover:bg-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/80 dark:border-white/15 dark:bg-black/70 dark:hover:bg-rose-600"
            aria-label={removeLabel}
            title="Remove image"
          >
            <IconClose />
          </button>
        </div>
        <p className="mt-1 max-w-[4.5rem] truncate text-[10px] text-slate-500 dark:text-slate-400" title={file.name}>
          {file.name}
        </p>
      </li>
    );
  }

  return (
    <li className="flex max-w-[220px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm dark:border-teal-900/50 dark:bg-[#0c141c] dark:text-slate-200 dark:shadow-black/30">
      <span className="min-w-0 truncate">{file.name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-300"
        aria-label={removeLabel}
        title="Remove file"
      >
        <IconClose />
      </button>
    </li>
  );
}

/** Pending message attachments with image thumbnails. */
export default function ErpPendingAttachmentChips({
  files,
  onRemoveAt,
  className = '',
  listClassName = 'flex max-h-28 flex-wrap gap-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin] sm:max-h-36',
}) {
  if (!files?.length) return null;
  return (
    <ul className={`${listClassName} ${className}`.trim()}>
      {files.map((f, i) => (
        <PendingAttachmentChip
          key={`${f.name}-${f.size}-${f.lastModified}-${i}`}
          file={f}
          onRemove={() => onRemoveAt(i)}
        />
      ))}
    </ul>
  );
}
