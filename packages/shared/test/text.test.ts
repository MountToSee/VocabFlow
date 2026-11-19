import { describe, expect, it } from 'vitest';
import { sentenceAt, splitParagraphs, tokenizeWords, wordAt } from '../src/text.js';

describe('text utilities', () => {
  it('tokenizes words with offsets', () => {
    const spans = tokenizeWords("It's a well-known fact.");
    expect(spans.map((s) => s.text)).toEqual(["It's", 'a', 'well-known', 'fact']);
    expect(spans[3]).toMatchObject({ start: 18, end: 22 });
  });

  it('splits paragraphs and keeps absolute offsets', () => {
    const text = 'First para.\nStill first.\n\nSecond para.';
    const paras = splitParagraphs(text);
    expect(paras).toHaveLength(2);
    expect(text.slice(paras[1]!.start, paras[1]!.end)).toBe('Second para.');
  });

  it('finds the sentence around an offset', () => {
    const text = 'One sentence. The ubiquitous phone! Last.';
    expect(sentenceAt(text, text.indexOf('ubiquitous'))).toBe('The ubiquitous phone!');
  });

  it('finds the word at an offset', () => {
    expect(wordAt('hello world', 8)?.text).toBe('world');
    expect(wordAt('hello  world', 6)).toBeNull();
  });
});
