import { z } from 'zod';
import type {
  AnalysisSource,
  AnalysisStrategy,
  Capabilities,
  ContextualExplanation,
  Definition,
  Issue,
} from './types.js';

export const MAX_ANALYZE_CHARS = 50_000;

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('analyze'),
    noteId: z.string().min(1).max(128),
    revision: z.number().int().nonnegative(),
    text: z.string().max(MAX_ANALYZE_CHARS),
  }),
  z.object({
    type: z.literal('lookup'),
    requestId: z.string().min(1).max(128),
    word: z.string().min(1).max(64),
    /** Sentence surrounding the word, used for contextual explanations. */
    context: z.string().max(2_000).optional(),
    /** Set to false for a definition-only "peek" (no LLM round-trip). Defaults to true. */
    explain: z.boolean().optional(),
  }),
  z.object({ type: z.literal('ping') }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ServerMessage =
  | { type: 'hello'; capabilities: Capabilities }
  | { type: 'pong' }
  | { type: 'analysis:start'; noteId: string; revision: number }
  | {
      type: 'analysis:issues';
      noteId: string;
      revision: number;
      source: AnalysisSource;
      /** Issues replace all previous issues of the same source for this revision. */
      issues: Issue[];
      /** True when more issues of this source may still follow. */
      partial: boolean;
    }
  | {
      type: 'analysis:done';
      noteId: string;
      revision: number;
      strategy: AnalysisStrategy;
      latencyMs: number;
    }
  | { type: 'lookup:definition'; requestId: string; definition: Definition; latencyMs: number }
  | {
      type: 'lookup:explanation';
      requestId: string;
      explanation: ContextualExplanation | null;
      latencyMs: number;
    }
  | { type: 'error'; message: string; requestId?: string };

export function parseClientMessage(raw: string): ClientMessage | { error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { error: 'Invalid JSON' };
  }
  const result = clientMessageSchema.safeParse(json);
  if (!result.success) {
    return { error: result.error.issues.map((i) => i.message).join('; ') };
  }
  return result.data;
}
