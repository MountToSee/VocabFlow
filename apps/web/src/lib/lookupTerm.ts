import { sentenceAt, wordAt } from '@vocabflow/shared';
import { extractEditorText, offsetForPosition, rangeForOffsets } from './editorText';

const MAX_WORDS = 4;
const MAX_CHARS = 64;

/**
 * Turns a raw selection into something worth looking up: a word or short phrase
 * (e.g. "serendipity", "take for granted"). Returns null for sentences, numbers, code, etc.
 */
export function normalizeLookupTerm(raw: string): string | null {
  const term = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  if (!term || term.length > MAX_CHARS) return null;
  if (!/^\p{L}[\p{L}\p{M}'’ -]*$/u.test(term)) return null;
  if (term.split(' ').length > MAX_WORDS) return null;
  return term;
}

export interface LookupAnchor {
  x: number;
  y: number;
}

export interface LookupHit {
  word: string;
  context: string;
  anchor: LookupAnchor;
}

const anchorFor = (rect: DOMRect): LookupAnchor => ({
  x: rect.left + rect.width / 2,
  y: rect.bottom,
});

/** The current non-empty selection inside `root`, if it is a lookup-able word or phrase. */
export function selectionLookup(root: HTMLElement): LookupHit | null {
  const sel = root.ownerDocument.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const word = normalizeLookupTerm(sel.toString());
  if (!word) return null;
  const et = extractEditorText(root);
  const offset = offsetForPosition(et, range.startContainer, range.startOffset);
  return {
    word,
    context: offset === null ? word : sentenceAt(et.text, offset),
    anchor: anchorFor(range.getBoundingClientRect()),
  };
}

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

function caretFromPoint(doc: Document, x: number, y: number) {
  const d = doc as CaretDocument;
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    return p && { node: p.offsetNode, offset: p.offset };
  }
  const r = d.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}

/** The word under the pointer (only if the pointer is actually over its glyphs). */
export function wordAtPoint(root: HTMLElement, x: number, y: number): LookupHit | null {
  const pos = caretFromPoint(root.ownerDocument, x, y);
  if (!pos || !root.contains(pos.node)) return null;
  const et = extractEditorText(root);
  const offset = offsetForPosition(et, pos.node, pos.offset);
  if (offset === null) return null;
  const span = wordAt(et.text, offset);
  if (!span) return null;
  const range = rangeForOffsets(et, span.start, span.end);
  const rect = range
    ? [...range.getClientRects()].find(
        (r) => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1,
      )
    : undefined;
  const word = normalizeLookupTerm(span.text);
  if (!rect || !word) return null;
  return { word, context: sentenceAt(et.text, span.start), anchor: anchorFor(rect) };
}
