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
