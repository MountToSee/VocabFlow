import type { ChatMessage, CompletionOptions, LlmClient } from './types.js';

export interface OpenAiCompatibleOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  tier: 'cloud' | 'local';
  label: string;
  fetchImpl?: typeof fetch;
}

/**
 * Works with OpenAI and any server exposing the same Chat Completions API
 * (Ollama, LM Studio, llama.cpp server, vLLM, ...).
 */
export class OpenAiCompatibleClient implements LlmClient {
  readonly name: string;
  readonly tier: 'cloud' | 'local';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: OpenAiCompatibleOptions) {
    this.name = `${opts.label}:${opts.model}`;
    this.tier = opts.tier;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async complete(messages: ChatMessage[], options: CompletionOptions = {}): Promise<string> {
    const res = await this.fetchImpl(`${this.opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: options.signal,
      headers: {
        'content-type': 'application/json',
        ...(this.opts.apiKey ? { authorization: `Bearer ${this.opts.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.opts.model,
        messages,
        temperature: 0.2,
        max_tokens: options.maxTokens ?? 600,
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`${this.name} responded ${res.status}`);
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error(`${this.name} returned no content`);
    return content;
  }
}
