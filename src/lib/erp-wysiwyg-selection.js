/** Block-ish nodes we may turn into headings or split around a partial selection. */
const WYSIWYG_BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'BLOCKQUOTE',
  'PRE',
  'LI',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);

function headingLevelFromTag(tagName) {
  const m = /^H([1-6])$/i.exec(String(tagName || ''));
  return m ? Number(m[1]) : null;
}

export function getWysiwygBlock(node, root) {
  if (!root || !node) return null;
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== root) {
    if (WYSIWYG_BLOCK_TAGS.has(el.tagName)) return el;
    el = el.parentElement;
  }
  return null;
}

/** Nearest H1–H6 (block or inline) for toggle + active state. */
function getHeadingElement(node, root) {
  if (!root || !node) return null;
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== root) {
    if (headingLevelFromTag(el.tagName)) return el;
    el = el.parentElement;
  }
  return null;
}

/** True when the range covers the entire contents of `block`. */
export function rangeCoversBlockContents(range, block) {
  if (!block || !range) return false;
  const nr = document.createRange();
  nr.selectNodeContents(block);
  const startCmp = range.compareBoundaryPoints(Range.START_TO_START, nr);
  const endCmp = range.compareBoundaryPoints(Range.END_TO_END, nr);
  return startCmp <= 0 && endCmp >= 0;
}

export function replaceElementKeepingChildren(oldEl, newTag) {
  const next = document.createElement(newTag);
  while (oldEl.firstChild) next.appendChild(oldEl.firstChild);
  oldEl.parentNode?.replaceChild(next, oldEl);
  return next;
}

function convertBlockTag(block, tagName) {
  if (!block) return null;
  if (String(block.tagName).toLowerCase() === String(tagName).toLowerCase()) return block;
  return replaceElementKeepingChildren(block, tagName);
}

function placeCaretAtEnd(el, sel) {
  if (!el || !sel) return;
  sel.removeAllRanges();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  sel.addRange(r);
}

function placeCaretAtStart(el, sel) {
  if (!el || !sel) return;
  sel.removeAllRanges();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(true);
  sel.addRange(r);
}

function isCaretAtBlockStart(range, block) {
  const br = document.createRange();
  br.selectNodeContents(block);
  br.collapse(true);
  return range.compareBoundaryPoints(Range.START_TO_START, br) === 0;
}

function isCaretAtBlockEnd(range, block) {
  const br = document.createRange();
  br.selectNodeContents(block);
  br.collapse(false);
  return range.compareBoundaryPoints(Range.END_TO_END, br) === 0;
}

function stripEdgeBreaks(el) {
  if (!el) return;
  while (el.firstChild?.nodeName === 'BR') el.removeChild(el.firstChild);
  while (el.lastChild?.nodeName === 'BR') el.removeChild(el.lastChild);
}

/** Split heading at caret — before stays heading, after becomes `tailTag` (usually p). */
function splitHeadingBlockAtCaret(headingEl, range, sel, tailTag = 'p') {
  const tail = range.cloneRange();
  if (headingEl.lastChild) tail.setEndAfter(headingEl.lastChild);
  else tail.setEnd(headingEl, 0);
  const tailFrag = document.createDocumentFragment();
  tailFrag.appendChild(tail.extractContents());
  stripEdgeBreaks(headingEl);
  ensureBlockHasContent(headingEl);
  stripEdgeBreaks(tailFrag);
  const tailEl = document.createElement(tailTag);
  tailEl.appendChild(tailFrag);
  ensureBlockHasContent(tailEl);
  headingEl.parentNode?.insertBefore(tailEl, headingEl.nextSibling);
  placeCaretAtStart(tailEl, sel);
  return tailEl;
}

function getLineBoundsInHeading(headingEl, range) {
  const lineStart = document.createRange();
  lineStart.selectNodeContents(headingEl);
  lineStart.collapse(true);

  const lineEnd = document.createRange();
  lineEnd.selectNodeContents(headingEl);
  lineEnd.collapse(false);

  for (const br of headingEl.querySelectorAll('br')) {
    const afterBr = document.createRange();
    afterBr.setStartAfter(br);
    afterBr.collapse(true);
    if (range.compareBoundaryPoints(Range.START_TO_START, afterBr) >= 0) {
      lineStart.setStartAfter(br);
      lineStart.collapse(true);
    }

    const beforeBr = document.createRange();
    beforeBr.setStartBefore(br);
    beforeBr.collapse(false);
    if (range.compareBoundaryPoints(Range.START_TO_START, beforeBr) <= 0) {
      lineEnd.setEndBefore(br);
      lineEnd.collapse(false);
      break;
    }
  }

  return { lineStart, lineEnd };
}

