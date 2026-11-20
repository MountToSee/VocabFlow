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
  /** Opens a whole-paragraph rewrite, for when a definition alone doesn't help. */
  onRewrite?: () => void;
  onClose: () => void;
}

export function LookupCard({ lookup, inDeck, onSave, onRewrite, onClose }: Props) {
  const { definition, explanation } = lookup;
  const synonyms = [
    ...new Set([...(explanation?.synonyms ?? []), ...(definition?.synonyms ?? [])]),
  ];
  const canSave = !!(definition?.definition || explanation?.explanation);

  return (
    <Popover x={lookup.x} y={lookup.y} onClose={onClose} label={`Definition of ${lookup.word}`}>
      <header className="card-header">
        <h3>{lookup.word}</h3>
        {definition?.partOfSpeech && <span className="pos">{definition.partOfSpeech}</span>}
        {definition?.pronunciation && <span className="pron">/{definition.pronunciation}/</span>}
      </header>

      {!definition ? (
        <p className="muted">Looking up…</p>
      ) : definition.definition ? (
        <p>{definition.definition}</p>
      ) : null}

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

      {onRewrite && definition?.source === 'none' && (
        <p className="muted small">
          Not in the dictionary — see how a native speaker might phrase the whole paragraph.
        </p>
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
        <div className="actions">
          {onRewrite && (
            <button className="ghost small" onClick={onRewrite}>
              Rephrase paragraph
            </button>
          )}
          <button className="primary" disabled={!canSave || inDeck} onClick={onSave}>
            {inDeck ? 'In deck' : 'Save to deck'}
          </button>
        </div>
      </footer>
    </Popover>
  );
}
