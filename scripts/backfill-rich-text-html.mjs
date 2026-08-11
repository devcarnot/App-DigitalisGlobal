/**
 * Backfill markdown rich text rows to sanitised HTML.
 *
 * Usage:
 *   node scripts/backfill-rich-text-html.mjs --dry-run
 *   node scripts/backfill-rich-text-html.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { marked } from 'marked';
import { sanitizeRichHtml } from '../src/lib/rich-text/sanitize-rich-html.js';

marked.setOptions({ breaks: true, gfm: true });

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

const TARGETS = [
  { table: 'erp_notes', bodyCol: 'body', formatCol: 'body_format' },
  { table: 'erp_projects', bodyCol: 'description', formatCol: 'description_format' },
  { table: 'erp_tasks', bodyCol: 'description', formatCol: 'description_format' },
  { table: 'erp_task_comments', bodyCol: 'body', formatCol: 'body_format' },
  { table: 'erp_messages', bodyCol: 'body', formatCol: 'body_format' },
  { table: 'erp_direct_messages', bodyCol: 'body', formatCol: 'body_format' },
  { table: 'erp_group_messages', bodyCol: 'body', formatCol: 'body_format' },
  { table: 'erp_announcements', bodyCol: 'body', formatCol: 'body_format' },
  { table: 'erp_meetings', bodyCol: 'description', formatCol: 'description_format' },
  { table: 'erp_reminders', bodyCol: 'body', formatCol: 'body_format' },
  { table: 'blog_posts', bodyCol: 'content', formatCol: 'content_format' },
];

const apply = process.argv.includes('--apply');
const dryRun = !apply || process.argv.includes('--dry-run');

function mdToHtml(md) {
  if (!md || !String(md).trim()) return '';
  if (String(md).trimStart().startsWith('<')) return sanitizeRichHtml(md);
  return sanitizeRichHtml(marked.parse(String(md)));
}

let converted = 0;
let skipped = 0;
let failed = 0;
const samples = [];

for (const t of TARGETS) {
  const { data, error } = await sb.from(t.table).select(`id, ${t.bodyCol}, ${t.formatCol}`).eq(t.formatCol, 'markdown').limit(5000);
  if (error) {
    console.warn(`skip ${t.table}:`, error.message);
    continue;
  }
  for (const row of data || []) {
    const raw = row[t.bodyCol];
    if (!raw || !String(raw).trim()) {
      skipped += 1;
      continue;
    }
    try {
      const html = mdToHtml(raw);
      if (samples.length < 5) {
        samples.push({ table: t.table, id: row.id, before: String(raw).slice(0, 120), after: html.slice(0, 120) });
      }
      if (apply && !dryRun) {
        const { error: upErr } = await sb
          .from(t.table)
          .update({ [t.bodyCol]: html, [t.formatCol]: 'html' })
          .eq('id', row.id);
        if (upErr) {
          failed += 1;
          console.warn(`fail ${t.table}/${row.id}:`, upErr.message);
          continue;
        }
      }
      converted += 1;
    } catch (e) {
      failed += 1;
      console.warn(`fail ${t.table}/${row.id}:`, e?.message || e);
    }
  }
}

console.log(JSON.stringify({ mode: apply && !dryRun ? 'apply' : 'dry-run', converted, skipped, failed, samples }, null, 2));
