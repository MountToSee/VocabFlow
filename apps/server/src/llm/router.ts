import type { ChatMessage, CompletionOptions, LlmClient } from './types.js';

interface ProviderStats {
  /** Exponentially weighted moving average of latency in ms. */
  ewmaMs: number | null;
  consecutiveFailures: number;
  /** Provider is skipped until this epoch ms. */
  cooldownUntil: number;
}

export interface RouterOptions {
  /** Max time a single provider may take before we fall back. */
  latencyBudgetMs: number;
  /** Base cooldown applied after a timeout/failure; doubles per consecutive failure. */
  cooldownMs?: number;
  now?: () => number;
}

export interface RoutedResult {
  text: string;
  provider: LlmClient;
  latencyMs: number;
}

const EWMA_ALPHA = 0.3;
const MAX_COOLDOWN_MS = 5 * 60 * 1000;
const SOFT_BUDGET_RATIO = 0.6;

/**
 * Latency-aware fallback chain. Providers are tried in priority order with a hard
 * per-call timeout; a provider that times out or fails is put on an exponential
 * cooldown, and one that is consistently slow is demoted behind faster providers.
 * Returns null when no provider answered within budget so callers can fall back to
 * heuristics.
 */
export class LatencyAwareRouter {
  private readonly stats = new Map<LlmClient, ProviderStats>();
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(
    private readonly providers: LlmClient[],
    private readonly opts: RouterOptions,
  ) {
    this.cooldownMs = opts.cooldownMs ?? 30_000;
    this.now = opts.now ?? Date.now;
    for (const p of providers) {
      this.stats.set(p, { ewmaMs: null, consecutiveFailures: 0, cooldownUntil: 0 });
    }
  }

  get providerNames(): string[] {
    return this.providers.map((p) => p.name);
  }

  get hasProviders(): boolean {
    return this.providers.length > 0;
  }

  snapshot(): Record<string, ProviderStats> {
    return Object.fromEntries(this.providers.map((p) => [p.name, { ...this.stats.get(p)! }]));
  }

  async complete(
    messages: ChatMessage[],
    options: Omit<CompletionOptions, 'signal'> & {
      signal?: AbortSignal;
      /** Per-call override of the latency budget, for longer generations. */
      budgetMs?: number;
    } = {},
  ): Promise<RoutedResult | null> {
    const { budgetMs = this.opts.latencyBudgetMs, ...completion } = options;
    for (const provider of this.eligibleProviders()) {
      if (options.signal?.aborted) return null;
      const stats = this.stats.get(provider)!;
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      options.signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), budgetMs);
      const started = this.now();
      try {
        const text = await provider.complete(messages, {
          ...completion,
          signal: controller.signal,
        });
        const latencyMs = this.now() - started;
        // Scale long-budget calls so a slow rewrite doesn't demote a provider for analysis.
        const sample = latencyMs * (this.opts.latencyBudgetMs / budgetMs);
        stats.ewmaMs =
          stats.ewmaMs === null ? sample : EWMA_ALPHA * sample + (1 - EWMA_ALPHA) * stats.ewmaMs;
        stats.consecutiveFailures = 0;
        return { text, provider, latencyMs };
      } catch {
        if (options.signal?.aborted) return null;
        stats.consecutiveFailures += 1;
        const backoff = this.cooldownMs * 2 ** (stats.consecutiveFailures - 1);
        stats.cooldownUntil = this.now() + Math.min(backoff, MAX_COOLDOWN_MS);
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
      }
    }
    return null;
  }

  /**
   * Providers not cooling down, in priority order, except that providers whose rolling
   * latency exceeds the soft budget are demoted behind faster ones (e.g. a slow cloud
   * model yields to a local model) while still serving as a fallback.
   */
  private eligibleProviders(): LlmClient[] {
    const now = this.now();
    const softBudget = this.opts.latencyBudgetMs * SOFT_BUDGET_RATIO;
    const available = this.providers.filter((p) => this.stats.get(p)!.cooldownUntil <= now);
    const isSlow = (p: LlmClient) => (this.stats.get(p)!.ewmaMs ?? 0) > softBudget;
    return [...available.filter((p) => !isSlow(p)), ...available.filter(isSlow)];
  }
}
