import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';

/**
 * Stable download URL for the macOS installer (.dmg).
 *
 * Host the DMG on Vercel Blob (or another object store) and set
 * `DESKTOP_MAC_ASSET_URL` to the direct file URL.
 *
 * Local dev: place the file at `public/_downloads/digitalis-workspace-setup.dmg`
 * after `npm run desktop:dist:mac` and `npm run desktop:sync-installer`.
 */
export async function GET() {
  const target = typeof process.env.DESKTOP_MAC_ASSET_URL === 'string' ? process.env.DESKTOP_MAC_ASSET_URL.trim() : '';
  if (!target) {
    const localPath = path.join(process.cwd(), 'public', '_downloads', 'digitalis-workspace-setup.dmg');
    if (!fs.existsSync(localPath)) {
      const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Mac installer not ready</title>
<style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;color:#103D4D;line-height:1.5}
h1{font-size:1.25rem}code{background:#e0f7fa;padding:.1em .35em;border-radius:4px;font-size:.9em}</style></head>
<body><h1>Mac installer not available yet</h1>
<p>The <code>.dmg</code> has not been uploaded. macOS builds must run on a Mac (or GitHub Actions <code>macos-latest</code>): they cannot be built on Windows. Use a <strong>universal</strong> build so Intel Macs (e.g. 2019 MacBook Pro) and Apple Silicon both work.</p>
<ol>
<li>Run workflow <strong>Build macOS desktop app</strong> on GitHub, or <code>npm run desktop:dist:mac</code> on a Mac.</li>
<li>Upload <code>digitalis-workspace-setup.dmg</code> to Vercel Blob (or CDN).</li>
<li>Set Vercel env <code>DESKTOP_MAC_ASSET_URL</code> to the direct file URL and <code>NEXT_PUBLIC_DESKTOP_MAC_DOWNLOAD_URL</code> to <code>/downloads/digitalis-workspace-setup.dmg</code>, then redeploy.</li>
</ol>
<p><a href="/">Back to home</a></p></body></html>`;
      return new NextResponse(html, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const file = await fs.promises.readFile(localPath);
    return new NextResponse(file, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-apple-diskimage',
        'Content-Disposition': 'attachment; filename="digitalis-workspace-setup.dmg"',
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.redirect(target, { status: 302 });
}
