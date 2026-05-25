/**
 * Browser microphone capture for OpenAI Whisper transcription.
 */

/**
 * @returns {boolean}
 */
export function isErpVoiceMicSupported() {
  if (typeof window === 'undefined') return false;
  return Boolean(navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined');
}

function pickRecorderMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

/**
 * @param {object} [opts]
 * @param {(message: string) => void} [opts.onError]
 */
export function createErpVoiceRecorder(opts = {}) {
  /** @type {MediaRecorder | null} */
  let recorder = null;
  /** @type {MediaStream | null} */
  let stream = null;
  /** @type {BlobPart[]} */
  let chunks = [];
  let mimeType = 'audio/webm';

  return {
    async start() {
      if (!isErpVoiceMicSupported()) {
        opts.onError?.('Microphone recording is not supported in this browser.');
        return;
      }

      chunks = [];
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mimeType = pickRecorderMimeType() || 'audio/webm';
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mimeType = recorder.mimeType || mimeType;

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) chunks.push(event.data);
      };

      recorder.start(250);
    },

    /**
     * @returns {Promise<Blob | null>}
     */
    stop() {
      return new Promise((resolve) => {
        if (!recorder || recorder.state === 'inactive') {
          stream?.getTracks().forEach((t) => t.stop());
          stream = null;
          resolve(chunks.length ? new Blob(chunks, { type: mimeType }) : null);
          return;
        }

        recorder.onstop = () => {
          stream?.getTracks().forEach((t) => t.stop());
          stream = null;
          resolve(chunks.length ? new Blob(chunks, { type: mimeType }) : null);
        };

        try {
          recorder.stop();
        } catch {
          stream?.getTracks().forEach((t) => t.stop());
          stream = null;
          resolve(null);
        }
      });
    },

    abort() {
      try {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      } catch {
        /* ignore */
      }
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      chunks = [];
      recorder = null;
    },
  };
}
