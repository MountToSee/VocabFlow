import { initialSrsState } from '@vocabflow/shared';
import { describe, expect, it } from 'vitest';
import { gradeCard, type VocabCard } from '../src/lib/deck';
import {
  buildQueue,
  cardStage,
  checkAnswer,
  deckStats,
  forecast,
  formatInterval,
  promptFor,
  suggestedGrade,
} from '../src/lib/review';

const NOW = new Date(2026, 10, 20, 12, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

function card(overrides: Partial<VocabCard> = {}): VocabCard {
  return {
    id: Math.random().toString(36).slice(2),
    word: 'ubiquitous',
    definition: 'present everywhere',
    sentence: 'Phones are ubiquitous now.',
    noteId: 'n1',
    srs: initialSrsState(NOW - DAY),
    createdAt: NOW - DAY,
    ...overrides,
  };
}

describe('checkAnswer', () => {
  it('accepts exact answers regardless of case and punctuation', () => {
    expect(checkAnswer('Ubiquitous.', 'ubiquitous')).toBe('correct');
    expect(checkAnswer('  ubiquitous ', 'ubiquitous')).toBe('correct');
  });
  it('accepts inflected forms', () => {
    expect(checkAnswer('ubiquitously', 'ubiquitous')).toBe('correct');
    expect(checkAnswer('nuance', 'nuances')).toBe('correct');
  });
  it('treats small typos as close', () => {
    expect(checkAnswer('ubiquitus', 'ubiquitous')).toBe('close');
    expect(checkAnswer('cat', 'car')).toBe('close');
  });
  it('rejects wrong and empty answers', () => {
    expect(checkAnswer('everywhere', 'ubiquitous')).toBe('wrong');
    expect(checkAnswer('', 'ubiquitous')).toBe('wrong');
  });
  it('handles phrases and curly apostrophes', () => {
    expect(checkAnswer('take  for granted', 'take for granted')).toBe('correct');
    expect(checkAnswer('don’t', "don't")).toBe('correct');
  });
});

describe('suggestedGrade', () => {
  it('maps results to grades', () => {
    expect(suggestedGrade('correct')).toBe('good');
    expect(suggestedGrade('close')).toBe('hard');
    expect(suggestedGrade('wrong')).toBe('again');
    expect(suggestedGrade(null)).toBeNull();
  });
});

describe('promptFor', () => {
  it('uses a cloze over the saved sentence', () => {
    expect(promptFor(card())).toEqual({
      kind: 'cloze',
      text: 'Phones are _____ now.',
      hint: 'u_________',
    });
  });
  it('falls back to the definition when the word is not in the sentence', () => {
    const p = promptFor(card({ sentence: 'Something unrelated.' }));
    expect(p.kind).toBe('definition');
    expect(p.text).toBe('present everywhere');
  });
  it('hints each word of a phrase', () => {
    expect(promptFor(card({ word: 'take off', sentence: '' })).hint).toBe('t___ o__');
  });
});

describe('cardStage / buildQueue', () => {
  it('classifies new, learning and review cards', () => {
    const fresh = card();
    expect(cardStage(fresh)).toBe('new');
    expect(cardStage(gradeCard(fresh, 'again', NOW))).toBe('learning');
    expect(cardStage(gradeCard(fresh, 'good', NOW))).toBe('review');
  });

  it('orders learning, then most-overdue reviews, then new cards; skips cards not due', () => {
    const newer = card({ id: 'new2', createdAt: NOW - 1000 });
    const older = card({ id: 'new1', createdAt: NOW - 5000 });
    const learning = { ...gradeCard(card({ id: 'learn' }), 'again', NOW - DAY) };
    const review1 = gradeCard(card({ id: 'rev1' }), 'good', NOW - 2 * DAY); // due NOW - DAY
    const review2 = gradeCard(card({ id: 'rev2' }), 'good', NOW - 3 * DAY); // due NOW - 2 DAY
    const future = gradeCard(card({ id: 'future' }), 'good', NOW);
    const queue = buildQueue([newer, review1, future, older, learning, review2], NOW);
    expect(queue.map((c) => c.id)).toEqual(['learn', 'rev2', 'rev1', 'new1', 'new2']);
  });
});

describe('gradeCard', () => {
  it('tracks reviews and lapses', () => {
    const c = gradeCard(gradeCard(card(), 'again', NOW), 'good', NOW);
    expect(c.reviews).toBe(2);
    expect(c.lapses).toBe(1);
    expect(c.lastReviewedAt).toBe(NOW);
  });
});

describe('formatInterval', () => {
  it('formats minutes, hours, days and months', () => {
    expect(formatInterval(NOW + 10 * 60_000, NOW)).toBe('10m');
    expect(formatInterval(NOW + 5 * 60 * 60_000, NOW)).toBe('5h');
    expect(formatInterval(NOW + 3 * DAY, NOW)).toBe('3d');
    expect(formatInterval(NOW + 90 * DAY, NOW)).toBe('3mo');
    expect(formatInterval(NOW - DAY, NOW)).toBe('1m');
  });
});

describe('forecast / deckStats', () => {
  it('buckets due dates by day, counting overdue cards as today', () => {
    const deck = [
      card(),
      gradeCard(card(), 'good', NOW), // +1d
      gradeCard(gradeCard(card(), 'good', NOW), 'good', NOW), // +3d
      card({ srs: { ...initialSrsState(), dueAt: NOW + 30 * DAY } }),
    ];
    expect(forecast(deck, NOW)).toEqual([1, 1, 0, 1, 0, 0, 0]);
    expect(deckStats(deck, NOW)).toEqual({ total: 4, due: 1, new: 2, learning: 0, review: 2 });
  });
});