/** Demote only the visual line containing the caret (when heading has soft breaks). */
function demoteHeadingLineAtCaret(headingEl, range, sel) {
  const { lineStart, lineEnd } = getLineBoundsInHeading(headingEl, range);
  const demoteRange = document.createRange();
  demoteRange.setStart(lineStart.startContainer, lineStart.startOffset);
  demoteRange.setEnd(lineEnd.endContainer, lineEnd.endOffset);

  const lineFrag = document.createDocumentFragment();
  lineFrag.appendChild(demoteRange.extractContents());
  stripEdgeBreaks(headingEl);
  stripEdgeBreaks(lineFrag);

  const p = document.createElement('p');
  p.appendChild(lineFrag);
  ensureBlockHasContent(p);

  const parent = headingEl.parentNode;
  if (!String(headingEl.textContent || '').replace(/\u200b/g, '').length) {
    parent?.replaceChild(p, headingEl);
  } else {
    ensureBlockHasContent(headingEl);
    parent?.insertBefore(p, headingEl.nextSibling);
  }
  placeCaretAtEnd(p, sel);
  return p;
}

function shouldSplitHeadingOnDemote(headingEl, range) {
  const hasBefore = !isCaretAtBlockStart(range, headingEl);
  const hasAfter = !isCaretAtBlockEnd(range, headingEl);
  return hasBefore && hasAfter;
}

function ensureBlockHasContent(block) {
  if (!block) return;
  if (!String(block.textContent || '').replace(/\u200b/g, '').length && !block.querySelector('br')) {
    block.appendChild(document.createElement('br'));
  }
}

/** Unwrap inline H inside P/DIV — fixes invalid nested markup from older logic. */
function unwrapInlineHeading(headingEl) {
  const parent = headingEl?.parentNode;
  if (!parent) return headingEl;
  const frag = document.createDocumentFragment();
  while (headingEl.firstChild) frag.appendChild(headingEl.firstChild);
  parent.insertBefore(frag, headingEl);
  parent.removeChild(headingEl);
  return parent;
}

function demoteHeadingToParagraph(headingEl, sel, root) {
  if (!headingEl) return null;
  const block = getWysiwygBlock(headingEl, root);
  const isBlockLevel = block === headingEl;

  if (isBlockLevel) {
    const range = sel.getRangeAt(0);
    if (headingEl.querySelector('br')) {
      return demoteHeadingLineAtCaret(headingEl, range, sel);
    }
    if (shouldSplitHeadingOnDemote(headingEl, range)) {
      return splitHeadingBlockAtCaret(headingEl, range, sel, 'p');
    }
    const p = convertBlockTag(headingEl, 'p');
    ensureBlockHasContent(p);
    placeCaretAtEnd(p, sel);
    return p;
  }

  unwrapInlineHeading(headingEl);
  const host = getWysiwygBlock(sel?.anchorNode, root);
  if (host) placeCaretAtEnd(host, sel);
  return host;
}

function splitBlockAtCaretForHeading(block, range, tag, sel) {
  const h = document.createElement(tag);
  const tail = range.cloneRange();
  if (block.lastChild) tail.setEndAfter(block.lastChild);
  else tail.setEnd(block, 0);
  const tailFrag = tail.extractContents();
  if (String(tailFrag.textContent || '').replace(/\u200b/g, '').length) {
    h.appendChild(tailFrag);
  } else {
    h.appendChild(document.createElement('br'));
  }
  ensureBlockHasContent(block);
  block.parentNode?.insertBefore(h, block.nextSibling);
  placeCaretAtStart(h, sel);
  return h;
}

/** Split block so only the selected range becomes a heading block. */
function promoteSelectionToHeadingBlock(block, range, tag, sel) {
  if (!block?.parentNode) return null;

  const parent = block.parentNode;
  const wrapTag = block.tagName === 'P' || block.tagName === 'DIV' ? 'p' : 'div';

  const beforeRange = document.createRange();
  beforeRange.selectNodeContents(block);
  beforeRange.setEnd(range.startContainer, range.startOffset);

  const afterRange = document.createRange();
  afterRange.selectNodeContents(block);
  afterRange.setStart(range.endContainer, range.endOffset);

  const beforeFrag = beforeRange.cloneContents();
  const selectedFrag = range.cloneRange().cloneContents();
  const afterFrag = afterRange.cloneContents();

  const h = document.createElement(tag);
  h.appendChild(selectedFrag);
  ensureBlockHasContent(h);

  const parts = [];
  if (String(beforeFrag.textContent || '').replace(/\u200b/g, '').length) {
    const beforeEl = document.createElement(wrapTag);
    beforeEl.appendChild(beforeFrag);
    ensureBlockHasContent(beforeEl);
    parts.push(beforeEl);
  }
  parts.push(h);
  if (String(afterFrag.textContent || '').replace(/\u200b/g, '').length) {
    const afterEl = document.createElement(wrapTag);
    afterEl.appendChild(afterFrag);
    ensureBlockHasContent(afterEl);
    parts.push(afterEl);
  }

  for (const part of parts) parent.insertBefore(part, block);
  parent.removeChild(block);
  placeCaretAtEnd(h, sel);
  return h;
}

