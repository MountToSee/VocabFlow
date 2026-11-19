import { describe, expect, it } from 'vitest';
import { runHeuristics } from '../src/analysis/heuristics.js';

const ids = (text: string) =>
  runHeuristics(text).map((i) => i.id.split('-').slice(1, -2).join('-'));

describe('runHeuristics', () => {
  it('flags repeated words', () => {
    const [issue] = runHeuristics('This is the the best.');
    expect(issue).toMatchObject({ original: 'the the', suggestions: ['the'] });
  });

  it('handles a/an by sound, including exceptions', () => {
    expect(runHeuristics('It was a apple.')[0]?.suggestions).toEqual(['an apple']);
    expect(runHeuristics('Wait an hour.')).toHaveLength(0);
    expect(runHeuristics('She is a university student.')).toHaveLength(0);
    expect(runHeuristics('It is an useful tool.')[0]?.suggestions).toEqual(['a useful']);
    expect(runHeuristics('He is an honest man.')).toHaveLength(0);
  });

  it('capitalizes the pronoun I and sentence starts', () => {
    expect(ids('Yesterday i went home.')).toContain('lowercase-i');
    expect(ids("Today I'm fine. then it rained.")).toContain('sentence-capital');
    expect(ids('Use tools, e.g. hammers.')).not.toContain('sentence-capital');
  });

  it('suggests richer vocabulary for weak intensifiers', () => {
    const issue = runHeuristics('The movie was very good.').find((i) => i.kind === 'style');
    expect(issue?.original).toBe('very good');
    expect(issue?.suggestions).toContain('excellent');
  });

  it('catches common confusions with case preserved', () => {
    const issue = runHeuristics('Could of been worse.')[0];
    expect(issue?.suggestions).toEqual(['Could have']);
  });

  it('flags spacing problems', () => {
    expect(ids('Hello  world.')).toContain('double-space');
    const space = runHeuristics('Hello world .').find((i) => i.kind === 'punctuation');
    expect(space).toMatchObject({ start: 11, end: 12, suggestions: [''] });
  });

  it('returns sorted, non-overlapping issues', () => {
    const issues = runHeuristics('i think i think it was a apple  , really good');
    for (let k = 1; k < issues.length; k++) {
      expect(issues[k]!.start).toBeGreaterThanOrEqual(issues[k - 1]!.end);
    }
  });

  it('returns nothing for clean text', () => {
    expect(runHeuristics('The quick brown fox jumps over the lazy dog.')).toEqual([]);
  });
});
