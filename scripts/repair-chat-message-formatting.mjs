/**
 * Repair legacy chat messages saved as one collapsed HTML paragraph.
 *
 * Usage:
 *   node scripts/repair-chat-message-formatting.mjs --dry-run
 *   node scripts/repair-chat-message-formatting.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i <= 0) continue;
  const k = line.slice(0, i).trim();
  let v = line.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[k] = v;
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function escapeHtmlText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plainTextToRichHtml(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized.trim()) return '';
  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n');
      const inner = lines.map((line) => escapeHtmlText(line)).join('<br>');
      return inner ? `<p>${inner}</p>` : '<p><br></p>';
    })
    .join('');
}

function decodeBasicEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractSimpleHtmlText(html) {
  return decodeBasicEntities(
    String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function repairCollapsedPlainText(text) {
  let t = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!t) return '';
  if (t.includes('\n')) return plainTextToRichHtml(t);

  if (/\s{3,}/.test(t)) {
    const parts = t.split(/\s{3,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return plainTextToRichHtml(parts.join('\n'));
    }
  }

  const byLabels = t.split(/\s+(?=[A-Z][A-Za-z0-9'’\-]*(?: [A-Z][A-Za-z0-9'’\-]*)*: )/);
  if (byLabels.length >= 2) {
    return plainTextToRichHtml(byLabels.map((p) => p.trim()).filter(Boolean).join('\n'));
  }
  if (t.length >= 280) {
    const sentences = t.split(/(?<=[.!?])\s+(?=[A-Z("(])/);
    if (sentences.length >= 3) {
      return plainTextToRichHtml(sentences.map((p) => p.trim()).filter(Boolean).join('\n'));
    }
  }
  return plainTextToRichHtml(t);
}

function looksLikeStoredHtml(raw) {
  const s = String(raw || '').trimStart();
  return /^<(p|div|span|br|ul|ol|li|h[1-6]|blockquote|pre|table|strong|em|a)\b/i.test(s);
}

function isCollapsedRawBody(body, format) {
  const raw = String(body || '');
  if (!raw.trim()) return false;
  const isHtml = String(format || '').toLowerCase() === 'html' || looksLikeStoredHtml(raw);
  if (!isHtml) return false;
  if (/<br\s*\/?>/i.test(raw)) return false;
  if (/<ul\b|<ol\b|<table\b|<blockquote\b|<pre\b|<h[1-6]\b/i.test(raw)) return false;
  const pCount = (raw.match(/<p\b/gi) || []).length;
  if (pCount > 1) return false;
  const plain = extractSimpleHtmlText(raw);
  if (!plain) return false;
  if (looksLikeStoredHtml(raw)) {
    if (/\n/.test(raw) && !/<br/i.test(raw)) return true;
    return plain.length >= 160;
  }
  // Legacy plain-text rows saved with body_format=html (no tags).
  if (String(format || '').toLowerCase() === 'html' && plain.length >= 120) return true;
  return false;
}

function maybeRepair(body, format) {
  if (!isCollapsedRawBody(body, format)) return null;
  const plain = extractSimpleHtmlText(body);
  const next = repairCollapsedPlainText(plain);
  if (!next || next === String(body || '')) return null;
  return { body: next, format: 'html' };
}

const TARGETS = [
  { table: 'erp_direct_messages', bodyCol: 'body', formatCol: 'body_format' },
  { table: 'erp_group_messages', bodyCol: 'body', formatCol: 'body_format' },
  { table: 'erp_messages', bodyCol: 'body', formatCol: 'body_format' },
];

const apply = process.argv.includes('--apply');
const dryRun = !apply || process.argv.includes('--dry-run');

let repaired = 0;
let skipped = 0;
let failed = 0;
const samples = [];

for (const t of TARGETS) {
  let from = 0;
  const pageSize = 500;
  while (true) {
    const { data, error } = await sb
      .from(t.table)
      .select(`id, ${t.bodyCol}, ${t.formatCol}`)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn(`skip ${t.table}:`, error.message);
      break;
    }
    if (!data?.length) break;

    for (const row of data) {
      const raw = row[t.bodyCol];
      if (!raw || !String(raw).trim()) {
        skipped += 1;
        continue;
      }
      const fix = maybeRepair(raw, row[t.formatCol] || 'markdown');
      if (!fix) {
        skipped += 1;
        continue;
      }
      if (samples.length < 8) {
        samples.push({
          table: t.table,
          id: row.id,
          before: String(raw).slice(0, 140),
          after: fix.body.slice(0, 140),
        });
      }
      if (apply && !dryRun) {
        const { error: upErr } = await sb
          .from(t.table)
          .update({ [t.bodyCol]: fix.body, [t.formatCol]: fix.format })
          .eq('id', row.id);
        if (upErr) {
          failed += 1;
          console.warn(`fail ${t.table}/${row.id}:`, upErr.message);
          continue;
        }
      }
      repaired += 1;
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }
}

console.log(JSON.stringify({ dryRun: dryRun || !apply, repaired, skipped, failed, samples }, null, 2));
