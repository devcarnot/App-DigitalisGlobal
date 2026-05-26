'use client';

import { groupReceiptStatus } from '../../lib/erp-chat-read-receipts';

function IconCheck({ className }) {
  return (
    <svg className={className} viewBox="0 0 12 10" fill="none" aria-hidden>
      <path d="M1 5.2l2.7 2.6L11 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** WhatsApp-style ticks for 1:1 DMs on outgoing bubbles. */
export function DmReceiptTicks({ read, delivered, onClick }) {
  const label = read ? 'Read' : delivered ? 'Delivered' : 'Sent';
  const tone = read ? 'text-sky-300' : delivered ? 'text-white/55' : 'text-white/40';
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-px ${tone} ${onClick ? 'rounded hover:opacity-90' : ''}`}
      title={onClick ? `${label} · Message info` : label}
      aria-label={onClick ? `${label}. Open message info` : label}
    >
      {delivered ? (
        <span className="relative inline-flex h-3 w-[18px]">
          <IconCheck className="absolute left-0 top-0 h-3 w-3 shrink-0" />
          <IconCheck className="absolute left-[5px] top-0 h-3 w-3 shrink-0" />
        </span>
      ) : (
        <IconCheck className="h-3 w-3 shrink-0" />
      )}
    </Tag>
  );
}

/** Group / project outgoing message ticks (cursor-based seen-by). */
export function GroupReceiptTicks({ seenCount = 0, totalCount = 0, mineTone = false, onClick }) {
  const status = groupReceiptStatus({ seenCount, totalCount });
  const label =
    status === 'read'
      ? `Read by all (${seenCount})`
      : status === 'partial'
        ? `Read by ${seenCount} of ${totalCount}`
        : totalCount > 0
          ? `Sent · waiting for ${totalCount}`
          : 'Sent';
  const tone =
    status === 'read'
      ? mineTone
        ? 'text-sky-300'
        : 'text-sky-600 dark:text-sky-300'
      : status === 'partial'
        ? mineTone
          ? 'text-white/55'
          : 'text-slate-500 dark:text-slate-400'
        : mineTone
          ? 'text-white/40'
          : 'text-slate-400 dark:text-slate-500';
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-px ${tone} ${onClick ? 'rounded hover:opacity-90' : ''}`}
      title={onClick ? `${label} · Message info` : label}
      aria-label={onClick ? `${label}. Open message info` : label}
    >
      {status === 'sent' ? (
        <IconCheck className="h-3 w-3 shrink-0" />
      ) : (
        <span className="relative inline-flex h-3 w-[18px]">
          <IconCheck className="absolute left-0 top-0 h-3 w-3 shrink-0" />
          <IconCheck className="absolute left-[5px] top-0 h-3 w-3 shrink-0" />
        </span>
      )}
    </Tag>
  );
}
