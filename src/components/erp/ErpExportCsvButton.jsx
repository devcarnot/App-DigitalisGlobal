'use client';

import { buildCsvFromRows, triggerCsvDownload } from '../../lib/erp-export-csv';

const defaultClass =
  'inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-[#103D4D] shadow-sm transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40';

/**
 * @param {object} props
 * @param {string} props.filename — without or with `.csv`
 * @param {{ header: string, value: (row: unknown) => unknown }[]} props.columns
 * @param {unknown[]} props.rows
 * @param {string} [props.label]
 * @param {string} [props.className]
 * @param {boolean} [props.disabled]
 */
export default function ErpExportCsvButton({ filename, columns, rows, label = 'Export CSV', className = '', disabled }) {
  const can = Array.isArray(rows) && rows.length > 0 && Array.isArray(columns) && columns.length > 0;
  return (
    <button
      type="button"
      disabled={disabled || !can}
      className={`${defaultClass} ${className}`.trim()}
      onClick={() => triggerCsvDownload(filename, buildCsvFromRows(columns, rows))}
    >
      {label}
    </button>
  );
}
