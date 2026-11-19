export interface Span {
  text: string;
  start: number;
  end: number;
}

const WORD_RE = /[A-Za-z][A-Za-z'-]*[A-Za-z]|[A-Za-z]/g;

export function tokenizeWords(text: string): Span[] {
  const spans: Span[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    spans.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

/** Splits text into paragraphs (separated by blank lines) while keeping absolute offsets. */
export function splitParagraphs(text: string): Span[] {
  const spans: Span[] = [];
  const re = /[^\n]+(?:\n(?!\s*\n)[^\n]*)*/g;
  for (const m of text.matchAll(re)) {
    if (m[0].trim().length === 0) continue;
    spans.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

/** Returns the sentence that contains `offset`, used as lookup context and study material. */
export function sentenceAt(text: string, offset: number): string {
  const boundary = /[.!?\n]/;
  let start = offset;
  while (start > 0 && !boundary.test(text[start - 1] ?? '')) start--;
  let end = offset;
  while (end < text.length && !boundary.test(text[end] ?? '')) end++;
  if (end < text.length && text[end] !== '\n') end++;
  return text.slice(start, end).trim();
}

/** Returns the word touching `offset`, if any. */
export function wordAt(text: string, offset: number): Span | null {
  for (const span of tokenizeWords(text)) {
    if (offset >= span.start && offset <= span.end) return span;
  }
  return null;
}

/** Small, fast, non-cryptographic hash (FNV-1a) for cache keys. */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
