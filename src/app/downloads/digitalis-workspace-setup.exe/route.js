import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';

/**
 * Stable download URL for the Windows installer.
 *
 * Vercel deployments shouldn't try to serve large .exe files from `public/` via git deploy.
 * Instead, host the installer on Vercel Blob (or another object store) and set
 * `DESKTOP_WINDOWS_ASSET_URL` to the direct file URL.
 *
 * The landing page can link to `/downloads/digitalis-workspace-setup.exe` and this
 * route will redirect to the real asset.
 */
export async function GET() {
  const target = typeof process.env.DESKTOP_WINDOWS_ASSET_URL === 'string' ? process.env.DESKTOP_WINDOWS_ASSET_URL.trim() : '';
  if (!target) {
    // Local/dev fallback: serve from `public/downloads/` if the file exists.
    // (In production we expect `DESKTOP_WINDOWS_ASSET_URL` to be configured.)
    const localPath = path.join(process.cwd(), 'public', '_downloads', 'digitalis-workspace-setup.exe');
    if (!fs.existsSync(localPath)) {
      return NextResponse.json(
        {
          error:
            'Desktop installer is not configured. Set DESKTOP_WINDOWS_ASSET_URL (server env) to a hosted .exe URL, or place the installer at public/_downloads/digitalis-workspace-setup.exe for local dev.',
        },
        { status: 404 },
      );
    }

    const file = await fs.promises.readFile(localPath);
    return new NextResponse(file, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.microsoft.portable-executable',
        'Content-Disposition': 'attachment; filename="digitalis-workspace-setup.exe"',
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.redirect(target, { status: 302 });
}

