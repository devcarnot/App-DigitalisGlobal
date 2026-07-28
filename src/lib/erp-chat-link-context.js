/** Resolve a context-menu / click target to an Element (handles text nodes). */
export function eventTargetElement(target) {
  if (target instanceof Element) return target;
  if (target instanceof Node && target.parentElement) return target.parentElement;
  return null;
}

/** True when the user interacted with a rendered chat hyperlink. */
export function isNativeLinkContextTarget(target) {
  const el = eventTargetElement(target);
  return Boolean(el?.closest('a[href]'));
}

/** Resolve href from a context-menu event on or inside a chat link. */
export function linkHrefFromContextEvent(event) {
  const el = eventTargetElement(event.target);
  const anchor = el?.closest('a[href]');
  return anchor?.getAttribute('href')?.trim() || '';
}

/**
 * Let the browser show its native link menu (Copy link, Open in new tab, etc.).
 * Stops the event from reaching message-level custom menus.
 * @returns {boolean} true when the native menu should be allowed
 */
export function allowNativeLinkContextMenu(event) {
  if (!isNativeLinkContextTarget(event.target)) return false;
  event.stopPropagation();
  return true;
}

/**
 * Desktop Electron shells (especially older installs) may not show a native link
 * menu. Call from chat renderers with onDesktopLinkMenu to show the web menu.
 * @returns {'desktop-menu' | 'native' | false}
 */
export function handleChatLinkContextMenu(event, { isDesktop = false, onDesktopLinkMenu } = {}) {
  if (!isNativeLinkContextTarget(event.target)) return false;
  event.stopPropagation();
  const href = linkHrefFromContextEvent(event);
  if (!href) return false;

  if (isDesktop && typeof onDesktopLinkMenu === 'function') {
    event.preventDefault();
    onDesktopLinkMenu({ x: event.clientX, y: event.clientY, href });
    return 'desktop-menu';
  }

  return 'native';
}
