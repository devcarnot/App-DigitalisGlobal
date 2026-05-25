/**
 * Browser Web Speech API wrapper (Chrome / Edge / Electron Chromium).
 * Roman Urdu is spoken; STT often returns Roman/English/Hindi mix — intent parser handles that.
 */

/**
 * @returns {boolean}
 */
export function isErpVoiceSpeechSupported() {
  if (typeof window === 'undefined') return false;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  return Boolean(SR);
}

/**
 * Preferred recognition languages (Roman Urdu speakers often work best with en-IN + hi-IN).
 * @returns {string[]}
 */
export function erpVoiceRecognitionLanguages() {
  return ['en-IN', 'hi-IN', 'ur-PK', 'en-US', 'en-GB'];
}

/**
 * @param {object} opts
 * @param {(text: string, isFinal: boolean) => void} opts.onResult
 * @param {(message: string) => void} [opts.onError]
 * @param {() => void} [opts.onEnd]
 * @returns {{ start: () => void, stop: () => void, abort: () => void, getTranscript: () => string }}
 */
export function createErpVoiceRecognizer({ onResult, onError, onEnd }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    return {
      start() {
        onError?.('Speech recognition is not supported in this browser.');
      },
      stop() {},
      abort() {},
      getTranscript: () => '',
    };
  }

  const recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;
  recognition.lang = erpVoiceRecognitionLanguages()[0];

  /** @type {string[]} */
  const finalChunks = [];
  let stoppedByUser = false;

  recognition.onresult = (event) => {
    finalChunks.length = 0;
    let interim = '';

    for (let i = 0; i < event.results.length; i += 1) {
      const result = event.results[i];
      const piece = (result[0]?.transcript || '').trim();
      if (!piece) continue;
      if (result.isFinal) finalChunks[i] = piece;
      else interim += (interim ? ' ' : '') + piece;
    }

    const finals = finalChunks.filter(Boolean).join(' ').trim();
    const display = [finals, interim].filter(Boolean).join(' ').trim();
    if (display) onResult(display, false);
  };

  recognition.onerror = (event) => {
    const code = event?.error || 'unknown';
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      onError?.('Microphone permission denied. Allow mic access for this site.');
      return;
    }
    if (code === 'no-speech') {
      onError?.('No speech detected. Try again.');
      return;
    }
    if (code === 'aborted') return;
    onError?.(`Voice error: ${code}`);
  };

  recognition.onend = () => {
    const full = finalChunks.filter(Boolean).join(' ').trim();
    if (full) onResult(full, true);
    onEnd?.(stoppedByUser, full);
  };

  return {
    start() {
      stoppedByUser = false;
      finalChunks.length = 0;
      try {
        recognition.start();
      } catch (e) {
        onError?.(e?.message || 'Could not start microphone.');
      }
    },
    stop() {
      stoppedByUser = true;
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    },
    abort() {
      stoppedByUser = true;
      try {
        recognition.abort();
      } catch {
        /* ignore */
      }
    },
    getTranscript() {
      return finalChunks.filter(Boolean).join(' ').trim();
    },
  };
}

/**
 * @returns {boolean}
 */
export function isErpDesktopShell() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.digitalisDesktop || window.electronAPI || navigator.userAgent.includes('Electron'));
}
