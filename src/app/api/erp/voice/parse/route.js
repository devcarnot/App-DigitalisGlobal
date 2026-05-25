import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { parseVoiceTranscriptWithOpenAi } from '../../../../../lib/erp-voice/erp-voice-openai-server';

export const runtime = 'nodejs';

/**
 * POST /api/erp/voice/parse
 * body: { transcript: string, awaitingConfirm?: boolean, pendingIntent?: object | null }
 */
export async function POST(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const transcript = String(body?.transcript || '').trim();
  if (!transcript) {
    return NextResponse.json({ error: 'transcript is required' }, { status: 400 });
  }

  if (transcript.length > 2000) {
    return NextResponse.json({ error: 'transcript too long' }, { status: 400 });
  }

  const result = await parseVoiceTranscriptWithOpenAi({
    transcript,
    awaitingConfirm: Boolean(body?.awaitingConfirm),
    pendingIntent: body?.pendingIntent || null,
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
