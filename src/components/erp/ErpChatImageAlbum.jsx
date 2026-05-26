'use client';

import { useEffect, useMemo, useState } from 'react';
import { getCachedSignedUrl, readCachedSignedUrl } from '../../lib/erp-signed-url-cache';

function albumLayout(count) {
  if (count <= 1) {
    return {
      gridClass: 'grid-cols-1',
      cells: [{ index: 0, cellClass: 'aspect-[4/3] max-h-56' }],
      extraCount: 0,
    };
  }
  if (count === 2) {
    return {
      gridClass: 'grid-cols-2',
      cells: [
        { index: 0, cellClass: 'aspect-square' },
        { index: 1, cellClass: 'aspect-square' },
      ],
      extraCount: 0,
    };
  }
  if (count === 3) {
    return {
      gridClass: 'grid-cols-2 grid-rows-2',
      cells: [
        { index: 0, cellClass: 'row-span-2 aspect-auto min-h-[9.5rem]' },
        { index: 1, cellClass: 'aspect-square' },
        { index: 2, cellClass: 'aspect-square' },
      ],
      extraCount: 0,
    };
  }
  return {
    gridClass: 'grid-cols-2 grid-rows-2',
    cells: [
      { index: 0, cellClass: 'aspect-square' },
      { index: 1, cellClass: 'aspect-square' },
      { index: 2, cellClass: 'aspect-square' },
      { index: 3, cellClass: 'aspect-square' },
    ],
    extraCount: Math.max(0, count - 4),
  };
}

function AlbumCell({ attachment, cellClass, onOpen, overlayCount = 0 }) {
  const path = attachment?.path || '';
  const [url, setUrl] = useState(() => (path ? readCachedSignedUrl(path) ?? null : null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return undefined;
    }
    let alive = true;
    const cached = readCachedSignedUrl(path);
    if (cached !== undefined) {
      setUrl(cached);
      setFailed(!cached);
      return undefined;
    }
    getCachedSignedUrl(path).then((signed) => {
      if (!alive) return;
      setUrl(signed);
      setFailed(!signed);
    });
    return () => {
      alive = false;
    };
  }, [path]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-slate-200/80 text-[10px] text-slate-500 dark:bg-slate-700/50 ${cellClass}`}>
        Failed
      </div>
    );
  }

  if (!url) {
    return <div className={`animate-pulse bg-slate-200/80 dark:bg-slate-700/50 ${cellClass}`} />;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      title={attachment?.name || 'Open image'}
      className={`relative block w-full overflow-hidden bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 dark:bg-[#0e1824] ${cellClass}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={attachment?.name || ''}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
      {overlayCount > 0 ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-2xl font-bold text-white">
          +{overlayCount}
        </span>
      ) : null}
    </button>
  );
}

/**
 * WhatsApp-style packed preview for multiple image attachments in one message.
 */
export default function ErpChatImageAlbum({ attachments = [], onPreview }) {
  const items = useMemo(
    () => (attachments || []).filter((item) => item && item.path),
    [attachments],
  );
  const layout = useMemo(() => albumLayout(items.length), [items.length]);

  if (!items.length) return null;

  return (
    <div
      className={`mt-1 grid max-w-[min(100%,17.5rem)] gap-0.5 overflow-hidden rounded-xl ${layout.gridClass}`}
    >
      {layout.cells.map(({ index, cellClass }) => {
        const attachment = items[index];
        if (!attachment) return null;
        const isLastVisible = index === layout.cells[layout.cells.length - 1].index;
        return (
          <AlbumCell
            key={attachment.path}
            attachment={attachment}
            cellClass={cellClass}
            overlayCount={isLastVisible ? layout.extraCount : 0}
            onOpen={() => onPreview?.(attachment)}
          />
        );
      })}
    </div>
  );
}
