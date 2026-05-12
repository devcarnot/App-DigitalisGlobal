'use strict';

const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const { execFile } = require('child_process');
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

/**
 * AppUserModelID controls which app a Windows toast is attributed to.
 *
 * If we leave it unset the OS shows incoming notifications under the generic
 * "Electron" name (and uses the Electron icon), which looks like spam from a
 * stranger app to the user. Pinning it to our packaged appId makes the
 * native toast show "Digitalis Workspace" with our shortcut icon instead.
 */
const APP_USER_MODEL_ID = 'com.digitalisglobal.workspace';

/** Friendly app name surfaced on Windows toasts + Action Center entries. */
const APP_DISPLAY_NAME = 'Digitalis Workspace';

/**
 * Make Windows show "Digitalis Workspace" instead of `electron.app.Electron`
 * (or the raw AppUserModelID) on toast notifications.
 *
 * `app.setAppUserModelId(...)` alone is NOT enough on its own — Windows
 * only knows the display name + icon for an AUMID if there's either:
 *   (a) an installed Start-Menu shortcut bound to that AUMID (which the
 *       NSIS installer creates for production installs), or
 *   (b) a registry entry under `HKCU\Software\Classes\AppUserModelId\<aumid>`
 *       listing the DisplayName + IconUri.
 *
 * Production installs typically have (a). Development runs (`npm run
 * desktop:start`), portable builds, and any first launch before the
 * installer-created shortcut has been used at least once all fall back
 * to (b), so we write the registry entry here. Idempotent and silent on
 * non-Windows platforms.
 */
function registerWindowsToastAppDisplay() {
  if (process.platform !== 'win32') return;
  const regKey = `HKCU\\Software\\Classes\\AppUserModelId\\${APP_USER_MODEL_ID}`;
  // `process.execPath,0` resolves to whichever exe is actually running the
  // app — that's our installed Digitalis Workspace.exe in production (with
  // the proper icon baked in) and the Electron binary during development.
  // Either way the toast shows the running process's icon next to the
  // friendly DisplayName, which is what users expect.
  const iconUri = `${process.execPath},0`;
  const writes = [
    ['DisplayName', 'REG_SZ', APP_DISPLAY_NAME],
    ['IconUri', 'REG_SZ', iconUri],
    // Some Windows builds use a separate IconBackgroundColor for monochrome
    // toast icons. Setting transparent here keeps our colored logo intact.
    ['IconBackgroundColor', 'REG_SZ', '0'],
  ];
  for (const [name, type, value] of writes) {
    try {
      execFile(
        'reg.exe',
        ['add', regKey, '/v', name, '/t', type, '/d', value, '/f'],
        { windowsHide: true },
        () => {
          /* best-effort — `reg.exe` may not exist on locked-down systems */
        },
      );
    } catch {
      /* ignore — silent fallback to the default attribution */
    }
  }
}

/** Latest window — used by the IPC focus handler so the renderer can pop the
 *  window forward when the user clicks an OS notification. */
let mainWindow = null;

function createWindow() {
  const conf = desktopConfig();
  const allowedOrigin = resolvedAllowedOrigin(conf);

  // Pre-emptively grant notification permission for the workspace origin so
  // the renderer's `Notification.requestPermission()` resolves immediately
  // and the user never sees Chromium's permission popup inside Electron.
  // Anything else (camera/mic/etc.) still has to go through the usual
  // request flow.
  try {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      if (permission === 'notifications') {
        const requestingOrigin = (() => {
          try {
            return new URL(details?.requestingUrl || webContents?.getURL() || '').origin;
          } catch {
            return '';
          }
        })();
        if (!allowedOrigin || requestingOrigin === allowedOrigin) {
          callback(true);
          return;
        }
      }
      callback(false);
    });
    // Newer Electron versions ALSO call `setPermissionCheckHandler` for the
    // sync `Notification.permission` getter; mirror the same allow-listing
    // there so the renderer sees `granted` on first read.
    session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
      if (permission === 'notifications') {
        return !allowedOrigin || requestingOrigin === allowedOrigin;
      }
      return false;
    });
  } catch {
    /* older Electron without these APIs — silently fall through */
  }

  /**
   * Match `--erp-canvas-light` in `globals.css` so translucent panels sit on neutral gray (#e5e7eb).
   */
  const backgroundColor = '#e5e7eb';

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

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.once('ready-to-show', () => win.show());
  win.loadURL(buildInitialUrl(conf)).catch(() => {});

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Allow client-side `window.open('', '_blank')` + blob: redirects so the
    // in-app "Open in new tab" file-preview flow can stream rewritten content
    // (e.g. markdown coerced to text/plain) into a fresh BrowserWindow. With
    // nativeWindowOpen these share the opener's renderer, so blob URLs from
    // the parent stay resolvable.
    if (!url || url === 'about:blank' || url.startsWith('blob:') || url.startsWith('data:')) {
      return { action: 'allow' };
    }
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

app.whenReady().then(() => {
  // Must be called before any BrowserWindow is created on Windows; safe no-op
  // elsewhere. Aligns toast attribution with the installed shortcut.
  try {
    if (process.platform === 'win32') {
      app.setAppUserModelId(APP_USER_MODEL_ID);
    }
  } catch {
    /* setAppUserModelId is only available on Windows */
  }
  // Register the AUMID → "Digitalis Workspace" mapping in the user's
  // registry so Windows stops showing `electron.app.Electron` on the
  // toast header for dev runs and first-launch-before-shortcut-use.
  try {
    registerWindowsToastAppDisplay();
  } catch {
    /* best-effort */
  }
  createWindow();
});

// Renderer → main: pop the window to the foreground (called from OS toast
// click handlers in `src/lib/erp-desktop-notifier.js`). Restoring before
// focusing handles the "user minimised the window" case on Windows where a
// plain `focus()` won't un-minimise.
ipcMain.handle('digitalis:focus-window', () => {
  const win = mainWindow || BrowserWindow.getAllWindows()[0];
  if (!win) return false;
  try {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
    win.moveTop?.();
    return true;
  } catch {
    return false;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
