import { hashString, type Issue, type IssueKind } from '@vocabflow/shared';

/**
 * Instant, offline rule-based checks. These run on every keystroke batch and give the
 * user feedback before (or without) any LLM round-trip.
 */
interface Rule {
  id: string;
  kind: IssueKind;
  pattern: RegExp;
  /** Group index of the span to flag (defaults to whole match). */
  group?: number;
  check?: (match: RegExpMatchArray, text: string) => boolean;
  message: (match: RegExpMatchArray) => string;
  suggest: (match: RegExpMatchArray) => string[];
}

const AN_EXCEPTIONS = /^(?:uni|use|usu|uti|eu|one|once|ur)/i;
const A_EXCEPTIONS = /^(?:hour|honest|honou?r|heir)/i;

const CONFUSIONS: Record<string, { fix: string; why: string }> = {
  'could of': { fix: 'could have', why: '"could of" is a mishearing of "could have".' },
  'should of': { fix: 'should have', why: '"should of" is a mishearing of "should have".' },
  'would of': { fix: 'would have', why: '"would of" is a mishearing of "would have".' },
  'must of': { fix: 'must have', why: '"must of" is a mishearing of "must have".' },
  alot: { fix: 'a lot', why: '"a lot" is always two words.' },
  irregardless: { fix: 'regardless', why: '"irregardless" is nonstandard; use "regardless".' },
  'for all intensive purposes': {
    fix: 'for all intents and purposes',
    why: 'The idiom is "for all intents and purposes".',
  },
  'then ever': { fix: 'than ever', why: 'Use "than" for comparisons.' },
  'more then': { fix: 'more than', why: 'Use "than" for comparisons.' },
  'less then': { fix: 'less than', why: 'Use "than" for comparisons.' },
  'better then': { fix: 'better than', why: 'Use "than" for comparisons.' },
};

