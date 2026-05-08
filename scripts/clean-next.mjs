/**
 * Remove `.next` before production builds so output is never mixed with
 * Turbopack dev artifacts (`next dev --turbo`). Mixing breaks `next start` / hosting
 * with: "Expected to use Webpack bindings ... but ... Turbopack bindings".
 *
 * npm runs this automatically via `prebuild` before `next build`.
 */
import { existsSync, rmSync } from 'fs';
import { resolve } from 'path';

const nextDir = resolve(process.cwd(), '.next');
if (!existsSync(nextDir)) process.exit(0);

try {
  rmSync(nextDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('[clean-next] Failed to delete .next (stop next dev/start on this repo, then retry):', msg);
  process.exit(1);
}
