/**
 * Client helpers for OpenAI-powered voice (Whisper + ChatGPT).
 */

/**
 * @param {object | null | undefined} pendingIntent
 */
export function serializePendingIntentForVoiceApi(pendingIntent) {
  if (!pendingIntent) return null;
  const copy = { ...pendingIntent };
  delete copy.__blocked;
  if (Array.isArray(copy.personCandidates)) {
    copy.personCandidates = copy.personCandidates.map((c, i) => ({
      index: i + 1,
      id: c.id,
      full_name: c.full_name,
      subtitle: c.subtitle,
      role: c.role,
      member_team: c.member_team,
    }));
  }
  return copy;
}

/**
 * @param {string} raw
 * @param {{ awaitingConfirm?: boolean, pendingIntent?: object | null }} opts
 * @param {typeof fetch} fetchFn
 */
export async function parseVoiceTranscriptWithChatGpt(raw, opts = {}, fetchFn) {
  const transcript = String(raw || '').trim();
  if (!transcript) {
    return {
      intent: { type: 'unknown', raw: '', messageEn: 'I did not catch that. Try again.' },
      source: 'openai',
    };
  }

  const res = await fetchFn('/api/erp/voice/parse', {
    method: 'POST',
    body: JSON.stringify({
      transcript,
      awaitingConfirm: Boolean(opts.awaitingConfirm),
      pendingIntent: serializePendingIntentForVoiceApi(opts.pendingIntent),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'ChatGPT voice parsing failed. Set OPENAI_API_KEY.');
  }

  return {
    intent: { ...data.intent, raw: transcript },
    source: 'openai',
  };
}

/**
 * Whisper transcribe + ChatGPT intent in one request.
 * @param {Blob} audioBlob
 * @param {{ awaitingConfirm?: boolean, pendingIntent?: object | null }} opts
 * @param {typeof fetch} fetchFn
 */
export async function understandVoiceAudioWithChatGpt(audioBlob, opts = {}, fetchFn) {
  if (!audioBlob || audioBlob.size < 1) {
    throw new Error('No audio recorded. Try again.');
  }

  const ext = audioBlob.type.includes('webm') ? 'webm' : audioBlob.type.includes('mp4') ? 'm4a' : 'wav';
  const form = new FormData();
  form.append('audio', audioBlob, `voice.${ext}`);
  form.append('awaitingConfirm', opts.awaitingConfirm ? '1' : '0');
  const pending = serializePendingIntentForVoiceApi(opts.pendingIntent);
  if (pending) form.append('pendingIntent', JSON.stringify(pending));

  const res = await fetchFn('/api/erp/voice/understand', {
    method: 'POST',
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'ChatGPT voice failed. Set OPENAI_API_KEY.');
  }

  return {
    transcript: data.transcript,
    intent: data.intent,
    source: 'openai',
  };
}
