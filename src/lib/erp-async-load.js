/**
 * Ignore stale async responses when users navigate or filters change quickly.
 * Pattern: const loadId = beginErpLoad(ref); … if (isErpLoadStale(ref, loadId)) return;
 */

/** @param {{ current: number }} ref */
export function beginErpLoad(ref) {
  return ++ref.current;
}

/** @param {{ current: number }} ref @param {number} loadId */
export function isErpLoadStale(ref, loadId) {
  return loadId !== ref.current;
}
