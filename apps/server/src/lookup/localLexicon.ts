import type { Definition } from '@vocabflow/shared';
import type { DefinitionProvider } from './types.js';

type Entry = [partOfSpeech: string, definition: string, synonyms: string[]];

/**
 * Tiny bundled lexicon so lookups work offline on non-macOS dev machines and in tests.
 * In the desktop build this is superseded by the system dictionary.
 */
const LEXICON: Record<string, Entry> = {
  ubiquitous: [
    'adjective',
    'present, appearing, or found everywhere.',
    ['omnipresent', 'pervasive', 'universal'],
  ],
  ephemeral: [
    'adjective',
    'lasting for a very short time.',
    ['fleeting', 'transient', 'momentary'],
  ],
  serendipity: [
    'noun',
    'the occurrence of events by chance in a happy or beneficial way.',
    ['chance', 'fluke', 'luck'],
  ],
  meticulous: [
    'adjective',
    'showing great attention to detail; very careful and precise.',
    ['careful', 'scrupulous', 'thorough'],
  ],
  resilient: [
    'adjective',
    'able to recover quickly from difficult conditions.',
    ['tough', 'hardy', 'adaptable'],
  ],
  pragmatic: [
    'adjective',
    'dealing with things sensibly and realistically.',
    ['practical', 'realistic', 'sensible'],
  ],
  eloquent: [
    'adjective',
    'fluent or persuasive in speaking or writing.',
    ['articulate', 'expressive', 'fluent'],
  ],
  ambiguous: [
    'adjective',
    'open to more than one interpretation.',
    ['equivocal', 'vague', 'unclear'],
  ],
  candid: ['adjective', 'truthful and straightforward; frank.', ['frank', 'open', 'honest']],
  diligent: [
    'adjective',
    "having or showing care and conscientiousness in one's work.",
    ['industrious', 'assiduous', 'conscientious'],
  ],
  elated: ['adjective', 'ecstatically happy.', ['overjoyed', 'thrilled', 'jubilant']],
  frugal: [
    'adjective',
    'sparing or economical with regard to money or food.',
    ['thrifty', 'economical', 'sparing'],
  ],
  gregarious: ['adjective', 'fond of company; sociable.', ['sociable', 'outgoing', 'convivial']],
  inevitable: [
    'adjective',
    'certain to happen; unavoidable.',
    ['unavoidable', 'inescapable', 'certain'],
  ],
  lucid: [
    'adjective',
    'expressed clearly; easy to understand.',
    ['clear', 'coherent', 'articulate'],
  ],
  mundane: [
    'adjective',
    'lacking interest or excitement; dull.',
    ['ordinary', 'humdrum', 'routine'],
  ],
  nuance: [
    'noun',
    'a subtle difference in or shade of meaning, expression, or sound.',
    ['subtlety', 'shade', 'nicety'],
  ],
  obsolete: [
    'adjective',
    'no longer produced or used; out of date.',
    ['outdated', 'antiquated', 'defunct'],
  ],
  paradigm: [
    'noun',
    'a typical example, pattern, or model of something.',
    ['model', 'pattern', 'archetype'],
  ],
  quintessential: [
    'adjective',
    'representing the most perfect or typical example of a quality or class.',
    ['typical', 'archetypal', 'classic'],
  ],
  scrutinize: [
    'verb',
    'examine or inspect closely and thoroughly.',
    ['examine', 'inspect', 'study'],
  ],
  tenacious: [
    'adjective',
    'tending to keep a firm hold of something; persistent.',
    ['persistent', 'determined', 'dogged'],
  ],
  verbose: [
    'adjective',
    'using or expressed in more words than are needed.',
    ['wordy', 'long-winded', 'prolix'],
  ],
  whimsical: ['adjective', 'playfully quaint or fanciful.', ['fanciful', 'playful', 'quirky']],
  zealous: [
    'adjective',
    'having or showing great energy or enthusiasm in pursuit of a cause.',
    ['fervent', 'ardent', 'passionate'],
  ],
  arduous: [
    'adjective',
    'involving or requiring strenuous effort; difficult and tiring.',
    ['onerous', 'strenuous', 'grueling'],
  ],
  benevolent: ['adjective', 'well meaning and kindly.', ['kind', 'kindly', 'charitable']],
  concise: [
    'adjective',
    'giving a lot of information clearly and in a few words.',
    ['succinct', 'brief', 'terse'],
  ],
  vocabulary: [
    'noun',
    'the body of words used in a particular language or by a person.',
    ['lexicon', 'wordstock', 'language'],
  ],
};

export class LocalLexiconProvider implements DefinitionProvider {
  readonly name = 'local-lexicon';
  readonly available = true;

  async lookup(word: string): Promise<Definition | null> {
    const entry = LEXICON[word.toLowerCase()];
    if (!entry) return null;
    const [partOfSpeech, definition, synonyms] = entry;
    return { word, source: 'local-lexicon', partOfSpeech, definition, synonyms };
  }
}
