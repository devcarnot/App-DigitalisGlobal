# Digitalis Workspace — Electron desktop shell

This folder is **not** a separate copy of the ERP UI.

The packaged app opens a **`BrowserWindow` and loads your deployed Next.js ERP** (`embedded-config.json` → `workspaceOrigin` + `startPath`). The default Electron profile **persists cookies and localStorage** for that origin until the user clears site data — sessions are cleared only when using **Sign out** in the app. Styles, Tailwind palette, RBAC invites, CRM, and navigation are identical to Chrome/Safari on the same URL.

## Keeping desktop in sync with the web app

1. Deploy the Next.js app (e.g. to `https://app.digitalisglobal.com`).
2. Ensure `embedded-config.json` uses that same origin (`workspaceOrigin`).
3. Rebuild installers when needed:  
   - **Windows:** from repo root: `npm run desktop:install`, then `npm run desktop:dist:win`, then `npm run desktop:sync-installer`.  
   - **macOS:** `npm run desktop:dist:mac` **only works on a Mac** (not on Windows). On Windows, use GitHub Actions instead (below).

## macOS `.dmg` from a Windows PC

`electron-builder --mac` fails on Windows by design. Use one of these:

### Option A — GitHub Actions (recommended)

1. Push this repo to GitHub.
2. Open **Actions** → **Build macOS desktop app** → **Run workflow**.
3. When it finishes, download the **digitalis-workspace-setup-dmg** artifact (the `.dmg` file).  
   Builds are **universal** (Intel x64 + Apple Silicon) so they work on 2019 Intel MacBook Pro and M-series Macs.
4. Upload that file to **Vercel Blob** (or any CDN), replacing any older arm64-only DMG.
5. In the Vercel project env (Production):
   - `DESKTOP_MAC_ASSET_URL` = direct HTTPS URL to the `.dmg` (paste the Blob URL; opening it in a browser should download the file).
   - `NEXT_PUBLIC_DESKTOP_MAC_DOWNLOAD_URL` = `/downloads/digitalis-workspace-setup.dmg`
6. Redeploy the site. The landing page **Download for Mac** button appears only when `NEXT_PUBLIC_DESKTOP_MAC_DOWNLOAD_URL` is set.

### Option B — Build on a Mac

```bash
npm run desktop:install
npm run desktop:dist:mac
npm run desktop:sync-installer
```

Then upload `public/_downloads/digitalis-workspace-setup.dmg` or set `DESKTOP_MAC_ASSET_URL` as above.

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

Optional: `DIGITALIS_START_PATH=/erp/dashboard` overrides the first route (default: signed-in session opens straight to workspace; signed-out users are sent to login by the app).

Runs `electron .` inside `desktop/`; `main.js` reads those variables before falling back to `embedded-config.json`.