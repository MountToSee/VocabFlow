import {
  hashString,
  type ParagraphRewrite,
  type RewriteKind,
  type RewriteSuggestion,
} from '@vocabflow/shared';
import { z } from 'zod';
import { runHeuristics } from '../analysis/heuristics.js';
import { extractJson } from '../llm/json.js';
import type { LatencyAwareRouter } from '../llm/router.js';
import { LruCache } from '../lru.js';
import { phrasebookSuggestions } from './phrasebook.js';

const SYSTEM_PROMPT = `You are a writing coach for a language learner. Rewrite the user's paragraph so it sounds like a fluent native speaker wrote it, keeping their meaning, tone and register. Prefer natural phrasing, idioms and collocations a native speaker would actually use, judged across the whole paragraph (flow, repetition, linking between sentences) rather than swapping isolated words. Do not add new ideas.
Then list the most instructive changes (max 6). Each "original" must be copied verbatim from the input paragraph, and "replacement" is what it became.
Respond with JSON: {"rewritten":"...","summary":"<one short sentence>","changes":[{"original":"...","replacement":"...","kind":"idiom|phrasing|collocation|grammar|concision","explanation":"<one short learner-friendly sentence>"}]}`;

const responseSchema = z.object({
  rewritten: z.string().min(1),
  summary: z.string().optional(),
  changes: z
    .array(
      z.object({
        original: z.string().min(1),
        replacement: z.string(),
        kind: z
          .enum(['idiom', 'phrasing', 'collocation', 'grammar', 'concision'])
          .catch('phrasing'),
        explanation: z.string().default(''),
      }),
    )
    .default([]),
});

/** Applies non-overlapping suggestions to the paragraph. */
export function applySuggestions(paragraph: string, suggestions: RewriteSuggestion[]): string {
  let out = '';
  let cursor = 0;
  for (const s of [...suggestions].sort((a, b) => a.start - b.start)) {
    if (s.start < cursor) continue;
    out += paragraph.slice(cursor, s.start) + s.replacement;
    cursor = s.end;
  }
  return out + paragraph.slice(cursor);
}

/** Maps model-reported substrings back to paragraph offsets, dropping hallucinated or overlapping ones. */
export function anchorChanges(
  paragraph: string,
  changes: { original: string; replacement: string; kind: RewriteKind; explanation: string }[],
): RewriteSuggestion[] {
  const anchored: RewriteSuggestion[] = [];
  const nextFrom = new Map<string, number>();
  for (const c of changes) {
    if (c.original === c.replacement) continue;
    const start = paragraph.indexOf(c.original, nextFrom.get(c.original) ?? 0);
    if (start === -1) continue;
    const end = start + c.original.length;
    nextFrom.set(c.original, end);
    if (anchored.some((a) => start < a.end && a.start < end)) continue;
    anchored.push({ ...c, start, end });
  }
  return anchored.sort((a, b) => a.start - b.start);
}

/**
 * Whole-paragraph rewrites. `quick` is instant and offline (phrasebook + grammar heuristics);
 * `ai` asks the latency-aware LLM chain (cloud → Ollama) for a fluent rewrite with explained
 * changes, returning null when no provider answers within the rewrite budget.
 */
export class ParagraphRewriter {
  private readonly cache = new LruCache<string, ParagraphRewrite>(500);

  constructor(
    private readonly router: LatencyAwareRouter,
    private readonly budgetMs: number,
  ) {}

  get hasAi(): boolean {
    return this.router.hasProviders;
  }

  quick(paragraph: string): ParagraphRewrite {
    const grammar: RewriteSuggestion[] = runHeuristics(paragraph)
      .filter((i) => i.kind !== 'style' && i.suggestions[0] !== undefined)
      .map((i) => ({
        start: i.start,
        end: i.end,
        original: i.original,
        replacement: i.suggestions[0]!,
        kind: 'grammar',
        explanation: i.message,
      }));
    const phrases = phrasebookSuggestions(paragraph);
    const suggestions = [...phrases];
    for (const g of grammar) {
      if (!suggestions.some((s) => g.start < s.end && s.start < g.end)) suggestions.push(g);
    }
    suggestions.sort((a, b) => a.start - b.start);
    return {
      paragraph,
      rewritten: applySuggestions(paragraph, suggestions),
      suggestions,
      source: 'heuristic',
    };
  }

  async ai(
    paragraph: string,
    focus: string | undefined,
    signal?: AbortSignal,
  ): Promise<ParagraphRewrite | null> {
    if (!this.router.hasProviders) return null;
    const key = `${hashString(paragraph)}:${focus?.toLowerCase() ?? ''}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const focusLine = focus?.trim()
      ? `\nThe writer was unsure about "${focus.trim()}" — make sure it reads naturally in context.`
      : '';
    const result = await this.router.complete(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Paragraph:\n${paragraph}${focusLine}` },
      ],
      { json: true, signal, maxTokens: 900, budgetMs: this.budgetMs },
    );
    if (!result) return null;
    try {
      const parsed = responseSchema.parse(extractJson(result.text));
      const rewrite: ParagraphRewrite = {
        paragraph,
        rewritten: parsed.rewritten.trim(),
        suggestions: anchorChanges(paragraph, parsed.changes),
        source: 'llm',
        provider: result.provider.name,
        summary: parsed.summary?.trim() || undefined,
      };
      this.cache.set(key, rewrite);
      return rewrite;
    } catch {
      return null;
    }
  }
}
