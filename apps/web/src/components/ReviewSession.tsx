import { review, type ReviewGrade } from '@vocabflow/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VocabCard } from '../lib/deck';
import {
  buildQueue,
  cardStage,
  checkAnswer,
  formatInterval,
  promptFor,
  suggestedGrade,
  type AnswerResult,
} from '../lib/review';

interface Props {
  deck: VocabCard[];
  onGrade: (card: VocabCard, grade: ReviewGrade) => void;
  onClose: () => void;
}

const GRADES: ReviewGrade[] = ['again', 'hard', 'good', 'easy'];

const RESULT_LABEL: Record<AnswerResult, string> = {
  correct: 'Correct',
  close: 'Almost',
  wrong: 'Not quite',
};

interface Tally {
  reviewed: number;
  correct: number;
  again: number;
}

/** Full-screen flashcard session over the cards that are due now. */
export function ReviewSession({ deck, onGrade, onClose }: Props) {
  // The queue is fixed when the session starts; "again" cards go to the back of it.
  const [queue, setQueue] = useState<string[]>(() => buildQueue(deck).map((c) => c.id));
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState<Tally>({ reviewed: 0, correct: 0, again: 0 });
  const input = useRef<HTMLInputElement>(null);
  const firstGrade = useRef<HTMLButtonElement>(null);

  const card = useMemo(() => deck.find((c) => c.id === queue[0]), [deck, queue]);
  const prompt = card ? promptFor(card) : null;
  const suggested = suggestedGrade(result);

  useEffect(() => {
    if (!card) return;
    if (revealed) firstGrade.current?.focus();
    else input.current?.focus();
  }, [card, revealed]);

  const reveal = () => {
    if (!card) return;
    if (answer.trim()) setResult(checkAnswer(answer, card.word));
    setRevealed(true);
  };

  const grade = (g: ReviewGrade) => {
    if (!card) return;
    onGrade(card, g);
    setTally((t) => ({
      reviewed: t.reviewed + 1,
      correct: t.correct + (g === 'again' ? 0 : 1),
      again: t.again + (g === 'again' ? 1 : 0),
    }));
    setQueue(([head, ...rest]) => (g === 'again' && head ? [...rest, head] : rest));
    setAnswer('');
    setResult(null);
    setRevealed(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (!card || !revealed || e.metaKey || e.ctrlKey || e.altKey) return;
      const index = ['1', '2', '3', '4'].indexOf(e.key);
      if (index >= 0) {
        e.preventDefault();
        grade(GRADES[index]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const now = Date.now();

  return (
    <div className="review-overlay" role="dialog" aria-modal="true" aria-label="Review session">
      <div className="review">
        <header className="review-header">
          <span className="muted small">
            {card ? `${queue.length} left · ${tally.reviewed} reviewed` : 'Session complete'}
          </span>
          <button className="ghost small" onClick={onClose} title="End session (Esc)">
            Done
          </button>
        </header>

        {card && prompt ? (
          <div className="review-card">
            <span className={`stage stage-${cardStage(card)}`}>{cardStage(card)}</span>
            <p className="muted small">
              {prompt.kind === 'cloze'
                ? 'Fill in the word you used:'
                : 'Which word did you save for this meaning?'}
            </p>
            <p className={prompt.kind === 'cloze' ? 'cloze review-prompt' : 'review-prompt'}>
              {prompt.kind === 'cloze' ? `“${prompt.text}”` : prompt.text}
            </p>

            {!revealed ? (
              <form
                className="review-answer"
                onSubmit={(e) => {
                  e.preventDefault();
                  reveal();
                }}
              >
                <input
                  ref={input}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={prompt.hint}
                  aria-label="Your answer"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                <button type="submit" className="primary">
                  {answer.trim() ? 'Check' : 'Show answer'}
                </button>
              </form>
            ) : (
              <>
                {result && (
                  <p className={`answer-result result-${result}`} role="status">
                    {RESULT_LABEL[result]}
                    {result !== 'correct' && (
                      <>
                        {' '}
                        — you wrote <em>{answer.trim()}</em>
                      </>
                    )}
                  </p>
                )}
                <h3>{card.word}</h3>
                <p>{card.definition}</p>
                {prompt.kind === 'definition' && card.sentence && (
                  <p className="muted cloze">“{card.sentence}”</p>
                )}
                <div className="grades">
                  {GRADES.map((g, i) => (
                    <button
                      key={g}
                      ref={g === (suggested ?? 'good') ? firstGrade : undefined}
                      className={`grade grade-${g} ${g === suggested ? 'suggested' : ''}`}
                      onClick={() => grade(g)}
                      title={`Press ${i + 1}`}
                    >
                      <span>{g}</span>
                      <span className="muted small">
                        {formatInterval(review(card.srs, g, now).dueAt, now)}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="review-card review-summary">
            <h3>{tally.reviewed === 0 ? 'Nothing due' : 'Nice work'}</h3>
            {tally.reviewed > 0 ? (
              <p>
                {tally.reviewed} review{tally.reviewed === 1 ? '' : 's'} ·{' '}
                {Math.round((tally.correct / tally.reviewed) * 100)}% remembered
                {tally.again > 0 && ` · ${tally.again} to relearn`}
              </p>
            ) : (
              <p className="muted">New reviews will appear when they are due.</p>
            )}
            <button className="primary" onClick={onClose}>
              Back to writing
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
