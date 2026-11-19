import type { Issue } from '@vocabflow/shared';

interface Props {
  issues: Issue[];
  onApply: (issue: Issue, replacement: string) => void;
  onDismiss: (issue: Issue) => void;
}

export function InsightsPanel({ issues, onApply, onDismiss }: Props) {
  if (issues.length === 0) {
    return <p className="muted empty">No suggestions. Keep writing!</p>;
  }
  return (
    <ul className="issue-list">
      {issues.map((issue) => (
        <li key={issue.id} className="issue">
          <div className="issue-head">
            <span className={`kind kind-${issue.kind}`}>{issue.kind.replace('-', ' ')}</span>
            <span className="muted small">{issue.source === 'llm' ? 'AI' : 'Instant'}</span>
          </div>
          <p className="issue-message">{issue.message}</p>
          <div className="suggestions">
            {issue.suggestions.slice(0, 3).map((s) => (
              <button key={s} className="suggestion" onClick={() => onApply(issue, s)}>
                <del>{issue.original}</del> → <strong>{s === '' ? '(remove)' : s}</strong>
              </button>
            ))}
            <button className="ghost small" onClick={() => onDismiss(issue)}>
              Ignore
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
