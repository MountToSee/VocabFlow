import type { ChatMessage, CompletionOptions, LlmClient } from '../src/llm/types.js';

export class FakeLlm implements LlmClient {
  calls = 0;
  constructor(
    readonly name: string,
    readonly tier: 'cloud' | 'local',
    private readonly respond: (messages: ChatMessage[]) => string | Promise<string>,
    private readonly delayMs = 0,
  ) {}

  async complete(messages: ChatMessage[], options: CompletionOptions = {}): Promise<string> {
    this.calls++;
    if (this.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, this.delayMs);
        options.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new Error('aborted'));
        });
      });
    }
    return this.respond(messages);
  }
}

export const lastUserMessage = (messages: ChatMessage[]) =>
  messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
