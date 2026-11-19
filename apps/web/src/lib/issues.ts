import type { Issue } from '@vocabflow/shared';

/** Merges heuristic and LLM issues; heuristics win on overlap since they are deterministic. */
export function mergeIssues(heuristic: Issue[], llm: Issue[]): Issue[] {
  const merged = [...heuristic];
  for (const issue of llm) {
    if (!merged.some((m) => issue.start < m.end && m.start < issue.end)) merged.push(issue);
  }
  return merged.sort((a, b) => a.start - b.start);
}

export function issueAt(issues: Issue[], offset: number): Issue | undefined {
  return issues.find((i) => offset >= i.start && offset <= i.end && i.end > i.start);
}
