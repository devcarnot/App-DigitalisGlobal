# Rich text editor PR notes

## Scope 4 delivered

- Shared TipTap stack: `RichTextEditor`, `RichTextViewer`, `sanitize-rich-html.js`, `rich-text-format.js`
- Storage: sanitised HTML + `*_format` columns (migration `20260811160000_rich_text_format_columns.sql`)
- Legacy markdown rows render until edited or backfilled

## Before deploy

1. Run Supabase migrations (icebox + rich text format columns)
2. Optional backfill: `node scripts/backfill-rich-text-html.mjs --dry-run` then `--apply`

## Acceptance checklist (manual in browser)

| # | Check | Code/build status |
|---|--------|-------------------|
| 1 | Toolbar on all converted surfaces | Implemented |
| 2 | Word paste into task comments survives reload | Requires manual paste test |
| 3 | Google Docs / Gmail / web paste | Requires manual paste test |
| 4 | Excel/Sheets table paste | Requires manual paste test |
| 5 | Mod+Shift+V plain text | Implemented in RichTextEditor |
| 6 | Context menu paste as plain text | Implemented |
| 7 | Formatting kept chip | Implemented |
| 8 | Legacy markdown round-trip | Lazy convert on open; verify manually |
| 9 | XSS paste blocked in DB | Server `sanitizeRichBodyForPersist`; verify in DB |
| 10 | API bypass sanitised | Message + announcement routes |
| 11 | Announcement email HTML + text | `buildErpAnnouncementEmailContent` updated |
| 12 | Keyboard toolbar + 375px | Requires manual UI test |
| 13 | No typographic dashes in repo | 613 fixes; `npm run lint` guards |
| 14 | Lint fails on reintroduced dash | Verified during sweep |

## Em dash sweep

- **613** fixes across **202** files
- Exclusions: `scripts/dash-sweep-exclusions.txt`

## Removed legacy

- `MarkdownWysiwygEditor.jsx`
- `erp-chat-markdown-sync.js`
- `erp-wysiwyg-selection.js`
