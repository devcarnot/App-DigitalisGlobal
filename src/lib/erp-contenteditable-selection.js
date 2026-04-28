/** Plain-text caret offset within a root (contenteditable). */

export function erpCaretOffsetInInnerText(root) {
  const el = /** @type {HTMLElement | null} */ (root);
  if (!el) return { text: '', offset: 0 };
  const txt = String(el.innerText || '');
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  if (!sel?.rangeCount || !el.contains(sel.anchorNode)) return { text: txt, offset: txt.length };

  try {
    const range = sel.getRangeAt(0);
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    const offset = pre.toString().length;
    return { text: txt, offset: Math.min(offset, txt.length) };
  } catch {
    return { text: txt, offset: txt.length };
  }
}

/**
 * Maps [start, end) offsets in innerText to a DOM Range (SHOW_TEXT order).
 * @returns {Range | null}
 */
export function erpInnerTextOffsetsToRange(root, start, end) {
  if (!(root instanceof HTMLElement)) return null;

  const range = document.createRange();
  let nodeStartAbs = 0;
  /** @type {Text | null} */
  let startNode = null;
  let startOff = 0;
  /** @type {Text | null} */
  let endNode = null;
  let endOff = 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  /** @type {Node | null} */
  let n;
  while ((n = walker.nextNode())) {
    const t = /** @type {Text} */ (n);
    const len = String(t.nodeValue || '').length;
    const nodeEndAbs = nodeStartAbs + len;

    if (!startNode && start < nodeEndAbs) {
      startNode = t;
      startOff = start - nodeStartAbs;
    }
    if (startNode && end <= nodeEndAbs) {
      endNode = t;
      endOff = end - nodeStartAbs;
      break;
    }

    nodeStartAbs = nodeEndAbs;
  }

  try {
    if (startNode && endNode) {
      range.setStart(startNode, startOff);
      range.setEnd(endNode, endOff);
      return range;
    }
  } catch {
    /* ignore */
  }

  return null;
}

/** Replaces plain-text slice [start, end) with insertion (e.g. @mention pick). */
export function erpReplaceInnerTextSlice(root, start, end, insertion) {
  const range = erpInnerTextOffsetsToRange(root, start, end);
  if (!range) return false;
  range.deleteContents();
  const textNode = document.createTextNode(String(insertion ?? ''));
  range.insertNode(textNode);

  const caret = document.createRange();
  caret.setStart(textNode, textNode.length);
  caret.collapse(true);
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(caret);
  }
  /** @type {HTMLElement} */ (root).focus();
  return true;
}
