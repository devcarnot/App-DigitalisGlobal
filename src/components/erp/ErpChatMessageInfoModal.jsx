'use client';

import { formatChatReceiptTime } from '../../lib/erp-chat-read-receipts';
import { erpModalPanelMaxWidthClass } from './ErpModalFormPrimitives';
import ErpBodyPortal from './ErpBodyPortal';

/**
 * WhatsApp-style message info: sent time, delivery, and seen-by list.
 */
export default function ErpChatMessageInfoModal({
  open,
  onClose,
  message,
  mode = 'dm',
  peerName = 'Contact',
  peerReadAt = null,
  seenBy = [],
  pendingBy = [],
}) {
  if (!open || !message) return null;

  const sentAt = formatChatReceiptTime(message.created_at);
  const deliveredAt = formatChatReceiptTime(message.recipient_delivered_at);
  const isDm = mode === 'dm';

  return (
    <ErpBodyPortal>
      <div className="fixed inset-0 z-[320] flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-4 backdrop-blur-[2px]">
        <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
        <div
          className={`relative z-[1] max-h-[min(88dvh,560px)] w-full overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl ${erpModalPanelMaxWidthClass} dark:border-teal-800/55 dark:bg-[#0f1820]`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="erp-chat-message-info-title"
        >
          <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4 dark:border-teal-900/45">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Message info
              </p>
              <h2 id="erp-chat-message-info-title" className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                Delivery & read
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-200"
            >
              Close
            </button>
          </div>

          <div className="overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
            <div className="space-y-3">
              <InfoRow label="Sent" value={sentAt} />
              {isDm ? (
                <>
                  <InfoRow
                    label="Delivered"
                    value={message.recipient_delivered_at ? deliveredAt : 'Pending'}
                    muted={!message.recipient_delivered_at}
                  />
                  <InfoRow
                    label="Read"
                    value={peerReadAt ? `${peerName} · ${formatChatReceiptTime(peerReadAt)}` : 'Not read yet'}
                    muted={!peerReadAt}
                  />
                </>
              ) : (
                <>
                  <InfoRow
                    label="Read by"
                    value={seenBy.length ? `${seenBy.length} member${seenBy.length === 1 ? '' : 's'}` : 'No one yet'}
                    muted={!seenBy.length}
                  />
                  {seenBy.length ? (
                    <ul className="space-y-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-teal-900/45 dark:bg-[#101a22]">
                      {seenBy.map((row) => (
                        <li key={row.userId} className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">{row.name}</span>
                          <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                            {formatChatReceiptTime(row.readAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {pendingBy.length ? (
                    <div>
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Not seen yet
                      </p>
                      <ul className="flex flex-wrap gap-1.5">
                        {pendingBy.map((row) => (
                          <li
                            key={row.userId}
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-teal-800/55 dark:bg-[#121f28] dark:text-slate-300"
                          >
                            {row.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </ErpBodyPortal>
  );
}

function InfoRow({ label, value, muted = false }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 dark:border-teal-900/45 dark:bg-[#101a22]">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
      <span
        className={`text-right text-sm font-semibold ${muted ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}
      >
        {value}
      </span>
    </div>
  );
}
