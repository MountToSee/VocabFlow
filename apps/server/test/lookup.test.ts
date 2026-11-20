import { describe, expect, it } from 'vitest';
import { LatencyAwareRouter } from '../src/llm/router.js';
import { LocalLexiconProvider } from '../src/lookup/localLexicon.js';
import {
  MacOsDictionaryProvider,
  parseAppleDefinition,
  resolveHelperPath,
} from '../src/lookup/macosDictionary.js';
import { LookupPipeline } from '../src/lookup/pipeline.js';
import type { DefinitionProvider } from '../src/lookup/types.js';
import { FakeLlm } from './fakes.js';

const noRouter = new LatencyAwareRouter([], { latencyBudgetMs: 100 });

describe('parseAppleDefinition', () => {
  it('extracts pronunciation and part of speech', () => {
    const def = parseAppleDefinition(
      'serendipity',
      'serendipity | ˌserənˈdipədē | noun the occurrence and development of events by chance.',
    );
    expect(def).toMatchObject({
      source: 'macos-dictionary',
      pronunciation: 'ˌserənˈdipədē',
      partOfSpeech: 'noun',
      definition: 'the occurrence and development of events by chance.',
    });
  });

  it('returns null for empty output', () => {
    expect(parseAppleDefinition('x', '  ')).toBeNull();
  });
});

describe('MacOsDictionaryProvider', () => {
  it('is unavailable off macOS', async () => {
    const provider = new MacOsDictionaryProvider(undefined, 100, 'linux');
    expect(provider.available).toBe(false);
    expect(await provider.lookup('word')).toBeNull();
  });
});

describe('resolveHelperPath', () => {
  const built = '/repo/native/macos/DictionaryHelper/.build/release/DictionaryHelper';

  it('prefers an explicit path', () => {
    expect(resolveHelperPath('/custom/helper', '/repo', () => true)).toBe('/custom/helper');
  });

  it('finds a locally built helper from the repo root or a workspace', () => {
    const exists = (p: string) => p === built;
    expect(resolveHelperPath(undefined, '/repo', exists)).toBe(built);
    expect(resolveHelperPath(undefined, '/repo/apps/server', exists)).toBe(built);
    expect(resolveHelperPath(undefined, '/elsewhere', exists)).toBeUndefined();
  });
});

describe('LookupPipeline', () => {
  it('tries providers in order and caches the first hit', async () => {
    let nativeCalls = 0;
    const native: DefinitionProvider = {
      name: 'macos-dictionary',
      available: true,
      lookup: async (word) => {
        nativeCalls++;
        return word === 'apple'
          ? { word, source: 'macos-dictionary', definition: 'a fruit', synonyms: [] }
          : null;
      },
    };
    const pipeline = new LookupPipeline([native, new LocalLexiconProvider()], noRouter);
    expect((await pipeline.define('apple')).source).toBe('macos-dictionary');
    expect((await pipeline.define('Apple')).source).toBe('macos-dictionary');
    expect(nativeCalls).toBe(1);
    expect((await pipeline.define('ubiquitous')).source).toBe('local-lexicon');
    expect((await pipeline.define('qwertyuiop')).source).toBe('none');
  });

  it('skips unavailable providers', async () => {
    const pipeline = new LookupPipeline(
      [new MacOsDictionaryProvider(undefined, 100, 'linux'), new LocalLexiconProvider()],
      noRouter,
    );
    expect(pipeline.hasNativeDictionary).toBe(false);
    expect((await pipeline.define('ephemeral')).source).toBe('local-lexicon');
  });

  it('produces contextual explanations through the LLM router', async () => {
    const llm = new FakeLlm('fake', 'cloud', () =>
      JSON.stringify({ explanation: 'Here it means short-lived.', synonyms: ['fleeting'] }),
    );
    const pipeline = new LookupPipeline(
      [],
      new LatencyAwareRouter([llm], { latencyBudgetMs: 100 }),
    );
    const res = await pipeline.explain('ephemeral', 'Fame is ephemeral.');
    expect(res).toMatchObject({ explanation: 'Here it means short-lived.', provider: 'fake' });
    await pipeline.explain('ephemeral', 'Fame is ephemeral.');
    expect(llm.calls).toBe(1);
    expect(await new LookupPipeline([], noRouter).explain('x', 'y')).toBeNull();
  });
});
