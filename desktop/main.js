'use strict';

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

/** Baked defaults for production builds (shipped inside the packaged app). */
const embedded = require('./embedded-config.json');

/**
 * Config merge: `embedded-config.json` + optional **runtime** env overrides (no rebuild).
 *
 * DIGITALIS_WORKSPACE_ORIGIN — e.g. http://localhost:3000 when testing against `npm run dev`
 * DIGITALIS_START_PATH     — optional path, default `/erp/dashboard` (session restores; `/erp/login` only after sign-out)
 *
 * Production installs load `embedded.workspaceOrigin` (e.g. https://app.digitalisglobal.com): the ERP
 * **is** that Next.js deployment — same pages, Tailwind themes, RBAC invites, CRM, and colors as the browser.
 */
function desktopConfig() {
  const workspaceOrigin = String(
    process.env.DIGITALIS_WORKSPACE_ORIGIN || embedded.workspaceOrigin || '',
  ).replace(/\/$/, '');
  const startRaw = String(process.env.DIGITALIS_START_PATH || embedded.startPath || '/erp/dashboard').trim();
  const startPath = startRaw.startsWith('/') ? startRaw : `/${startRaw}`;
  return { workspaceOrigin, startPath };
}

function buildInitialUrl(conf) {
  const origin = String(conf.workspaceOrigin || '').replace(/\/$/, '');
  const pathPart = String(conf.startPath || '/erp/dashboard');
  const p = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
  return `${origin}${p}`;
}

function resolvedAllowedOrigin(conf) {
  try {
    return new URL(buildInitialUrl(conf)).origin;
  } catch {
    return '';
  }
}

function isSameOrigin(urlStr, allowed) {
  try {
    return new URL(urlStr).origin === allowed;
  } catch {
    return false;
  }
}

/** OAuth + Supabase auth redirects navigate away from the workspace origin — allow those in-window. */
function allowNavigationUrl(urlStr, appOriginStr) {
  if (!urlStr || !appOriginStr) return false;
  if (isSameOrigin(urlStr, appOriginStr)) return true;
  try {
    const u = new URL(urlStr);
    const h = u.hostname.toLowerCase();
    if (h.endsWith('.supabase.co')) return true;
    if (
      h === 'accounts.google.com' ||
      h === 'oauth2.googleapis.com' ||
      h === 'www.google.com' ||
      h.endsWith('.google.com')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function createWindow() {
  const conf = desktopConfig();
  const allowedOrigin = resolvedAllowedOrigin(conf);

  /** Matches ERP shell dark base (same family as gradients in ErpShell) — fill before remote content paints */
  const backgroundColor = '#050a0d';

  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'Digitalis Workspace',
  });

  win.once('ready-to-show', () => win.show());
  win.loadURL(buildInitialUrl(conf)).catch(() => {});

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!allowNavigationUrl(url, allowedOrigin)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.webContents.on('will-redirect', (event, url) => {
    if (!allowNavigationUrl(url, allowedOrigin)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
