import type { Config } from '../config.js';
import { OpenAiCompatibleClient } from './openaiCompatible.js';
import { LatencyAwareRouter } from './router.js';
import type { LlmClient } from './types.js';

export function createLlmRouter(config: Config): LatencyAwareRouter {
  const providers: LlmClient[] = [];
  const wanted = config.LLM_PROVIDERS.split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  for (const id of wanted) {
    if (id === 'openai' && config.OPENAI_API_KEY) {
      providers.push(
        new OpenAiCompatibleClient({
          label: 'openai',
          tier: 'cloud',
          baseUrl: config.OPENAI_BASE_URL,
          model: config.OPENAI_MODEL,
          apiKey: config.OPENAI_API_KEY,
        }),
      );
    } else if (id === 'ollama') {
      providers.push(
        new OpenAiCompatibleClient({
          label: 'ollama',
          tier: 'local',
          baseUrl: config.OLLAMA_BASE_URL,
          model: config.OLLAMA_MODEL,
        }),
      );
    }
  }

  return new LatencyAwareRouter(providers, { latencyBudgetMs: config.LLM_LATENCY_BUDGET_MS });
}

export { LatencyAwareRouter } from './router.js';
export type { LlmClient, ChatMessage } from './types.js';
