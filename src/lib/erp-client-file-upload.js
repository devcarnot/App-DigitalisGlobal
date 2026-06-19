import { supabase } from './supabase';
import {
  ERP_MAX_UPLOAD_BYTES,
  ERP_MAX_UPLOAD_MB,
  guessErpFileMime,
  withGuessedErpFileMime,
} from './erp-upload-limits';

function safeStorageFileName(name) {
  return String(name || 'file')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 120);
}

/**
 * Upload a project-scoped attachment straight to Supabase Storage from the browser.
 * Avoids Next.js / Vercel ~4.5 MB API body limits while keeping the same object paths
 * as `/api/erp/uploads/task-attachment`.
 *
 * @param {{ projectId: string, userId: string, scope: string, file: File }} opts
 */
export async function uploadErpProjectFile({ projectId, userId, scope, file }) {
  if (!projectId || !userId || !file) {
    throw new Error('Missing upload parameters');
  }
  if (typeof file.size === 'number' && file.size > ERP_MAX_UPLOAD_BYTES) {
    throw new Error(`File is too large. Max ${ERP_MAX_UPLOAD_MB} MB per file.`);
  }

  const blob = withGuessedErpFileMime(file);
  const contentType = guessErpFileMime(blob);
  const key = crypto.randomUUID();
  const cleanName = safeStorageFileName(file.name);
  const path = `${projectId}/${userId}/${scope}/${key}_${cleanName}`;

  const { error } = await supabase.storage.from('erp-files').upload(path, blob, {
    upsert: false,
    contentType,
  });
  if (error) {
    throw new Error(error.message || 'Upload failed');
  }

  return {
    path,
    name: typeof file.name === 'string' ? file.name.slice(0, 200) : cleanName,
    mime: contentType,
  };
}
