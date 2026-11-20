import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().default(8787),
  HOST: z.string().default('127.0.0.1'),
  /** Browser origins allowed to call the API / open WebSockets. Requests without an Origin (native shells) are always allowed. */
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  LLM_PROVIDERS: z.string().default('openai,ollama'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OLLAMA_BASE_URL: z.string().url().default('http://127.0.0.1:11434/v1'),
  OLLAMA_MODEL: z.string().default('llama3.2:3b'),
  LLM_LATENCY_BUDGET_MS: z.coerce.number().int().positive().default(2500),
  /** Paragraph rewrites generate more text, so they get a longer budget. */
  LLM_REWRITE_BUDGET_MS: z.coerce.number().int().positive().default(8000),
  MACOS_DICTIONARY_HELPER: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Empty values fall back to defaults, except LLM_PROVIDERS where "" means "offline only".
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([k, v]) => v !== '' || k === 'LLM_PROVIDERS'),
  );
  return envSchema.parse(cleaned);
}