/**
 * Apply H1–H6. Same level again toggles off (back to paragraph).
 * Partial selection becomes its own heading block (not inline H inside P).
 */
export function applyHeadingToSelection(root, level) {
  if (!root) return;
  const n = Math.min(6, Math.max(1, Math.floor(Number(level) || 1)));
  const tag = `h${n}`;
  const sel = window.getSelection?.();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;

  const headingEl = getHeadingElement(range.commonAncestorContainer, root);
  const currentLevel = headingEl ? headingLevelFromTag(headingEl.tagName) : null;
  const block = getWysiwygBlock(range.commonAncestorContainer, root);

  const toggleOff =
    currentLevel === n &&
    (range.collapsed ||
      (headingEl && rangeCoversBlockContents(range, headingEl)) ||
      (block && headingEl === block && rangeCoversBlockContents(range, block)));

  if (toggleOff && headingEl) {
    demoteHeadingToParagraph(headingEl, sel, root);
    return;
  }

  if (!block) {
    const h = document.createElement(tag);
    h.appendChild(document.createElement('br'));
    root.appendChild(h);
    placeCaretAtStart(h, sel);
    return;
  }

  if (block.tagName === 'LI') {
    if (range.collapsed || rangeCoversBlockContents(range, block)) {
      const next = convertBlockTag(block, tag);
      placeCaretAtEnd(next, sel);
    } else {
      promoteSelectionToHeadingBlock(block, range, tag, sel);
    }
    return;
  }

  const blockLevel = headingLevelFromTag(block.tagName);

  if (range.collapsed) {
    if (blockLevel) {
      if (blockLevel === n) {
        demoteHeadingToParagraph(block, sel, root);
      } else {
        const next = convertBlockTag(block, tag);
        placeCaretAtEnd(next, sel);
      }
      return;
    }
    if (isCaretAtBlockStart(range, block)) {
      const next = convertBlockTag(block, tag);
      placeCaretAtEnd(next, sel);
      return;
    }
    splitBlockAtCaretForHeading(block, range, tag, sel);
    return;
  }

  if (rangeCoversBlockContents(range, block)) {
    const next = convertBlockTag(block, tag);
    placeCaretAtEnd(next, sel);
    return;
  }

  promoteSelectionToHeadingBlock(block, range, tag, sel);
}

/** Turn current heading/block back into a normal paragraph. */
export function applyParagraphToSelection(root) {
  if (!root) return;
  const sel = window.getSelection?.();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;

  const headingEl = getHeadingElement(range.commonAncestorContainer, root);
  if (headingEl) {
    demoteHeadingToParagraph(headingEl, sel, root);
    return;
  }

  const block = getWysiwygBlock(range.commonAncestorContainer, root);
  if (block && block.tagName !== 'LI') {
    const p = convertBlockTag(block, 'p');
    placeCaretAtEnd(p, sel);
  }
}

export function readComposerFormatState(root) {
  const empty = {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    heading: null,
    blockquote: false,
    bulletList: false,
    orderedList: false,
    inlineCode: false,
  };
  if (!root || typeof document === 'undefined') return empty;

  try {
    const sel = window.getSelection?.();
    if (!sel?.rangeCount || !sel.anchorNode || !root.contains(sel.anchorNode)) return empty;

    const block = getWysiwygBlock(sel.anchorNode, root);
    const headingEl = getHeadingElement(sel.anchorNode, root);
    const heading = headingEl ? headingLevelFromTag(headingEl.tagName) : null;

    const inTag = (name) => {
      let el = sel.anchorNode?.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : sel.anchorNode;
      while (el && el !== root) {
        if (el.tagName === name) return true;
        el = el.parentElement;
      }
      return false;
    };

    const query = (cmd) => {
      try {
        return document.queryCommandState?.(cmd) ?? false;
      } catch {
        return false;
      }
    };

    return {
      bold: query('bold'),
      italic: query('italic'),
      underline: query('underline'),
      strike: query('strikeThrough'),
      heading,
      blockquote: block?.tagName === 'BLOCKQUOTE' || inTag('BLOCKQUOTE'),
      bulletList: query('insertUnorderedList'),
      orderedList: query('insertOrderedList'),
      inlineCode: inTag('CODE') && !inTag('PRE'),
    };
  } catch {
    return empty;
  }
}

export { headingLevelFromTag };

/** Shift+Enter inside H1–H6 → new normal paragraph; keeps previous line as heading. */
export function handleShiftEnterInHeading(root) {
  if (!root) return false;
  const sel = window.getSelection?.();
  if (!sel?.rangeCount) return false;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return false;
  const block = getWysiwygBlock(range.commonAncestorContainer, root);
  if (!block || !headingLevelFromTag(block.tagName)) return false;
  splitHeadingBlockAtCaret(block, range, sel, 'p');
  return true;
}
