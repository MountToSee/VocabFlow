import type { Definition } from '@vocabflow/shared';

export interface DefinitionProvider {
  readonly name: string;
  readonly available: boolean;
  lookup(word: string): Promise<Definition | null>;
  dispose?(): void;
}
