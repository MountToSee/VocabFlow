import { describe, expect, it } from 'vitest';
import { AnalysisEngine, type AnalysisEvent } from '../src/analysis/engine.js';
import { anchorIssues } from '../src/analysis/llmAnalyzer.js';
import { LatencyAwareRouter } from '../src/llm/router.js';
import { FakeLlm, lastUserMessage } from './fakes.js';

const tutor = new FakeLlm('fake-cloud', 'cloud', (messages) => {
  const text = lastUserMessage(messages);
  const issues = text.includes('goed')
    ? [
        {
          original: 'goed',
          kind: 'grammar',
          message: 'Past tense of go is went.',
          suggestions: ['went'],
        },
      ]
    : [];
  return JSON.stringify({ issues });
});

async function collect(engine: AnalysisEngine, text: string): Promise<AnalysisEvent[]> {
  const events: AnalysisEvent[] = [];
  await engine.analyze(text, (e) => events.push(e));
  return events;
}

describe('AnalysisEngine', () => {
  it('emits heuristics first, then LLM issues with absolute offsets', async () => {
    const engine = new AnalysisEngine(new LatencyAwareRouter([tutor], { latencyBudgetMs: 500 }));
    const text = 'All good here.\n\nYesterday I goed home.';
    const events = await collect(engine, text);

    expect(events[0]).toMatchObject({ type: 'issues', source: 'heuristic' });
    const llm = events.filter((e) => e.type === 'issues' && e.source === 'llm').at(-1);
    expect(llm?.type === 'issues' && llm.issues).toHaveLength(1);
    const issue = llm?.type === 'issues' ? llm.issues[0]! : null;
    expect(text.slice(issue!.start, issue!.end)).toBe('goed');
    expect(events.at(-1)).toMatchObject({ type: 'done', strategy: 'cloud-llm' });
  });

  it('caches paragraph results so unchanged paragraphs are not re-sent', async () => {
    const llm = new FakeLlm('counter', 'cloud', () => '{"issues":[]}');
    const engine = new AnalysisEngine(new LatencyAwareRouter([llm], { latencyBudgetMs: 500 }));
    await collect(engine, 'Para one.\n\nPara two.');
    expect(llm.calls).toBe(2);
    await collect(engine, 'Para one.\n\nPara two edited.');
    expect(llm.calls).toBe(3);
  });

  it('reports heuristics-only when no provider answers in time', async () => {
    const slow = new FakeLlm('slow', 'cloud', () => '{"issues":[]}', 200);
    const engine = new AnalysisEngine(new LatencyAwareRouter([slow], { latencyBudgetMs: 10 }));
    const events = await collect(engine, 'A sentence.\n\nAnother one.');
    expect(events.at(-1)).toMatchObject({ type: 'done', strategy: 'heuristics-only' });
    expect(slow.calls).toBe(1);
  });

  it('works with no providers configured', async () => {
    const engine = new AnalysisEngine(new LatencyAwareRouter([], { latencyBudgetMs: 10 }));
    const events = await collect(engine, 'i like it.');
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ strategy: 'heuristics-only' });
  });
});

describe('anchorIssues', () => {
  it('drops hallucinated spans and no-op suggestions, and anchors repeats in order', () => {
    const text = 'teh cat and teh dog';
    const issues = anchorIssues(text, [
      { original: 'teh', kind: 'spelling', message: 'typo', suggestions: ['the'] },
      { original: 'teh', kind: 'spelling', message: 'typo', suggestions: ['the'] },
      { original: 'missing', kind: 'spelling', message: 'x', suggestions: ['y'] },
      { original: 'cat', kind: 'grammar', message: 'same', suggestions: ['cat'] },
    ]);
    expect(issues.map((i) => i.start)).toEqual([0, 12]);
  });
});
