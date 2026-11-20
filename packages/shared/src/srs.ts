/**
 * Spaced-repetition scheduling (SM-2 variant) for vocabulary cards built from the
 * user's own sentences.
 */
export interface SrsState {
  /** Days until next review. */
  interval: number;
  /** Ease factor, >= 1.3. */
  ease: number;
  repetitions: number;
  /** Epoch ms when the card is next due. */
  dueAt: number;
}

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

const DAY_MS = 24 * 60 * 60 * 1000;

const QUALITY: Record<ReviewGrade, number> = { again: 1, hard: 3, good: 4, easy: 5 };

export function initialSrsState(now: number = Date.now()): SrsState {
  return { interval: 0, ease: 2.5, repetitions: 0, dueAt: now };
}

export function review(state: SrsState, grade: ReviewGrade, now: number = Date.now()): SrsState {
  const q = QUALITY[grade];
  const ease = Math.max(1.3, state.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  if (q < 3) {
    return { interval: 0, ease, repetitions: 0, dueAt: now + 10 * 60 * 1000 };
  }

  const repetitions = state.repetitions + 1;
  let interval: number;
  if (repetitions === 1) interval = grade === 'easy' ? 3 : 1;
  else if (repetitions === 2) interval = grade === 'easy' ? 4 : 3;
  else interval = Math.round(state.interval * ease * (grade === 'hard' ? 0.8 : 1));

  return { interval, ease, repetitions, dueAt: now + interval * DAY_MS };
}

export function isDue(state: SrsState, now: number = Date.now()): boolean {
  return state.dueAt <= now;
}
