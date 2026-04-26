import { NextResponse } from 'next/server';
import { vapidPublicKey } from '../../../../../lib/erp-push-server';

export async function GET() {
  const key = vapidPublicKey();
  return NextResponse.json({ publicKey: key || null });
}

