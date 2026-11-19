import { hashString, type Issue, type IssueKind } from '@vocabflow/shared';
import { z } from 'zod';
import { extractJson } from '../llm/json.js';
import type { LatencyAwareRouter } from '../llm/router.js';

const SYSTEM_PROMPT = `You are a precise writing tutor for a language learner. Review the user's paragraph and report only real problems: grammar, spelling, punctuation, unnatural word choice, and places where a richer vocabulary word would fit.
Respond with JSON: {"issues":[{"original":"<exact substring from the text>","kind":"grammar|spelling|punctuation|word-choice|style","message":"<short learner-friendly explanation>","suggestions":["<replacement>"]}]}
Rules: "original" must be copied verbatim from the text and be as short as possible. At most 8 issues. Return {"issues":[]} if the text is fine.`;

const responseSchema = z.object({
  issues: z
    .array(
      z.object({
        original: z.string().min(1),
        kind: z
          .enum(['grammar', 'spelling', 'punctuation', 'word-choice', 'style'])
          .catch('grammar'),
        message: z.string(),
        suggestions: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

export interface LlmParagraphResult {
  /** Issues with offsets relative to the paragraph. */
  issues: Issue[];
  provider: string;
  tier: 'cloud' | 'local';
}

export async function analyzeParagraphWithLlm(
  router: LatencyAwareRouter,
  paragraph: string,
  signal?: AbortSignal,
): Promise<LlmParagraphResult | null> {
  const result = await router.complete(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: paragraph },
    ],
    { json: true, signal },
  );
  if (!result) return null;

  let parsed: z.infer<typeof responseSchema>;
  try {
    parsed = responseSchema.parse(extractJson(result.text));
  } catch {
    return { issues: [], provider: result.provider.name, tier: result.provider.tier };
  }

  return {
    issues: anchorIssues(paragraph, parsed.issues),
    provider: result.provider.name,
    tier: result.provider.tier,
  };
}

/** Maps model-reported substrings back to character offsets, skipping hallucinated spans. */
export function anchorIssues(
  text: string,
  raw: { original: string; kind: IssueKind; message: string; suggestions: string[] }[],
): Issue[] {
  const issues: Issue[] = [];
  const used = new Map<string, number>();
  for (const r of raw) {
    const from = used.get(r.original) ?? 0;
    const start = text.indexOf(r.original, from);
    if (start === -1) continue;
    const suggestions = r.suggestions.filter((s) => s !== r.original);
    if (suggestions.length === 0 && r.kind !== 'style') continue;
    used.set(r.original, start + r.original.length);
    issues.push({
      id: `l-${start}-${hashString(r.original + r.message)}`,
      kind: r.kind,
      source: 'llm',
      start,
      end: start + r.original.length,
      original: r.original,
      message: r.message,
      suggestions,
    });
  }
  return issues;
}