/** Weak intensifier + adjective → a single, more precise word (vocabulary building). */
const STRONGER_WORDS: Record<string, string[]> = {
  good: ['excellent', 'superb'],
  bad: ['terrible', 'dreadful'],
  big: ['huge', 'enormous'],
  small: ['tiny', 'minuscule'],
  happy: ['delighted', 'elated'],
  sad: ['miserable', 'sorrowful'],
  tired: ['exhausted', 'drained'],
  important: ['crucial', 'vital'],
  hard: ['arduous', 'grueling'],
  easy: ['effortless', 'straightforward'],
  interesting: ['fascinating', 'compelling'],
  scared: ['terrified', 'petrified'],
  angry: ['furious', 'livid'],
  fast: ['rapid', 'swift'],
  old: ['ancient', 'antiquated'],
  clear: ['obvious', 'evident'],
  smart: ['brilliant', 'astute'],
  beautiful: ['gorgeous', 'stunning'],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const RULES: Rule[] = [
  {
    id: 'repeated-word',
    kind: 'grammar',
    pattern: /\b([A-Za-z]+)\s+\1\b/gi,
    check: (m) => m[1]!.toLowerCase() !== 'that' && m[1]!.toLowerCase() !== 'had',
    message: (m) => `"${m[1]}" is repeated.`,
    suggest: (m) => [m[1]!],
  },
  {
    id: 'a-vs-an',
    kind: 'grammar',
    pattern: /\b(a|A)\s+([aeiouAEIOU]\w*|[hH]\w+)/g,
    check: (m) => {
      const next = m[2]!;
      if (/^[aeiou]/i.test(next)) return !AN_EXCEPTIONS.test(next);
      return A_EXCEPTIONS.test(next);
    },
    message: (m) => `Use "an" before "${m[2]}" (it starts with a vowel sound).`,
    suggest: (m) => [`${m[1] === 'A' ? 'An' : 'an'} ${m[2]}`],
  },
  {
    id: 'an-vs-a',
    kind: 'grammar',
    pattern: /\b(an|An)\s+([b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z]\w*|[uU]\w+|[eE]u\w*|[oO]ne\w*)/g,
    check: (m) => {
      const next = m[2]!;
      if (/^[aeiou]/i.test(next)) return AN_EXCEPTIONS.test(next);
      return !A_EXCEPTIONS.test(next);
    },
    message: (m) => `Use "a" before "${m[2]}" (it starts with a consonant sound).`,
    suggest: (m) => [`${m[1] === 'An' ? 'A' : 'a'} ${m[2]}`],
  },
  {
    id: 'lowercase-i',
    kind: 'grammar',
    pattern: /(?<![\w'])i(?=(?:'m|'ve|'ll|'d)?(?![\w']))/g,
    message: () => 'The pronoun "I" is always capitalized.',
    suggest: () => ['I'],
  },
  {
    id: 'sentence-capital',
    kind: 'grammar',
    pattern: /(?:^|[.!?]\s+)([a-z])/g,
    group: 1,
    check: (m, text) => {
      // Ignore common abbreviations like "e.g. something".
      const before = text.slice(Math.max(0, m.index! - 5), m.index! + 1);
      return !/(?:e\.g|i\.e|etc|vs)\.$/i.test(before);
    },
    message: () => 'Sentences should start with a capital letter.',
    suggest: (m) => [m[1]!.toUpperCase()],
  },
  {
    id: 'space-before-punctuation',
    kind: 'punctuation',
    pattern: /([A-Za-z])( +)([,.;:!?])(?=\s|$)/g,
    group: 2,
    message: () => 'Remove the space before punctuation.',
    suggest: () => [''],
  },
  {
    id: 'double-space',
    kind: 'style',
    pattern: /(?<=\S) {2,}(?=\S)/g,
    message: () => 'Multiple spaces between words.',
    suggest: () => [' '],
  },
  {
    id: 'confusion',
    kind: 'word-choice',
    pattern: new RegExp(`\\b(?:${Object.keys(CONFUSIONS).map(escapeRe).join('|')})\\b`, 'gi'),
    message: (m) => CONFUSIONS[m[0].toLowerCase()]!.why,
    suggest: (m) => [matchCase(CONFUSIONS[m[0].toLowerCase()]!.fix, m[0])],
  },
  {
    id: 'weak-intensifier',
    kind: 'style',
    pattern: new RegExp(
      `\\b(?:very|really|so)\\s+(${Object.keys(STRONGER_WORDS).join('|')})\\b`,
      'gi',
    ),
    message: (m) => `Try a single, more precise word instead of "${m[0]}".`,
    suggest: (m) => STRONGER_WORDS[m[1]!.toLowerCase()]!.map((w) => matchCase(w, m[0])),
  },
];

function matchCase(replacement: string, original: string): string {
  if (original[0] && original[0] === original[0].toUpperCase() && /[a-z]/i.test(original[0])) {
    return replacement[0]!.toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

export function runHeuristics(text: string): Issue[] {
  const issues: Issue[] = [];
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.pattern)) {
      if (rule.check && !rule.check(m, text)) continue;
      const groupText = rule.group !== undefined ? m[rule.group] : m[0];
      if (groupText === undefined) continue;
      const offsetInMatch = rule.group !== undefined ? m[0].lastIndexOf(groupText) : 0;
      const start = m.index! + offsetInMatch;
      const end = start + groupText.length;
      issues.push({
        id: `h-${rule.id}-${start}-${hashString(groupText)}`,
        kind: rule.kind,
        source: 'heuristic',
        start,
        end,
        original: groupText,
        message: rule.message(m),
        suggestions: rule.suggest(m),
      });
    }
  }
  return dedupeOverlaps(issues);
}

/** Keeps the first issue when two issues overlap (rules are ordered by priority). */
export function dedupeOverlaps(issues: Issue[]): Issue[] {
  const kept: Issue[] = [];
  for (const issue of issues) {
    if (!kept.some((k) => issue.start < k.end && k.start < issue.end)) kept.push(issue);
  }
  return kept.sort((a, b) => a.start - b.start);
}
