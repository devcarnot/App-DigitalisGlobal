#!/usr/bin/env node
/**
 * One-off typographic dash sweep (U+2012–U+2015).
 * Run: node scripts/fix-typographic-dashes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DASHES = /[\u2012\u2013\u2014\u2015]/g;
const EN_DASH = '\u2013';
const EM_DASH = '\u2014';

const TARGETS = [
  'src',
  'supabase/migrations',
  'scripts',
  'README.md',
  'public',
  'desktop',
].map((p) => path.join(ROOT, p));

const SKIP_DIRS = new Set(['node_modules', '.next']);

/** Files/lines with intentional unicode dash in regex (see dash-sweep-exclusions.txt). */
const REGEX_ESCAPE_FILES = new Set([
  path.join(ROOT, 'src/lib/erp-activity-feed.js'),
]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const st = fs.statSync(dir);
  if (st.isFile()) {
    out.push(dir);
    return out;
  }
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    if (name === 'package-lock.json') continue;
    if (name === 'fix-typographic-dashes.mjs') continue;
    walk(path.join(dir, name), out);
  }
  return out;
}

function fixEnDashRanges(text) {
  // Letter ranges: A–Z, Z–A
  text = text.replace(/([A-Za-z])–([A-Za-z])/g, '$1 to $2');
  // Numeric / time ranges: 1–12, 00:00–24:00, 5:00–11:59
  text = text.replace(/(\d(?::\d{2})?)–(\d(?::\d{2})?)/g, '$1 to $2');
  // RFC-style en dash in compound words (e.g. RFC 4180–style) — use " to "
  text = text.replace(/(\d+)–style/g, '$1-style'); // keep hyphenated suffix
  return text;
}

function fixEmDashProse(text) {
  // No-space em dash between words (marketing copy)
  text = text.replace(/(\w)—(\w)/g, (m, a, b) => {
    if (/[.!?]$/.test(a) || /^[A-Z]/.test(b)) return `${a}. ${b}`;
    return `${a}: ${b}`;
  });

  // " — " in prose: prefer colon before explanation, else comma
  text = text.replace(/ — /g, (match, offset, full) => {
    const after = full.slice(offset + match.length, offset + match.length + 40);
    const before = full.slice(Math.max(0, offset - 40), offset);
    // Decorative email separators
    if (/^Project brief —/.test(after) || before.endsWith("'—") || before.endsWith('"—')) {
      return ', ';
    }
    // Between clauses with capital letter after
    if (/^[A-Z"'(]/.test(after.trim())) {
      // List/explanation after lowercase verb phrase → colon
      if (/^(you |it |the |a |an |see |e\.g\.|for |when |if |only |not |must |should |can |will |does |do )/i.test(after)) {
        return ': ';
      }
      return '. ';
    }
    // Lowercase continuation often explanation
    if (/^[a-z(]/.test(after.trim())) return ': ';
    return ', ';
  });

  // Leading/trailing decorative em dashes in strings like '— Pick a project —'
  text = text.replace(/^— /gm, '');
  text = text.replace(/ —$/gm, '');

  return text;
}

function fixPlaceholders(text) {
  text = text.replace(/'—'/g, "'n/a'");
  text = text.replace(/"—"/g, '"n/a"');
  text = text.replace(/`—`/g, '`n/a`');
  // JSX text nodes
  text = text.replace(/>\s*—\s*</g, '>n/a<');
  text = text.replace(/>\s*–\s*</g, '>n/a<');
  return text;
}

function fixHorizontalBarIcon(text, filePath) {
  if (filePath.endsWith('ErpChatComposer.jsx')) {
    text = text.replace(/\u2015/g, '-');
  }
  return text;
}

function fixActivityFeedRegex(text, filePath) {
  if (REGEX_ESCAPE_FILES.has(filePath)) {
    text = text.replace(/\/\\s—\\s\//g, '/\\s\\u2014\\s/');
    // Comment describing user format — keep readable
    text = text.replace(
      '// Group DMs use: "<Group> — <Sender>"',
      '// Group DMs use: "<Group> \\u2014 <Sender>" (unicode em dash in stored titles)',
    );
  }
  return text;
}

function processFile(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');
  if (!DASHES.test(text)) return 0;
  DASHES.lastIndex = 0;

  const original = text;
  text = fixPlaceholders(text);
  text = fixEnDashRanges(text);
  text = fixEmDashProse(text);
  text = fixHorizontalBarIcon(text, filePath);
  text = fixActivityFeedRegex(text, filePath);

  // Decorative lone em dashes on their own line in email templates
  text = text.replace(/^(\s*)'—',?\s*$/gm, "$1'',");

  if (text !== original) {
    fs.writeFileSync(filePath, text, 'utf8');
    const count = (original.match(DASHES) || []).length;
    return count;
  }
  return 0;
}

const files = TARGETS.flatMap((t) => walk(t));
let totalFixes = 0;
let filesChanged = 0;

for (const f of files) {
  const n = processFile(f);
  if (n > 0) {
    totalFixes += n;
    filesChanged += 1;
    console.log(`${path.relative(ROOT, f)}: ${n}`);
  }
}

console.log(`\nDone: ${totalFixes} dash occurrences in ${filesChanged} files.`);
