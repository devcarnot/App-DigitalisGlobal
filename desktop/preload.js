'use strict';

const { contextBridge } = require('electron');

/** Renderer checks `window.__DIGITALIS_DESKTOP__` (session bootstrap tweaks, UX). */
contextBridge.exposeInMainWorld('__DIGITALIS_DESKTOP__', true);
