import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createLlmRouter } from '../src/llm/index.js';

describe('config', () => {
  it('applies defaults and ignores empty values', () => {
    const config = loadConfig({ PORT: '', OPENAI_API_KEY: '' });
    expect(config.PORT).toBe(8787);
    expect(config.OPENAI_API_KEY).toBeUndefined();
  });

  it('only enables the cloud provider when an API key is present', () => {
    expect(createLlmRouter(loadConfig({})).providerNames).toEqual(['ollama:llama3.2:3b']);
    expect(createLlmRouter(loadConfig({ OPENAI_API_KEY: 'k' })).providerNames).toEqual([
      'openai:gpt-4o-mini',
      'ollama:llama3.2:3b',
    ]);
  });

  it('treats an empty provider list as offline-only', () => {
    expect(createLlmRouter(loadConfig({ LLM_PROVIDERS: '' })).hasProviders).toBe(false);
  });
});
