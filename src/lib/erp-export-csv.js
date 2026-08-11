/**
 * Build RFC 4180-style CSV (CRLF rows) for spreadsheet apps. UTF-8 BOM prefix for Excel.
 */

export function escapeCsvField(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[\r\n",]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** @param {{ header: string, value: (row: unknown) => unknown }[]} columns */
export function buildCsvFromRows(columns, rows) {
  const safeCols = columns || [];
  const header = safeCols.map((c) => escapeCsvField(c.header)).join(',');
  const body = (rows || []).map((row) =>
    safeCols.map((c) => escapeCsvField(typeof c.value === 'function' ? c.value(row) : '')).join(','),
  );
  return [header, ...body].join('\r\n');
}

export function triggerCsvDownload(filename, csvContent) {
  const name = String(filename || 'export').toLowerCase().endsWith('.csv') ? filename : `${filename || 'export'}.csv`;
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function erpCsvSafeFilename(name) {
  const s = String(name || 'export')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return s || 'export';
}

/** @param {{ title: string, columns: { header: string, value: (row: unknown) => unknown }[], rows: unknown[] }[]} sections */
export function buildMultiSectionCsv(sections) {
  const parts = [];
  for (const section of sections || []) {
    if (!section?.rows?.length || !section?.columns?.length) continue;
    parts.push(escapeCsvField(section.title));
    parts.push(buildCsvFromRows(section.columns, section.rows));
    parts.push('');
  }
  return parts.join('\r\n').trim();
}
