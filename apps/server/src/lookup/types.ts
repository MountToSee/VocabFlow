import type { Definition } from '@vocabflow/shared';

export interface DefinitionProvider {
  readonly name: string;
  readonly available: boolean;
  lookup(word: string): Promise<Definition | null>;
  /** Starts any background process ahead of the first lookup. */
  warm?(): void;
  dispose?(): void;
}
