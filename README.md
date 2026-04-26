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

## Cron

The trash purge route (`/api/cron/erp-trash-purge`) expects `CRON_SECRET` when you wire an external scheduler (same as the main app).
