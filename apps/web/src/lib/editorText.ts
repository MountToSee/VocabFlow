/**
 * Bridges MDXEditor's rendered DOM and the plain text we analyse. The analysis runs on
 * the visible text (no Markdown syntax), so offsets map 1:1 onto DOM text nodes, which
 * lets us draw highlights with the CSS Custom Highlight API without touching the
 * editor's internal state.
 */
export interface TextSegment {
  node: Text;
  start: number;
  end: number;
}

export interface EditorText {
  text: string;
  segments: TextSegment[];
}

const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th';
const BLOCK_SEPARATOR = '\n\n';

export function extractEditorText(root: HTMLElement): EditorText {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const segments: TextSegment[] = [];
  let text = '';
  let currentBlock: Element | null = null;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text;
    const value = textNode.data;
    if (!value) continue;
    const block = textNode.parentElement?.closest(BLOCK_SELECTOR) ?? null;
    if (text.length > 0 && block !== currentBlock) text += BLOCK_SEPARATOR;
    currentBlock = block;
    segments.push({ node: textNode, start: text.length, end: text.length + value.length });
    text += value;
  }
  return { text, segments };
}

export function rangeForOffsets(et: EditorText, start: number, end: number): Range | null {
  const startPos = locate(et, start, false);
  const endPos = locate(et, end, true);
  if (!startPos || !endPos) return null;
  const range = startPos.node.ownerDocument.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);
  return range;
}

/** Converts a DOM position (e.g. from a click or selection) into a plain-text offset. */
export function offsetForPosition(et: EditorText, node: Node, offset: number): number | null {
  const seg = et.segments.find((s) => s.node === node);
  if (seg) return seg.start + offset;
  // Position may be on an element; resolve to the first text node at/after it.
  const target = node.childNodes[offset] ?? node;
  const after = et.segments.find(
    (s) =>
      target === s.node ||
      target.contains(s.node) ||
      !!(target.compareDocumentPosition(s.node) & Node.DOCUMENT_POSITION_FOLLOWING),
  );
  return after ? after.start : null;
}

function locate(et: EditorText, offset: number, preferEnd: boolean) {
  for (const s of et.segments) {
    const inside = preferEnd
      ? offset > s.start && offset <= s.end
      : offset >= s.start && offset < s.end;
    if (inside) return { node: s.node, offset: offset - s.start };
  }
  const last = et.segments.at(-1);
  if (last && offset === last.end) return { node: last.node, offset: last.end - last.start };
  return null;
}

/**
 * Replaces the `occurrence`-th instance of `original` in Markdown source. Used as a
 * fallback when a DOM-level edit is not possible.
 */
export function replaceInMarkdown(
  markdown: string,
  original: string,
  replacement: string,
  occurrence: number,
): string | null {
  let idx = -1;
  for (let i = 0; i <= occurrence; i++) {
    idx = markdown.indexOf(original, idx + 1);
    if (idx === -1) return null;
  }
  return markdown.slice(0, idx) + replacement + markdown.slice(idx + original.length);
}

/** How many times `original` appears in `text` before `start`. */
export function occurrenceIndex(text: string, original: string, start: number): number {
  let count = 0;
  let idx = text.indexOf(original);
  while (idx !== -1 && idx < start) {
    count++;
    idx = text.indexOf(original, idx + 1);
  }
  return count;
}
