import { describe, expect, it } from 'vitest';
import { LatencyAwareRouter } from '../src/llm/router.js';
import { phrasebookSuggestions } from '../src/rewrite/phrasebook.js';
import { anchorChanges, applySuggestions, ParagraphRewriter } from '../src/rewrite/rewriter.js';
import { FakeLlm, lastUserMessage } from './fakes.js';

const PARAGRAPH =
  'In the other hand, I was very tired. We discuss about it a lot of times but at the end nobody decided.';

describe('phrasebookSuggestions', () => {
  it('finds idioms, collocations and intensifiers with offsets and preserved case', () => {
    const s = phrasebookSuggestions(PARAGRAPH);
    expect(s.map((x) => [x.original, x.replacement, x.kind])).toEqual([
      ['In the other hand', 'On the other hand', 'idiom'],
      ['very tired', 'exhausted', 'phrasing'],
      ['discuss about', 'discuss', 'grammar'],
      ['a lot of times', 'often', 'concision'],
      ['at the end', 'in the end', 'idiom'],
    ]);
    for (const x of s) expect(PARAGRAPH.slice(x.start, x.end)).toBe(x.original);
  });

  it('leaves unknown intensifiers and clean text alone', () => {
    expect(phrasebookSuggestions('It was very purple. All good here.')).toEqual([]);
  });
});

describe('applySuggestions / anchorChanges', () => {
  it('applies suggestions in order and skips overlaps', () => {
    const changes = anchorChanges('I am agree with you, I am agree.', [
      { original: 'I am agree', replacement: 'I agree', kind: 'grammar', explanation: '' },
      { original: 'I am agree', replacement: 'I agree', kind: 'grammar', explanation: '' },
      { original: 'am agree with', replacement: 'x', kind: 'grammar', explanation: '' },
      { original: 'not in text', replacement: 'y', kind: 'idiom', explanation: '' },
      { original: 'you', replacement: 'you', kind: 'idiom', explanation: '' },
    ]);
    expect(changes.map((c) => c.start)).toEqual([0, 21]);
    expect(applySuggestions('I am agree with you, I am agree.', changes)).toBe(
      'I agree with you, I agree.',
    );
  });
});

describe('ParagraphRewriter', () => {
  it('builds an offline rewrite from the phrasebook plus grammar heuristics', () => {
    const rewriter = new ParagraphRewriter(
      new LatencyAwareRouter([], { latencyBudgetMs: 100 }),
      500,
    );
    const r = rewriter.quick('i was very tired in this moment.');
    expect(r.source).toBe('heuristic');
    expect(r.rewritten).toBe('I was exhausted at the moment.');
    expect(rewriter.hasAi).toBe(false);
  });

  it('returns an anchored, cached AI rewrite and passes the focus phrase', async () => {
    const llm = new FakeLlm('fake', 'cloud', (messages) => {
      expect(lastUserMessage(messages)).toContain('unsure about "at the end"');
      return (
        'Sure! ' +
        JSON.stringify({
          rewritten:
            'Then again, I was worn out. We kept going over it, but in the end nobody decided.',
          summary: 'Smoother linking and more idiomatic verbs.',
          changes: [
            {
              original: 'In the other hand',
              replacement: 'Then again',
              kind: 'idiom',
              explanation: 'Fixed expression.',
            },
            { original: 'hallucinated', replacement: 'x', kind: 'phrasing', explanation: '' },
            { original: 'at the end', replacement: 'in the end', kind: 'weird', explanation: '' },
          ],
        })
      );
    });
    const rewriter = new ParagraphRewriter(
      new LatencyAwareRouter([llm], { latencyBudgetMs: 100 }),
      500,
    );
    const r = await rewriter.ai(PARAGRAPH, 'at the end');
    expect(r).toMatchObject({
      source: 'llm',
      provider: 'fake',
      summary: 'Smoother linking and more idiomatic verbs.',
    });
    expect(r!.suggestions.map((s) => [s.original, s.kind])).toEqual([
      ['In the other hand', 'idiom'],
      ['at the end', 'phrasing'],
    ]);
    await rewriter.ai(PARAGRAPH, 'at the end');
    expect(llm.calls).toBe(1);
  });

  it('returns null for unparseable output or a slow provider beyond the rewrite budget', async () => {
    const bad = new ParagraphRewriter(
      new LatencyAwareRouter([new FakeLlm('bad', 'local', () => 'no json')], {
        latencyBudgetMs: 100,
      }),
      500,
    );
    expect(await bad.ai(PARAGRAPH, undefined)).toBeNull();

    const slowLlm = new FakeLlm('slow', 'local', () => '{"rewritten":"x"}', 80);
    const router = new LatencyAwareRouter([slowLlm], { latencyBudgetMs: 20 });
    // 80 ms exceeds the analysis budget (20 ms) but fits the rewrite budget.
    expect(await new ParagraphRewriter(router, 500).ai(PARAGRAPH, undefined)).toMatchObject({
      rewritten: 'x',
    });
    expect(await new ParagraphRewriter(router, 30).ai('Another one.', undefined)).toBeNull();
  });
});
