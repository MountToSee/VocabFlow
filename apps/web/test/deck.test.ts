import { describe, expect, it } from 'vitest';
import { clozeSentence } from '../src/lib/deck';

describe('clozeSentence', () => {
  it('blanks the word and its inflections', () => {
    expect(clozeSentence('She scrutinized every scrutiny.', 'scrutin')).toBe(
      'She _____ every _____.',
    );
    expect(clozeSentence('Phones are Ubiquitous now.', 'ubiquitous')).toBe('Phones are _____ now.');
  });
});
