import type { RewriteSuggestion } from '@vocabflow/shared';
import type { RewriteState } from '../hooks/useRewrite';
import { diffParts } from '../lib/rewrite';
import { Popover } from './Popover';

interface Props {
  state: RewriteState;
  hasAi: boolean;
  onApply: (suggestion: RewriteSuggestion) => void;
  onReplaceParagraph: (rewritten: string) => void;
  onClose: () => void;
}

export function RewriteCard({ state, hasAi, onApply, onReplaceParagraph, onClose }: Props) {
  const { rewrite, pending } = state;
  const suggestions = rewrite?.suggestions ?? [];
  const isAi = rewrite?.source === 'llm';
  const unchanged = !!rewrite && rewrite.rewritten.trim() === state.text.trim();

  return (
    <Popover x={state.x} y={state.y} width={460} onClose={onClose} label="Paragraph rewrite">
      <header className="card-header">
        <h3>Say it more naturally</h3>
        {state.focus && <span className="pos">around “{state.focus}”</span>}
      </header>

      {!rewrite ? (
        <p className="muted shimmer">Reading the paragraph…</p>
      ) : (
        <>
          {rewrite.summary && <p className="muted small">{rewrite.summary}</p>}
          <blockquote className="rewrite-text">
            {isAi
              ? rewrite.rewritten
              : diffParts(state.text, suggestions).map((part, i) =>
                  part.change ? (
                    <span key={i} className="rewrite-change" title={part.change.explanation}>
                      <del>{part.text}</del> <ins>{part.change.replacement}</ins>
                    </span>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )}
          </blockquote>

          {suggestions.length > 0 ? (
            <ul className="rewrite-list">
              {suggestions.map((s) => (
                <li key={`${s.start}-${s.original}`}>
                  <div className="rewrite-line">
                    <span className={`kind kind-rewrite`}>{s.kind}</span>
                    <button className="suggestion" onClick={() => onApply(s)}>
                      <del>{s.original}</del> → <strong>{s.replacement || '(remove)'}</strong>
                    </button>
                  </div>
                  {s.explanation && <p className="muted small">{s.explanation}</p>}
                </li>
              ))}
            </ul>
          ) : (
            !pending && (
              <p className="muted">
                {unchanged
                  ? 'This paragraph already reads naturally.'
                  : 'No phrase-level changes to explain.'}
              </p>
            )
          )}
        </>
      )}

      {pending && rewrite && (
        <p className="muted small shimmer">Asking AI for paragraph-level phrasing…</p>
      )}

      <footer className="card-footer">
        <span className="muted small">
          {rewrite
            ? isAi
              ? `AI · ${rewrite.provider}`
              : hasAi && !pending
                ? 'Offline phrasebook (AI unavailable)'
                : 'Offline phrasebook'
            : ''}
          {state.latencyMs !== null && ` · ${state.latencyMs} ms`}
        </span>
        <button
          className="primary"
          disabled={!rewrite || pending || unchanged}
          onClick={() => rewrite && onReplaceParagraph(rewrite.rewritten)}
        >
          Replace paragraph
        </button>
      </footer>
      {!hasAi && (
        <p className="muted small">
          Connect Ollama or an OpenAI key for whole-paragraph rewrites and idioms.
        </p>
      )}
    </Popover>
  );
}
