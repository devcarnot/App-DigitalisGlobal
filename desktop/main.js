'use strict';

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const cfg = require('./embedded-config.json');

function initialUrl() {
  const origin = String(cfg.workspaceOrigin || '').replace(/\/$/, '');
  const p = String(cfg.startPath || '/erp/login');
  const pathPart = p.startsWith('/') ? p : `/${p}`;
  return `${origin}${pathPart}`;
}

function allowedOrigin() {
  try {
    return new URL(initialUrl()).origin;
  } catch {
    return '';
  }
}

function isSameOrigin(urlStr) {
  try {
    return new URL(urlStr).origin === allowedOrigin();
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'Digitalis Workspace',
  });

  win.once('ready-to-show', () => win.show());
  win.loadURL(initialUrl());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isSameOrigin(url)) {
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
