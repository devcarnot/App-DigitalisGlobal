/** WhatsApp-inspired chat thread + bubble styling (DM / group). */

export const ERP_WA_THREAD_CLASS =
  'min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-2 [scrollbar-color:rgba(100,116,139,0.35)_transparent] [scrollbar-width:thin] ' +
  'bg-[#f0f2f5] ' +
  'dark:bg-[#0b141a] dark:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.035)_1px,transparent_0)] dark:bg-[length:10px_10px] dark:[scrollbar-color:rgba(72,209,204,0.35)_rgba(15,23,42,0.45)]';

export const ERP_WA_MSG_MAX = 'max-w-[min(82vw,32rem)]';

export const ERP_WA_LAUNCHER_COL =
  'hidden w-[3.5rem] shrink-0 flex-row items-center justify-center gap-1.5 self-stretch lg:flex lg:opacity-0 lg:transition-opacity lg:group-hover/msg:opacity-100 lg:group-focus-within/msg:opacity-100';

/** Project chat panel is narrower — show launchers from sm breakpoint. */
export const ERP_WA_LAUNCHER_COL_PROJECT =
  'hidden w-[3.5rem] shrink-0 flex-row items-center justify-center gap-1 self-center sm:flex sm:opacity-0 sm:transition-opacity sm:group-hover/msg:opacity-100 sm:group-focus-within/msg:opacity-100';

export function erpWaBubbleRowClass(mine) {
  return `flex max-w-full items-center ${mine ? 'flex-row-reverse' : 'flex-row'}`;
}

export function erpWaMessageRowClass(mine) {
  return `group/msg flex w-full py-0.5 ${mine ? 'justify-end' : 'justify-start'}`;
}

export function erpWaBubbleClass(mine, brandSent = false) {
  const base =
    'relative min-w-0 max-w-full overflow-hidden px-[9px] py-[5px] text-[14.2px] leading-[19px] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]';
  if (mine) {
    if (brandSent) {
      return `${base} rounded-lg rounded-tr-none bg-gradient-to-br from-[#589cd5] to-[#52c4c9] text-white shadow-[0_1px_0.5px_rgba(37,99,235,0.28)] dark:from-[#589cd5] dark:to-[#52c4c9]`;
    }
    return `${base} rounded-lg rounded-tr-none bg-[#d9fdd3] text-[#111b21] dark:!bg-[#005c4b] dark:text-[#e9edef]`;
  }
  return `${base} rounded-lg rounded-tl-none bg-[#ffffff] text-[#111b21] dark:!bg-[#202c33] dark:!text-[#e9edef]`;
}

export function erpWaMetaClass(mine, brandSent = false) {
  if (mine && brandSent) {
    return 'text-[11px] leading-none tabular-nums text-white/75';
  }
  return mine
    ? 'text-[11px] leading-none tabular-nums text-[#667781] dark:text-[#99beb7]'
    : 'text-[11px] leading-none tabular-nums text-[#667781] dark:text-[#8696a0]';
}

export function erpWaReplyQuoteClass(mine, brandSent = false) {
  if (mine) {
    if (brandSent) {
      return 'mb-1.5 w-full rounded-md border-l-[3px] border-white/75 bg-black/15 px-2 py-1.5 text-left text-xs text-white';
    }
    return 'mb-1.5 w-full rounded-md border-l-[3px] border-[#53bdeb] bg-[#006677]/10 px-2 py-1.5 text-left text-xs text-[#111b21] dark:bg-black/20 dark:text-[#e9edef]';
  }
  return 'mb-1.5 w-full rounded-md border-l-[3px] border-[#53bdeb] bg-black/[0.04] px-2 py-1.5 text-left text-xs text-[#111b21] dark:bg-white/[0.06] dark:text-[#e9edef]';
}

export function erpWaBubbleBodyClass(mine, brandSent = false) {
  if (mine && brandSent) {
    return [
      '!text-white',
      '[&_p]:text-inherit [&_li]:text-inherit [&_strong]:text-inherit [&_em]:text-inherit',
      '[&_a]:!text-white [&_a]:underline',
      '[&_code]:rounded [&_code]:!bg-black/25 [&_code]:px-1 [&_code]:!text-white',
      '[&_pre]:rounded-lg [&_pre]:border [&_pre]:!border-white/25 [&_pre]:!bg-black/25 [&_pre]:p-2 [&_pre]:!text-white/95',
      '[&_blockquote]:my-1 [&_blockquote]:rounded-md [&_blockquote]:border-l-[3px] [&_blockquote]:!border-white/70 [&_blockquote]:!bg-black/20 [&_blockquote]:pl-2.5 [&_blockquote]:!text-white/95',
      '[&_blockquote_*]:!text-inherit [&_blockquote_em]:!text-inherit [&_blockquote_strong]:!text-inherit',
      '[&_ul]:text-inherit [&_ol]:text-inherit [&_h1]:text-inherit [&_h2]:text-inherit [&_h3]:text-inherit',
    ].join(' ');
  }
  if (mine) {
    return [
      '[&_a]:text-[#027eb5] [&_a]:underline dark:[&_a]:text-[#53bdeb]',
      '[&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1',
      '[&_pre]:border-black/10 [&_pre]:bg-black/10',
      '[&_blockquote]:my-1 [&_blockquote]:rounded-md [&_blockquote]:border-l-[3px] [&_blockquote]:border-[#53bdeb]/80 [&_blockquote]:bg-black/[0.06] [&_blockquote]:pl-2.5 [&_blockquote]:text-[#111b21] dark:[&_blockquote]:bg-black/25 dark:[&_blockquote]:text-[#e9edef]',
      '[&_blockquote_*]:text-inherit [&_blockquote_em]:text-inherit [&_blockquote_strong]:text-inherit',
    ].join(' ');
  }
  return [
    '[&_a]:text-[#027eb5] [&_a]:underline dark:[&_a]:text-[#53bdeb]',
    '[&_blockquote]:my-1 [&_blockquote]:rounded-md [&_blockquote]:border-l-[3px] [&_blockquote]:border-[#53bdeb]/80 [&_blockquote]:bg-black/[0.06] [&_blockquote]:pl-2.5 [&_blockquote]:text-[#111b21] dark:[&_blockquote]:bg-black/25 dark:[&_blockquote]:text-[#e9edef]',
    '[&_blockquote_*]:text-inherit [&_blockquote_em]:text-inherit [&_blockquote_strong]:text-inherit',
  ].join(' ');
}

export const ERP_WA_COMPOSER_SHELL =
  '!border-0 !bg-transparent !p-0 !shadow-none dark:!border-0 dark:!bg-transparent';

/** Shared class for vertically resizable chat composer fields (DM + project chat). */
export const ERP_CHAT_COMPOSER_INPUT_CLASS = 'erp-chat-composer-input';
export function erpWaReadMoreFadeClass(mine, brandSent = false) {
  if (mine && brandSent) {
    return 'from-[#589cd5] via-[#52c4c9]/90 to-transparent';
  }
  return mine
    ? 'from-[#d9fdd3] via-[#d9fdd3]/90 to-transparent dark:from-[#005c4b] dark:via-[#005c4b]/90'
    : 'from-white via-white/90 to-transparent dark:from-[#202c33] dark:via-[#202c33]/90';
}
