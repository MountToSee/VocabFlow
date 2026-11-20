import type { RewriteSuggestion } from '@vocabflow/shared';

const SEPARATOR = '\n\n';

/** The block (paragraph, heading, list item…) of the extracted editor text containing `offset`. */
export function paragraphAt(text: string, offset: number): { start: number; text: string } | null {
  const before = text.lastIndexOf(SEPARATOR, Math.max(0, offset - 1));
  const start = before === -1 ? 0 : before + SEPARATOR.length;
  const after = text.indexOf(SEPARATOR, offset);
  const end = after === -1 ? text.length : after;
  const paragraph = text.slice(start, end);
  return paragraph.trim() ? { start, text: paragraph } : null;
}

/**
 * After `applied` was replaced in the paragraph, drops it (and anything overlapping it) and
 * shifts later suggestions so their offsets still match the edited paragraph.
 */
export function afterApplying(
  suggestions: RewriteSuggestion[],
  applied: RewriteSuggestion,
): RewriteSuggestion[] {
  const delta = applied.replacement.length - (applied.end - applied.start);
  return suggestions
    .filter((s) => s !== applied && (s.end <= applied.start || s.start >= applied.end))
    .map((s) =>
      s.start >= applied.end ? { ...s, start: s.start + delta, end: s.end + delta } : s,
    );
}

export type DiffPart = { text: string; change?: RewriteSuggestion };

/** Splits the original paragraph into unchanged text and suggestion spans for rendering. */
export function diffParts(paragraph: string, suggestions: RewriteSuggestion[]): DiffPart[] {
  const parts: DiffPart[] = [];
  let cursor = 0;
  for (const s of [...suggestions].sort((a, b) => a.start - b.start)) {
    if (s.start < cursor) continue;
    if (s.start > cursor) parts.push({ text: paragraph.slice(cursor, s.start) });
    parts.push({ text: paragraph.slice(s.start, s.end), change: s });
    cursor = s.end;
  }
  if (cursor < paragraph.length) parts.push({ text: paragraph.slice(cursor) });
  return parts;
}
