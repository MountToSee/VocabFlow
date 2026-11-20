import type { RewriteSuggestion } from '@vocabflow/shared';
import { describe, expect, it } from 'vitest';
import { afterApplying, diffParts, paragraphAt } from '../src/lib/rewrite';

const s = (start: number, original: string, replacement: string): RewriteSuggestion => ({
  start,
  end: start + original.length,
  original,
  replacement,
  kind: 'phrasing',
  explanation: '',
});

describe('paragraphAt', () => {
  const text = 'Title\n\nFirst para here.\n\nSecond one.';
  it('returns the block around the offset', () => {
    expect(paragraphAt(text, 0)).toEqual({ start: 0, text: 'Title' });
    expect(paragraphAt(text, 10)).toEqual({ start: 7, text: 'First para here.' });
    expect(paragraphAt(text, 7)).toEqual({ start: 7, text: 'First para here.' });
    expect(paragraphAt(text, text.length)).toEqual({ start: 25, text: 'Second one.' });
  });
  it('treats the end of a block as part of it and ignores empty text', () => {
    expect(paragraphAt(text, 23)).toEqual({ start: 7, text: 'First para here.' });
    expect(paragraphAt('', 0)).toBeNull();
  });
});

describe('afterApplying', () => {
  it('shifts later suggestions by the length change and drops overlaps', () => {
    const para = 'I was very tired in this moment.';
    const a = s(6, 'very tired', 'exhausted');
    const b = s(17, 'in this moment', 'at the moment');
    const overlap = s(11, 'tired in', 'x');
    const next = afterApplying([a, overlap, b], a);
    expect(next).toEqual([{ ...b, start: 16, end: 30 }]);
    const edited = para.slice(0, a.start) + a.replacement + para.slice(a.end);
    expect(edited.slice(next[0]!.start, next[0]!.end)).toBe('in this moment');
  });
});

describe('diffParts', () => {
  it('splits text around suggestions', () => {
    const parts = diffParts('I was very tired.', [s(6, 'very tired', 'exhausted')]);
    expect(parts.map((p) => [p.text, p.change?.replacement])).toEqual([
      ['I was ', undefined],
      ['very tired', 'exhausted'],
      ['.', undefined],
    ]);
  });
});
