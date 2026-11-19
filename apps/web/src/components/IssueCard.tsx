import type { Issue } from '@vocabflow/shared';
import { Popover } from './Popover';

interface Props {
  issue: Issue;
  x: number;
  y: number;
  onApply: (replacement: string) => void;
  onDismiss: () => void;
  onClose: () => void;
}

export function IssueCard({ issue, x, y, onApply, onDismiss, onClose }: Props) {
  return (
    <Popover x={x} y={y} onClose={onClose} label="Writing suggestion">
      <header className="card-header">
        <span className={`kind kind-${issue.kind}`}>{issue.kind.replace('-', ' ')}</span>
        <span className="muted small">{issue.source === 'llm' ? 'AI' : 'Instant'}</span>
      </header>
      <p>{issue.message}</p>
      <div className="suggestions">
        {issue.suggestions.map((s) => (
          <button key={s} className="suggestion" onClick={() => onApply(s)}>
            <del>{issue.original}</del> → <strong>{s === '' ? '(remove)' : s}</strong>
          </button>
        ))}
      </div>
      <footer className="card-footer">
        <span />
        <button className="ghost" onClick={onDismiss}>
          Ignore
        </button>
      </footer>
    </Popover>
  );
}
