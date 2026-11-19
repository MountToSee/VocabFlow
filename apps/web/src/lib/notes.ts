import { readJson, writeJson } from './storage';

export interface Note {
  id: string;
  markdown: string;
  createdAt: number;
  updatedAt: number;
}

const KEY = 'vocabflow:notes:v1';

const WELCOME = `# Welcome to VocabFlow

Write freely here. VocabFlow checks your writing as you type and turns it into study material.

- Grammar and style hints appear as underlines. Click one to see suggestions.
- Double-click any word to look it up in context, then save it to your study deck.
- Press Ctrl/Cmd + . to toggle focus mode.

Try it: i think this sentence have a error, and the weather was very good yesterday.
`;

export function newNote(markdown = ''): Note {
  const now = Date.now();
  return { id: crypto.randomUUID(), markdown, createdAt: now, updatedAt: now };
}

export function loadNotes(): Note[] {
  const notes = readJson<Note[]>(KEY, []);
  return notes.length > 0 ? notes : [newNote(WELCOME)];
}

export function saveNotes(notes: Note[]): void {
  writeJson(KEY, notes);
}

export function noteTitle(note: Note): string {
  const firstLine = note.markdown
    .split('\n')
    .map((l) => l.replace(/^[#>*\-\s\d.]+/, '').trim())
    .find(Boolean);
  return firstLine?.slice(0, 60) || 'Untitled';
}
