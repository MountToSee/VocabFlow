import type { RewriteKind, RewriteSuggestion } from '@vocabflow/shared';

interface Entry {
  pattern: RegExp;
  replacement: string | ((m: RegExpMatchArray) => string);
  kind: RewriteKind;
  explanation: string;
}

/** Group 1 of a "very + adjective" match → a single stronger adjective. */
const INTENSIFIED: Record<string, string> = {
  big: 'huge',
  small: 'tiny',
  tired: 'exhausted',
  hungry: 'starving',
  happy: 'delighted',
  sad: 'heartbroken',
  angry: 'furious',
  scared: 'terrified',
  surprised: 'astonished',
  important: 'crucial',
  difficult: 'challenging',
  easy: 'effortless',
  good: 'excellent',
  bad: 'terrible',
  beautiful: 'stunning',
  old: 'ancient',
  cold: 'freezing',
  hot: 'scorching',
  busy: 'swamped',
  interesting: 'fascinating',
  clean: 'spotless',
  quiet: 'silent',
  fast: 'rapid',
  smart: 'brilliant',
};

const w = (phrase: string) => new RegExp(`\\b${phrase}\\b`, 'gi');

/**
 * Offline phrasebook of common learner phrasings and their natural equivalents. Used when no
 * LLM is reachable, and as an instant first pass before the AI rewrite arrives.
 */
const ENTRIES: Entry[] = [
  {
    pattern: /\bvery (\w+)\b/gi,
    replacement: (m) => INTENSIFIED[m[1]!.toLowerCase()] ?? m[0],
    kind: 'phrasing',
    explanation: 'One vivid adjective usually sounds more natural than "very" + a plain one.',
  },
  {
    pattern: w('in the other hand'),
    replacement: 'on the other hand',
    kind: 'idiom',
    explanation: 'The fixed expression is "on the other hand".',
  },
  {
    pattern: w('make a photo'),
    replacement: 'take a photo',
    kind: 'collocation',
    explanation: 'In English you "take" a photo.',
  },
  {
    pattern: w('make a decision about'),
    replacement: 'decide on',
    kind: 'concision',
    explanation: '"Decide on" says the same thing in fewer words.',
  },
  {
    pattern: w('do a mistake'),
    replacement: 'make a mistake',
    kind: 'collocation',
    explanation: 'In English you "make" (not "do") a mistake.',
  },
  {
    pattern: w('(?:say|tell) (?:me )?my opinion'),
    replacement: 'give my opinion',
    kind: 'collocation',
    explanation: 'The usual collocation is "give my opinion".',
  },
  {
    pattern: w('discuss about'),
    replacement: 'discuss',
    kind: 'grammar',
    explanation: '"Discuss" takes a direct object — no "about".',
  },
  {
    pattern: w('explain me'),
    replacement: 'explain to me',
    kind: 'grammar',
    explanation: 'You explain something *to* someone.',
  },
  {
    pattern: w('depends of'),
    replacement: 'depends on',
    kind: 'collocation',
    explanation: 'The preposition after "depend" is "on".',
  },
  {
    pattern: w('married with'),
    replacement: 'married to',
    kind: 'collocation',
    explanation: 'You are married *to* someone.',
  },
  {
    pattern: w('according to me'),
    replacement: 'in my opinion',
    kind: 'idiom',
    explanation:
      '"According to" introduces someone else\'s view; for your own, say "in my opinion".',
  },
  {
    pattern: w('a lot of times'),
    replacement: 'often',
    kind: 'concision',
    explanation: '"Often" is shorter and more natural.',
  },
  {
    pattern: w('in this moment'),
    replacement: 'at the moment',
    kind: 'idiom',
    explanation: 'The natural phrase is "at the moment" (or "right now").',
  },
  {
    pattern: w('since many years'),
    replacement: 'for many years',
    kind: 'grammar',
    explanation: 'Use "for" with a length of time and "since" with a starting point.',
  },
  {
    pattern: w('it is raining cats and dogs'),
    replacement: "it's pouring",
    kind: 'idiom',
    explanation: '"Raining cats and dogs" is dated; most speakers say "it\'s pouring".',
  },
  {
    pattern: w('at the end'),
    replacement: 'in the end',
    kind: 'idiom',
    explanation: '"In the end" means "finally / eventually"; "at the end" needs "of …" after it.',
  },
  {
    pattern: w('in order to'),
    replacement: 'to',
    kind: 'concision',
    explanation: '"To" alone usually carries the same meaning.',
  },
  {
    pattern: w('due to the fact that'),
    replacement: 'because',
    kind: 'concision',
    explanation: '"Because" is clearer and shorter.',
  },
  {
    pattern: w('at this point in time'),
    replacement: 'now',
    kind: 'concision',
    explanation: '"Now" says it in one word.',
  },
  {
    pattern: w('each and every'),
    replacement: 'every',
    kind: 'concision',
    explanation: '"Each and every" is redundant in most writing.',
  },
  {
    pattern: w('I am agree'),
    replacement: 'I agree',
    kind: 'grammar',
    explanation: '"Agree" is a verb, so it doesn\'t need "am".',
  },
  {
    pattern: w('have a look on'),
    replacement: 'have a look at',
    kind: 'collocation',
    explanation: 'You have a look *at* something.',
  },
  {
    pattern: w('take a decision'),
    replacement: 'make a decision',
    kind: 'collocation',
    explanation: '"Make a decision" is the more common collocation in English.',
  },
];

function matchCase(replacement: string, original: string): string {
  const first = original[0];
  if (first && /\p{Lu}/u.test(first) && original !== original.toUpperCase()) {
    return replacement[0]!.toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** Non-overlapping phrasebook suggestions for a paragraph, in text order. */
export function phrasebookSuggestions(paragraph: string): RewriteSuggestion[] {
  const found: RewriteSuggestion[] = [];
  for (const entry of ENTRIES) {
    for (const m of paragraph.matchAll(entry.pattern)) {
      const original = m[0];
      const raw = typeof entry.replacement === 'string' ? entry.replacement : entry.replacement(m);
      if (raw.toLowerCase() === original.toLowerCase()) continue;
      const start = m.index!;
      const end = start + original.length;
      if (found.some((f) => start < f.end && f.start < end)) continue;
      found.push({
        start,
        end,
        original,
        replacement: matchCase(raw, original),
        kind: entry.kind,
        explanation: entry.explanation,
      });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}
