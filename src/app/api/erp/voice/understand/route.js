import { NextResponse } from 'next/server';
import { getErpUserFromRequest } from '../../../../../lib/erp-auth-server';
import { understandVoiceAudioWithOpenAi } from '../../../../../lib/erp-voice/erp-voice-openai-server';

export const runtime = 'nodejs';

/**
 * POST /api/erp/voice/understand
 * multipart: audio file + optional pendingIntent JSON + awaitingConfirm
 */
export async function POST(request) {
  const { user, profile, error: authErr } = await getErpUserFromRequest(request);
  if (authErr || !user || !profile) {
    return NextResponse.json({ error: authErr || 'Unauthorized' }, { status: 401 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form with audio file' }, { status: 400 });
  }

  const audio = form.get('audio');
  if (!audio || typeof audio === 'string') {
    return NextResponse.json({ error: 'audio file is required' }, { status: 400 });
  }

  const buffer = Buffer.from(await audio.arrayBuffer());
  const filename = typeof audio.name === 'string' && audio.name ? audio.name : 'voice.webm';
  const mimeType = typeof audio.type === 'string' && audio.type ? audio.type : 'audio/webm';

  let pendingIntent = null;
  const pendingRaw = form.get('pendingIntent');
  if (typeof pendingRaw === 'string' && pendingRaw.trim()) {
    try {
      pendingIntent = JSON.parse(pendingRaw);
    } catch {
      return NextResponse.json({ error: 'Invalid pendingIntent JSON' }, { status: 400 });
    }
  }

  const awaitingConfirm = String(form.get('awaitingConfirm') || '') === '1';

  const result = await understandVoiceAudioWithOpenAi({
    audioBuffer: buffer,
    filename,
    mimeType,
    awaitingConfirm,
    pendingIntent,
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
