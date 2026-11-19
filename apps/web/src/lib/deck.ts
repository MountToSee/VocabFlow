import { initialSrsState, review, type ReviewGrade, type SrsState } from '@vocabflow/shared';
import { readJson, writeJson } from './storage';

/** A vocabulary card whose example sentence comes from the user's own writing. */
export interface VocabCard {
  id: string;
  word: string;
  definition: string;
  sentence: string;
  noteId: string;
  srs: SrsState;
  createdAt: number;
}

const KEY = 'vocabflow:deck:v1';

export function loadDeck(): VocabCard[] {
  return readJson<VocabCard[]>(KEY, []);
}

export function saveDeck(deck: VocabCard[]): void {
  writeJson(KEY, deck);
}

export function createCard(input: Omit<VocabCard, 'id' | 'srs' | 'createdAt'>): VocabCard {
  return { ...input, id: crypto.randomUUID(), srs: initialSrsState(), createdAt: Date.now() };
}

export function gradeCard(card: VocabCard, grade: ReviewGrade): VocabCard {
  return { ...card, srs: review(card.srs, grade) };
}

/** Blanks out the word (and simple inflections) in the sentence for cloze review. */
export function clozeSentence(sentence: string, word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return sentence.replace(new RegExp(`\\b${escaped}\\w*`, 'gi'), '_____');
}
