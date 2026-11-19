import { isDue, type ReviewGrade } from '@vocabflow/shared';
import { useMemo, useState } from 'react';
import { clozeSentence, type VocabCard } from '../lib/deck';

interface Props {
  deck: VocabCard[];
  onGrade: (card: VocabCard, grade: ReviewGrade) => void;
  onRemove: (card: VocabCard) => void;
}

const GRADES: ReviewGrade[] = ['again', 'hard', 'good', 'easy'];

export function StudyPanel({ deck, onGrade, onRemove }: Props) {
  const [revealed, setRevealed] = useState(false);
  const due = useMemo(() => deck.filter((c) => isDue(c.srs)), [deck]);
  const card = due[0];

  return (
    <div className="study">
      <p className="muted small">
        {deck.length} word{deck.length === 1 ? '' : 's'} in your deck · {due.length} due
      </p>

      {card ? (
        <div className="study-card">
          <p className="cloze">“{clozeSentence(card.sentence, card.word)}”</p>
          {revealed ? (
            <>
              <h3>{card.word}</h3>
              <p>{card.definition}</p>
              <div className="grades">
                {GRADES.map((g) => (
                  <button
                    key={g}
                    className={`grade grade-${g}`}
                    onClick={() => {
                      setRevealed(false);
                      onGrade(card, g);
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button className="primary" onClick={() => setRevealed(true)}>
              Reveal
            </button>
          )}
        </div>
      ) : (
        <p className="muted empty">
          {deck.length === 0
            ? 'Double-click a word in your note and save it to start your deck.'
            : 'All caught up. New reviews will appear when they are due.'}
        </p>
      )}

      {deck.length > 0 && (
        <details className="deck-list">
          <summary>All words</summary>
          <ul>
            {deck.map((c) => (
              <li key={c.id}>
                <strong>{c.word}</strong>
                <span className="muted small">
                  {' '}
                  · next {new Date(c.srs.dueAt).toLocaleDateString()}
                </span>
                <button
                  className="ghost small"
                  onClick={() => onRemove(c)}
                  aria-label={`Remove ${c.word}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
