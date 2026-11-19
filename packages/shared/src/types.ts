export type IssueKind = 'grammar' | 'spelling' | 'style' | 'word-choice' | 'punctuation';

export type AnalysisSource = 'heuristic' | 'llm';

/** A single correction anchored to a character range in the analysed text. */
export interface Issue {
  /** Stable id derived from range + rule so the UI can diff updates. */
  id: string;
  kind: IssueKind;
  source: AnalysisSource;
  /** Inclusive start offset (UTF-16 code units, matching JS strings). */
  start: number;
  /** Exclusive end offset. */
  end: number;
  original: string;
  message: string;
  suggestions: string[];
}

/** Which engine produced the deeper analysis for a revision. */
export type AnalysisStrategy = 'cloud-llm' | 'local-llm' | 'heuristics-only';

export type LookupSource = 'macos-dictionary' | 'local-lexicon' | 'llm' | 'none';

export interface Definition {
  word: string;
  source: LookupSource;
  /** Plain-text definition body. */
  definition: string;
  partOfSpeech?: string;
  pronunciation?: string;
  synonyms: string[];
}

/** LLM-produced, context-aware enrichment for a lookup. */
export interface ContextualExplanation {
  word: string;
  explanation: string;
  synonyms: string[];
  /** Model/provider that produced the explanation. */
  provider: string;
}

export interface Capabilities {
  macosDictionary: boolean;
  llmProviders: string[];
  latencyBudgetMs: number;
}
