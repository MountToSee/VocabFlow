import { hashString, type ContextualExplanation, type Definition } from '@vocabflow/shared';
import { z } from 'zod';
import { extractJson } from '../llm/json.js';
import type { LatencyAwareRouter } from '../llm/router.js';
import { LruCache } from '../lru.js';
import type { DefinitionProvider } from './types.js';

const EXPLAIN_PROMPT = `You are a vocabulary tutor. Explain what the given word means in the given sentence, in one or two plain sentences a language learner understands, and suggest up to 4 synonyms that fit this exact context.
Respond with JSON: {"explanation":"...","synonyms":["..."]}`;

const explainSchema = z.object({
  explanation: z.string(),
  synonyms: z.array(z.string()).default([]),
});

/**
 * Two-phase lookup:
 *  1. `define` — native/local dictionaries, first hit wins (fast, offline).
 *  2. `explain` — LLM contextual explanation + synonyms through the latency-aware router.
 */
export class LookupPipeline {
  private readonly definitions = new LruCache<string, Definition>(5_000);
  private readonly explanations = new LruCache<string, ContextualExplanation>(2_000);

  constructor(
    private readonly providers: DefinitionProvider[],
    private readonly router: LatencyAwareRouter,
  ) {}

  get hasNativeDictionary(): boolean {
    return this.providers.some((p) => p.name === 'macos-dictionary' && p.available);
  }

  async define(word: string): Promise<Definition> {
    const key = word.toLowerCase();
    const cached = this.definitions.get(key);
    if (cached) return cached;

    for (const provider of this.providers) {
      if (!provider.available) continue;
      try {
        const def = await provider.lookup(word);
        if (def) {
          this.definitions.set(key, def);
          return def;
        }
      } catch {
        // try next provider
      }
    }
    return { word, source: 'none', definition: '', synonyms: [] };
  }

  async explain(
    word: string,
    context: string | undefined,
    signal?: AbortSignal,
  ): Promise<ContextualExplanation | null> {
    if (!this.router.hasProviders) return null;
    const key = `${word.toLowerCase()}:${hashString(context ?? '')}`;
    const cached = this.explanations.get(key);
    if (cached) return cached;

    const result = await this.router.complete(
      [
        { role: 'system', content: EXPLAIN_PROMPT },
        {
          role: 'user',
          content: `Word: ${word}\nSentence: ${context?.trim() || '(no context provided)'}`,
        },
      ],
      { json: true, signal, maxTokens: 250 },
    );
    if (!result) return null;
    try {
      const parsed = explainSchema.parse(extractJson(result.text));
      const explanation: ContextualExplanation = {
        word,
        explanation: parsed.explanation,
        synonyms: parsed.synonyms.slice(0, 4),
        provider: result.provider.name,
      };
      this.explanations.set(key, explanation);
      return explanation;
    } catch {
      return null;
    }
  }

  dispose(): void {
    for (const p of this.providers) p.dispose?.();
  }
}
