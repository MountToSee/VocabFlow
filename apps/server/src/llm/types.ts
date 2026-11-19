export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  signal?: AbortSignal;
  /** Ask the model to answer with a single JSON object. */
  json?: boolean;
  maxTokens?: number;
}

export interface LlmClient {
  /** Human-readable provider id, e.g. "openai:gpt-4o-mini". */
  readonly name: string;
  readonly tier: 'cloud' | 'local';
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string>;
}
