import { recordInvoiceEmailOpen, getAdminClient } from '../../../../../../lib/erp-invoice-server';

export const runtime = 'nodejs';

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 1×1 transparent GIF */
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const PIXEL_HEADERS = {
  'Content-Type': 'image/gif',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET(request, { params }) {
  const token = typeof params?.token === 'string' ? params.token.trim() : '';
  if (!TOKEN_RE.test(token)) {
    return new Response(PIXEL, { status: 200, headers: PIXEL_HEADERS });
  }

  try {
    const admin = getAdminClient();
    await recordInvoiceEmailOpen(admin, {
      token,
      userAgent: request.headers.get('user-agent') || '',
    });
  } catch (err) {
    console.warn('invoice email-open', err?.message || err);
  }

  return new Response(PIXEL, { status: 200, headers: PIXEL_HEADERS });
}
