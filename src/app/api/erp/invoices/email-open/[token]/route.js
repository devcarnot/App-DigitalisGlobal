import { recordInvoiceEmailOpen, getAdminClient } from '../../../../../../lib/erp-invoice-server';

export const runtime = 'nodejs';

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 1×1 transparent GIF */
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function GET(_request, { params }) {
  const token = typeof params?.token === 'string' ? params.token.trim() : '';
  if (!TOKEN_RE.test(token)) {
    return new Response(PIXEL, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  }

  try {
    const admin = getAdminClient();
    await recordInvoiceEmailOpen(admin, { token });
  } catch {
    // Always return pixel so email clients do not show broken images.
  }

  return new Response(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
