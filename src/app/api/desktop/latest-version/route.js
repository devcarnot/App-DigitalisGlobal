import { NextResponse } from 'next/server';

/** Latest packaged desktop shell version (Windows). Bump when a new .exe is published. */
export async function GET() {
  const version = String(process.env.DESKTOP_WINDOWS_VERSION || '1.0.0').trim() || '1.0.0';
  const downloadPath =
    String(process.env.NEXT_PUBLIC_DESKTOP_WINDOWS_DOWNLOAD_URL || '/downloads/digitalis-workspace-setup.exe').trim() ||
    '/downloads/digitalis-workspace-setup.exe';

  return NextResponse.json(
    { version, downloadPath },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
