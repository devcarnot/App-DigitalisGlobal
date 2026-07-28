'use strict';

const { app, BrowserWindow, clipboard, ipcMain, session, shell, Menu } = require('electron');

// Keep timers/realtime responsive when the workspace window is minimized or occluded.
if (!app.isReady()) {
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
}
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

const MIN_ZOOM_FACTOR = 0.5;
const MAX_ZOOM_FACTOR = 2.5;
const ZOOM_STEP = 0.1;

function clampZoomFactor(factor) {
  return Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, factor));
}

function installApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            role: 'appMenu',
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Electron does not always show Chromium's default link context menu for remote
 * pages. Provide Copy link / Open link when the user right-clicks a hyperlink.
 * Message-level menus (Reply, Pin, …) stay in the hosted ERP UI.
 */
function attachWebContextMenu(win) {
  win.webContents.on('context-menu', (_event, params) => {
    if (!params.linkURL) return;

    const template = [
      {
        label: 'Copy link',
        click: () => {
          clipboard.writeText(params.linkURL);
        },
      },
      { type: 'separator' },
      {
        label: 'Open link in browser',
        click: () => {
          shell.openExternal(params.linkURL);
        },
      },
    ];

    Menu.buildFromTemplate(template).popup({ window: win });
  });
}

function attachZoomShortcuts(win) {
  const wc = win.webContents;

  const bumpZoom = (delta) => {
    const next = clampZoomFactor(wc.getZoomFactor() + delta);
    wc.setZoomFactor(next);
  };

  wc.on('before-input-event', (event, input) => {
    if (input.type === 'mouseWheel' && (input.control || input.meta)) {
      event.preventDefault();
      if (input.deltaY < 0) bumpZoom(ZOOM_STEP);
      else if (input.deltaY > 0) bumpZoom(-ZOOM_STEP);
      return;
    }

    if (input.type !== 'keyDown') return;
    if (!(input.control || input.meta) || input.alt) return;

    const key = String(input.key || '');
    if (key === '+' || key === '=' || key === 'Add') {
      event.preventDefault();
      bumpZoom(ZOOM_STEP);
      return;
    }
    if (key === '-' || key === '_' || key === 'Subtract') {
      event.preventDefault();
      bumpZoom(-ZOOM_STEP);
      return;
    }
    if (key === '0' || key === 'Digit0' || key === 'Numpad0') {
      event.preventDefault();
      wc.setZoomFactor(1);
    }
  });
}

function createWindow() {
  const conf = desktopConfig();
  const allowedOrigin = resolvedAllowedOrigin(conf);

  // Pre-emptively grant notification + microphone for the workspace origin so
  // the renderer's permission prompts are seamless inside Electron.
  // Anything else (camera/etc.) still has to go through the usual request flow.
  try {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const requestingOrigin = (() => {
        try {
          return new URL(details?.requestingUrl || webContents?.getURL() || '').origin;
        } catch {
          return '';
        }
      })();
      const sameOrigin = !allowedOrigin || requestingOrigin === allowedOrigin;
      if (
        sameOrigin &&
        (permission === 'notifications' || permission === 'media' || permission === 'microphone')
      ) {
        callback(true);
        return;
      }
      callback(false);
    });
    session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
      const sameOrigin = !allowedOrigin || requestingOrigin === allowedOrigin;
      if (
        sameOrigin &&
        (permission === 'notifications' || permission === 'media' || permission === 'microphone')
      ) {
        return true;
      }
      return false;
    });
  } catch {
    /* older Electron without these APIs — silently fall through */
  }

  /**
   * Match auth / login screens: clean white so there is no blue flash before the ERP loads.
   */
  const backgroundColor = '#ffffff';

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
      backgroundThrottling: false,
    },
    title: 'Digitalis Workspace',
  });

  mainWindow = win;
  attachZoomShortcuts(win);
  attachWebContextMenu(win);
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.once('ready-to-show', () => win.show());
  const initialUrl = buildInitialUrl(conf);
  win.loadURL(initialUrl).catch((err) => {
    console.error('[Digitalis Workspace] Failed to load', initialUrl, err?.message || err);
  });

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
  installApplicationMenu();

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
