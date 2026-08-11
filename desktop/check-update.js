'use strict';

const { app, dialog, shell } = require('electron');
const https = require('https');
const http = require('http');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

function parseVersionParts(v) {
  return String(v || '0')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

function isRemoteVersionNewer(remote, local) {
  const a = parseVersionParts(remote);
  const b = parseVersionParts(local);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/** Prompt to download a newer desktop installer (no silent auto-install yet). */
function scheduleDesktopUpdateCheck(workspaceOrigin) {
  if (!app.isPackaged || !workspaceOrigin) return;

  setTimeout(async () => {
    try {
      const origin = String(workspaceOrigin).replace(/\/$/, '');
      const data = await fetchJson(`${origin}/api/desktop/latest-version`);
      const remoteVersion = data?.version;
      const downloadPath = data?.downloadPath || '/downloads/digitalis-workspace-setup.exe';
      if (!remoteVersion || !isRemoteVersionNewer(remoteVersion, app.getVersion())) return;

      const downloadUrl = downloadPath.startsWith('http') ? downloadPath : `${origin}${downloadPath}`;
      const result = await dialog.showMessageBox({
        type: 'info',
        title: 'Desktop update available',
        message: `Digitalis Workspace ${remoteVersion} is available.`,
        detail: 'You are on an older desktop app. Download the installer once: after that, future shell updates can prompt you here.',
        buttons: ['Download update', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });
      if (result.response === 0) {
        await shell.openExternal(downloadUrl);
      }
    } catch {
      /* offline / dev: ignore */
    }
  }, 12_000);
}

module.exports = { scheduleDesktopUpdateCheck };
