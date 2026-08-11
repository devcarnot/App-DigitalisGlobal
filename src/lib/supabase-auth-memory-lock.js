/** In-process auth lock for GoTrue: avoids Web Lock orphans (React remounts / Strict Mode). */
let tail = Promise.resolve();

/**
 * @param {string} _name
 * @param {number} _acquireTimeout
 * @param {() => Promise<unknown>} fn
 */
export async function supabaseAuthMemoryLock(_name, _acquireTimeout, fn) {
  const run = tail.then(() => fn());
  tail = run.catch(() => {});
  return run;
}
