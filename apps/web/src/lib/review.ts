import { isDue, type ReviewGrade } from '@vocabflow/shared';
import { clozeSentence, type VocabCard } from './deck';

const DAY_MS = 24 * 60 * 60 * 1000;

export type CardStage = 'new' | 'learning' | 'review';

/** New: never graded. Learning: graded but not yet past its first interval. Review: graduated. */
export function cardStage(card: VocabCard): CardStage {
  if (!card.reviews) return 'new';
  return card.srs.repetitions === 0 ? 'learning' : 'review';
}

/**
 * Due cards for a session: learning cards first (they are short-term), then overdue reviews
 * (most overdue first), then new cards in the order they were saved.
 */
export function buildQueue(deck: VocabCard[], now: number = Date.now()): VocabCard[] {
  const rank: Record<CardStage, number> = { learning: 0, review: 1, new: 2 };
  return deck
    .filter((c) => isDue(c.srs, now))
    .sort((a, b) => {
      const sa = cardStage(a);
      const sb = cardStage(b);
      if (sa !== sb) return rank[sa] - rank[sb];
      return sa === 'new' ? a.createdAt - b.createdAt : a.srs.dueAt - b.srs.dueAt;
    });
}

export interface ReviewPrompt {
  kind: 'cloze' | 'definition';
  /** Sentence from the user's note with the word blanked, or the definition. */
  text: string;
  /** First letter plus blanks, e.g. "u_________". */
  hint: string;
}

/** Prefers a cloze over the user's own sentence; falls back to the definition. */
export function promptFor(card: VocabCard): ReviewPrompt {
  const hint = card.word
    .split(/(\s+)/)
    .map((part) => (/\s/.test(part) ? part : part[0] + '_'.repeat(Math.max(0, part.length - 1))))
    .join('');
  const cloze = card.sentence ? clozeSentence(card.sentence, card.word) : '';
  if (cloze && cloze !== card.sentence) return { kind: 'cloze', text: cloze, hint };
  return { kind: 'definition', text: card.definition, hint };
}

export type AnswerResult = 'correct' | 'close' | 'wrong';

const normalize = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^\p{L}\p{M}'\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

const INFLECTION = /^(s|es|d|ed|ing|ly|er|est|'s)$/;

/**
 * Grades a typed answer. Inflected forms of the word ("ubiquitously" for "ubiquitous") count as
 * correct, since the cloze blanks inflections too; one typo per ~5 letters counts as close.
 */
export function checkAnswer(input: string, word: string): AnswerResult {
  const a = normalize(input);
  const w = normalize(word);
  if (!a) return 'wrong';
  if (a === w) return 'correct';
  if (a.startsWith(w) && INFLECTION.test(a.slice(w.length))) return 'correct';
  if (w.startsWith(a) && INFLECTION.test(w.slice(a.length))) return 'correct';
  const tolerance = Math.max(1, Math.floor(w.length / 5));
  return levenshtein(a, w) <= tolerance ? 'close' : 'wrong';
}

export function suggestedGrade(result: AnswerResult | null): ReviewGrade | null {
  if (result === 'correct') return 'good';
  if (result === 'close') return 'hard';
  if (result === 'wrong') return 'again';
  return null;
}

/** Human-readable time until the next review for a grade, e.g. "10m", "1d", "3d". */
export function formatInterval(dueAt: number, now: number = Date.now()): string {
  const ms = Math.max(0, dueAt - now);
  if (ms < 60 * 60 * 1000) return `${Math.max(1, Math.round(ms / 60_000))}m`;
  if (ms < DAY_MS) return `${Math.round(ms / (60 * 60 * 1000))}h`;
  const days = Math.round(ms / DAY_MS);
  return days < 31 ? `${days}d` : `${Math.round(days / 30)}mo`;
}

/** Number of cards due on each of the next `days` days (index 0 = due now or later today). */
export function forecast(deck: VocabCard[], now: number = Date.now(), days = 7): number[] {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const counts = new Array<number>(days).fill(0);
  for (const card of deck) {
    const day = Math.max(0, Math.floor((card.srs.dueAt - startOfToday) / DAY_MS));
    if (day < days) counts[day]!++;
  }
  return counts;
}

export function deckStats(deck: VocabCard[], now: number = Date.now()) {
  const stats = { total: deck.length, due: 0, new: 0, learning: 0, review: 0 };
  for (const card of deck) {
    stats[cardStage(card)]++;
    if (isDue(card.srs, now)) stats.due++;
  }
  return stats;
}
