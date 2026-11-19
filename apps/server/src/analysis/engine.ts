import { hashString, splitParagraphs, type AnalysisStrategy, type Issue } from '@vocabflow/shared';
import { LruCache } from '../lru.js';
import type { LatencyAwareRouter } from '../llm/router.js';
import { runHeuristics } from './heuristics.js';
import { analyzeParagraphWithLlm, type LlmParagraphResult } from './llmAnalyzer.js';

export type AnalysisEvent =
  | { type: 'issues'; source: 'heuristic' | 'llm'; issues: Issue[]; partial: boolean }
  | { type: 'done'; strategy: AnalysisStrategy; latencyMs: number };

/**
 * Streams analysis for a document: heuristics are emitted immediately, then LLM results
 * paragraph by paragraph. Paragraph results are cached by content hash so editing one
 * paragraph only re-analyses that paragraph.
 */
export class AnalysisEngine {
  private readonly cache = new LruCache<string, LlmParagraphResult>(2_000);

  constructor(private readonly router: LatencyAwareRouter) {}

  async analyze(
    text: string,
    emit: (event: AnalysisEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const started = Date.now();
    emit({ type: 'issues', source: 'heuristic', issues: runHeuristics(text), partial: false });

    if (!this.router.hasProviders) {
      emit({ type: 'done', strategy: 'heuristics-only', latencyMs: Date.now() - started });
      return;
    }

    const paragraphs = splitParagraphs(text);
    const llmIssues: Issue[] = [];
    const tiers = new Set<'cloud' | 'local'>();
    let failed = false;

    for (const [i, para] of paragraphs.entries()) {
      if (signal?.aborted) return;
      const key = hashString(para.text);
      let result = this.cache.get(key);
      if (!result && !failed) {
        result = (await analyzeParagraphWithLlm(this.router, para.text, signal)) ?? undefined;
        if (signal?.aborted) return;
        if (result) this.cache.set(key, result);
        // Once every provider is unavailable, stop trying for the rest of this revision.
        else failed = true;
      }
      if (result) {
        tiers.add(result.tier);
        llmIssues.push(
          ...result.issues.map((issue) => ({
            ...issue,
            id: `${issue.id}-${para.start}`,
            start: issue.start + para.start,
            end: issue.end + para.start,
          })),
        );
      }
      emit({
        type: 'issues',
        source: 'llm',
        issues: [...llmIssues],
        partial: i < paragraphs.length - 1,
      });
    }

    const strategy: AnalysisStrategy = tiers.has('cloud')
      ? 'cloud-llm'
      : tiers.has('local')
        ? 'local-llm'
        : 'heuristics-only';
    emit({ type: 'done', strategy, latencyMs: Date.now() - started });
  }
}
