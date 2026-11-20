import { describe, expect, it } from 'vitest';
import { normalizeLookupTerm, selectionLookup } from '../src/lib/lookupTerm';

describe('normalizeLookupTerm', () => {
  it('accepts words and short phrases, trimming punctuation', () => {
    expect(normalizeLookupTerm(' serendipity, ')).toBe('serendipity');
    expect(normalizeLookupTerm('“take  for granted.”')).toBe('take for granted');
    expect(normalizeLookupTerm("don't")).toBe("don't");
    expect(normalizeLookupTerm('café')).toBe('café');
  });

  it('rejects sentences, numbers and code', () => {
    expect(normalizeLookupTerm('this is far too long a phrase')).toBeNull();
    expect(normalizeLookupTerm('1234')).toBeNull();
    expect(normalizeLookupTerm('foo()bar')).toBeNull();
    expect(normalizeLookupTerm('   ')).toBeNull();
  });
});

describe('selectionLookup', () => {
  it('returns the selected word with its sentence as context', () => {
    document.body.innerHTML =
      '<div id="root"><p>First line.</p><p>Phones are ubiquitous now. Next one.</p></div>';
    const root = document.getElementById('root')!;
    const text = root.querySelectorAll('p')[1]!.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 11);
    range.setEnd(text, 21);
    range.getBoundingClientRect = () => new DOMRect(10, 20, 80, 16);
    const sel = document.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    expect(selectionLookup(root)).toEqual({
      word: 'ubiquitous',
      context: 'Phones are ubiquitous now.',
      anchor: { x: 50, y: 36 },
    });
  });

  it('ignores selections outside the editor', () => {
    document.body.innerHTML = '<div id="root"><p>inside</p></div><p id="out">outside</p>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('out')!);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    expect(selectionLookup(document.getElementById('root')!)).toBeNull();
  });
});
