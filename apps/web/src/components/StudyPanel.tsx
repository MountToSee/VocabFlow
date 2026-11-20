import { type ReviewGrade } from '@vocabflow/shared';
import { useMemo, useState } from 'react';
import type { VocabCard } from '../lib/deck';
import { cardStage, deckStats, forecast } from '../lib/review';
import { ReviewSession } from './ReviewSession';

interface Props {
  deck: VocabCard[];
  onGrade: (card: VocabCard, grade: ReviewGrade) => void;
  onRemove: (card: VocabCard) => void;
}

const DAY_LABELS = ['Today', 'Tmrw'];

export function StudyPanel({ deck, onGrade, onRemove }: Props) {
  const [reviewing, setReviewing] = useState(false);
  const stats = useMemo(() => deckStats(deck), [deck]);
  const upcoming = useMemo(() => forecast(deck), [deck]);
  const peak = Math.max(1, ...upcoming);

  return (
    <div className="study">
      <div className="deck-stats">
        <div>
          <strong>{stats.due}</strong>
          <span className="muted small">due</span>
        </div>
        <div>
          <strong>{stats.new}</strong>
          <span className="muted small">new</span>
        </div>
        <div>
          <strong>{stats.learning}</strong>
          <span className="muted small">learning</span>
        </div>
        <div>
          <strong>{stats.review}</strong>
          <span className="muted small">mature</span>
        </div>
      </div>

      <button
        className="primary start-review"
        disabled={stats.due === 0}
        onClick={() => setReviewing(true)}
      >
        {stats.due > 0 ? `Review ${stats.due} card${stats.due === 1 ? '' : 's'}` : 'Nothing due'}
      </button>

      {deck.length === 0 ? (
        <p className="muted empty">
          Look up a word in your note and save it to start your deck. You&apos;ll be quizzed on the
          sentence you wrote it in.
        </p>
      ) : (
        <>
          <div className="forecast" aria-label="Reviews due over the next 7 days">
            {upcoming.map((n, i) => (
              <div key={i} className="forecast-day" title={`${n} due`}>
                <div className="forecast-bar" style={{ height: `${(n / peak) * 100}%` }} />
                <span className="muted small">{DAY_LABELS[i] ?? `+${i}d`}</span>
              </div>
            ))}
          </div>

          <details className="deck-list">
            <summary>All words ({deck.length})</summary>
            <ul>
              {deck.map((c) => (
                <li key={c.id}>
                  <strong>{c.word}</strong>
                  <span className="muted small">
                    {' '}
                    · {cardStage(c)} · next {new Date(c.srs.dueAt).toLocaleDateString()}
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
        </>
      )}

      {reviewing && (
        <ReviewSession deck={deck} onGrade={onGrade} onClose={() => setReviewing(false)} />
      )}
    </div>
  );
}
