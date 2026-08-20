/**
 * Stable local dev on Windows: clear `.next` before each start.
 *
 * Partial cache clears (webpack pack only) still leave stale `.next/server/chunks/*.js`
 * references after HMR crashes → "Cannot find module './8948.js'" and 500s on all chunks.
 *
 * Skip clean: npm run dev:fast
 */
import { existsSync, rmSync } from 'fs';
import { resolve } from 'path';
import { spawn } from 'child_process';

const root = process.cwd();
const nextDir = resolve(root, '.next');
const userArgs = process.argv.slice(2).filter((a) => a !== '--fast');
const skipClean = process.env.DEV_SKIP_CLEAN === '1' || process.argv.includes('--fast');

if (!skipClean && existsSync(nextDir)) {
  try {
    rmSync(nextDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
    console.log('[dev] Cleared .next (avoids stale chunk MODULE_NOT_FOUND on Windows)');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[dev] Could not fully clear .next — stop other next dev/start processes, then retry:', msg);
  }
}

const nextBin = resolve(root, 'node_modules/next/dist/bin/next');
const args = ['dev', '--hostname', '127.0.0.1', ...userArgs];

const child = spawn(process.execPath, [nextBin, ...args], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '' },
  cwd: root,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
