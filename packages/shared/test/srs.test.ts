import { describe, expect, it } from 'vitest';
import { initialSrsState, isDue, review } from '../src/srs.js';

const DAY = 24 * 60 * 60 * 1000;

describe('spaced repetition', () => {
  it('grows intervals on successful reviews', () => {
    const now = 0;
    let s = initialSrsState(now);
    s = review(s, 'good', now);
    expect(s.interval).toBe(1);
    s = review(s, 'good', now);
    expect(s.interval).toBe(3);
    s = review(s, 'good', now);
    expect(s.interval).toBeGreaterThan(3);
    expect(s.dueAt).toBe(s.interval * DAY);
  });

  it('resets on a failed review and never drops ease below 1.3', () => {
    let s = initialSrsState(0);
    for (let i = 0; i < 10; i++) s = review(s, 'again', 0);
    expect(s.repetitions).toBe(0);
    expect(s.ease).toBe(1.3);
    expect(isDue(s, 10 * 60 * 1000)).toBe(true);
  });
});
