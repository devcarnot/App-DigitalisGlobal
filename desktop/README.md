# Digitalis Workspace — Electron desktop shell

This folder is **not** a separate copy of the ERP UI.

The packaged app opens a **`BrowserWindow` and loads your deployed Next.js ERP** (`embedded-config.json` → `workspaceOrigin` + `startPath`). Styles, Tailwind palette, RBAC invites, CRM, and navigation are identical to Chrome/Safari on the same URL.

## Keeping desktop in sync with the web app

1. Deploy the Next.js app (e.g. to `https://app.digitalisglobal.com`).
2. Ensure `embedded-config.json` uses that same origin (`workspaceOrigin`).
3. Rebuild installers when needed:  
   From repo root: `npm run desktop:install`, then `npm run desktop:dist:win`, optionally `npm run desktop:sync-installer` before redeploying the site hosting the `.exe`.

Users who launch the desktop app always run the **current** ERP from that host—no duplicate codepaths to drift.

## Local development (Electron + `npm run dev`)

1. Repo root: `npm run dev` (Next on port 3000).
2. In another terminal, **set the URL override** then start Electron from the repo root (same shell session keeps the env var):

PowerShell:

```powershell
$env:DIGITALIS_WORKSPACE_ORIGIN = "http://localhost:3000"
npm run desktop:start
```

macOS/Linux:

```bash
DIGITALIS_WORKSPACE_ORIGIN=http://localhost:3000 npm run desktop:start
```

Optional: `DIGITALIS_START_PATH=/erp/login` overrides the first route.

Runs `electron .` inside `desktop/`; `main.js` reads those variables before falling back to `embedded-config.json`.