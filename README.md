# App Digitalis (ERP)

Next.js app that runs the Digitalis **ERP** against the **same Supabase project** as the main marketing site. Deploy it on its own domain (for example `app.digitalisglobal.com`) in a **separate GitHub repo** if you want.

## Setup

1. Copy `.env.local.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to match the main Digitalis app (or your Supabase project).

2. Set `NEXT_PUBLIC_SITE_URL` to this app’s public URL (dev: `http://localhost:3000`).

3. In **Supabase → Authentication → URL configuration**, add this app’s URL to **Redirect URLs** (and adjust **Site URL** if this install is the only entry point for ERP users in production).

4. Install and run:

```bash
npm install
npm run dev
```

5. Open `http://localhost:3000` — it redirects to `/erp/dashboard`.

## Build

```bash
npm run build
npm start
```

## Desktop app (Windows / Electron)

The **Digitalis Workspace** desktop app (Windows `.exe`, macOS `.dmg`) is a thin Electron shell: it loads the **same deployed Next.js URL** as `embedded-config.json` (see `desktop/` — usually `https://app.digitalisglobal.com`). There is **no separate desktop UI codebase**; colors, ERP features, RBAC invites, CRM, etc. match the browser app on that host automatically after each deploy. The window uses the **embedded browser’s persisted storage** for your workspace origin and opens **`/erp/dashboard`** by default so you stay signed in after closing the app until you use **Sign out**.

- Build installers: `npm run desktop:install`, then `npm run desktop:dist:win` (Windows) and/or `npm run desktop:dist:mac` on a Mac; host the files and/or run `npm run desktop:sync-installer` — see `.env.local.example` for download URL notes.
- **Local testing:** With `npm run dev` running, override the Electron load URL via env before `npm run desktop:start` — see `desktop/README.md`.

## Cron

The trash purge route (`/api/cron/erp-trash-purge`) expects `CRON_SECRET` when you wire an external scheduler (same as the main app).

Meeting reminders (`/api/cron/erp-meeting-reminders`) use the same `CRON_SECRET` and should run every ~5 min — it fires a single web push + in-app notification per meeting, ~10 min before `scheduled_at` (configurable via `ERP_MEETING_REMINDER_LEAD_MINUTES`, default 15). Idempotent via `erp_meetings.reminder_sent_at`.
