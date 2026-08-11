/**
 * Stable local dev on Windows: drop stale webpack pack files before starting.
 * Disk pack cache races during HMR → ENOENT on 0.pack.gz and missing chunk modules (9276.js).
 * next.config.mjs uses in-memory webpack cache in dev; this clears leftover disk packs.
 */
import { existsSync, rmSync } from 'fs';
import { resolve } from 'path';
import { spawn } from 'child_process';

const root = process.cwd();
const webpackCache = resolve(root, '.next/cache/webpack');

if (existsSync(webpackCache)) {
  try {
    rmSync(webpackCache, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  } catch {
    /* non-fatal: next dev will still start */
  }
}

const nextBin = resolve(root, 'node_modules/next/dist/bin/next');
const args = ['dev', '--hostname', '127.0.0.1', ...process.argv.slice(2)];

const child = spawn(process.execPath, [nextBin, ...args], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '' },
  cwd: root,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
