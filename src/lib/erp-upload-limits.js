/** Max size for a single ERP file or image upload (client + server). */
export const ERP_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ERP_MAX_UPLOAD_MB = Math.round(ERP_MAX_UPLOAD_BYTES / (1024 * 1024));
