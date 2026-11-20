import type { LookupState } from '../hooks/useLookup';
import { Popover } from './Popover';

const SOURCE_LABEL: Record<string, string> = {
  'macos-dictionary': 'macOS Dictionary',
  'local-lexicon': 'Built-in lexicon',
  llm: 'AI',
  none: 'No dictionary entry',
};

interface Props {
  lookup: LookupState;
  inDeck: boolean;
  onSave: () => void;
  onExpand: () => void;
  onClose: () => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

export function LookupCard({
  lookup,
  inDeck,
  onSave,
  onExpand,
  onClose,
  onPointerEnter,
  onPointerLeave,
}: Props) {
  const { definition, explanation, mode } = lookup;
  const synonyms = [
    ...new Set([...(explanation?.synonyms ?? []), ...(definition?.synonyms ?? [])]),
  ];
  const canSave = !!(definition?.definition || explanation?.explanation);

  return (
    <Popover
      x={lookup.x}
      y={lookup.y}
      gap={6}
      className={`lookup lookup-${mode}`}
      onClose={onClose}
      label={`Definition of ${lookup.word}`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <header className="card-header">
        <h3>{lookup.word}</h3>
        {definition?.partOfSpeech && <span className="pos">{definition.partOfSpeech}</span>}
        {definition?.pronunciation && <span className="pron">/{definition.pronunciation}/</span>}
      </header>

      {!definition ? (
        <p className="muted">Looking up…</p>
      ) : definition.definition ? (
        <p>{definition.definition}</p>
      ) : (
        mode === 'peek' && <p className="muted">No dictionary entry.</p>
      )}

      {mode === 'full' && (
        <section className="explanation">
          <h4>In your sentence</h4>
          {lookup.explaining ? (
            <p className="muted shimmer">Thinking about the context…</p>
          ) : explanation ? (
            <p>{explanation.explanation}</p>
          ) : (
            <p className="muted">Contextual explanation unavailable (no AI provider reachable).</p>
          )}
        </section>
      )}

      {synonyms.length > 0 && (
        <div className="chips">
          {synonyms.map((s) => (
            <span key={s} className="chip">
              {s}
            </span>
          ))}
        </div>
      )}

      <footer className="card-footer">
        <span className="muted small">
          {definition && SOURCE_LABEL[definition.source]}
          {lookup.definitionMs !== null && ` · ${lookup.definitionMs} ms`}
          {explanation && ` · ${explanation.provider}`}
        </span>
        <span className="card-actions">
          {mode === 'peek' && (
            <button className="ghost small" onClick={onExpand}>
              Explain in context
            </button>
          )}
          <button className="primary" disabled={!canSave || inDeck} onClick={onSave}>
            {inDeck ? 'Saved ✓' : 'Save to review'}
          </button>
        </span>
      </footer>
    </Popover>
  );
}
