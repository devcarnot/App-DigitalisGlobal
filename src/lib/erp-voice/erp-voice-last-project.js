const STORAGE_KEY = 'erp:voiceLastProject';

/** Remember last voice-created project for "isko delete karo" commands. */
export function rememberVoiceLastProject(projectId, projectName) {
  if (typeof window === 'undefined' || !projectId) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ id: projectId, name: projectName || '', at: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

/** @returns {{ id: string, name: string, at: number } | null} */
export function getVoiceLastProject() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.id) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function clearVoiceLastProject() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
