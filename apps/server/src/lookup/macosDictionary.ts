import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { Definition } from '@vocabflow/shared';
import type { DefinitionProvider } from './types.js';

const JXA_SCRIPT = `
ObjC.import('CoreServices');
function run(argv) {
  var word = argv[0];
  var ref = $.DCSCopyTextDefinition(null, $(word), $.CFRangeMake(0, word.length));
  if (!ref) return '';
  return ObjC.castRefToObject(ref).js;
}`;

const POS_RE =
  /^(noun|verb|adjective|adverb|pronoun|preposition|conjunction|exclamation|determiner|abbreviation)\b\s*/i;

/** Parses Apple Dictionary output, e.g. "serendipity | ˌserənˈdipədē | noun the occurrence ...". */
export function parseAppleDefinition(word: string, raw: string): Definition | null {
  const text = raw.trim();
  if (!text) return null;
  const segments = text.split(' | ');
  let body = text;
  let pronunciation: string | undefined;
  if (segments.length >= 3) {
    pronunciation = segments[1]!.trim();
    body = segments.slice(2).join(' | ').trim();
  } else if (segments.length === 2) {
    body = segments[1]!.trim();
  }
  const pos = body.match(POS_RE);
  return {
    word,
    source: 'macos-dictionary',
    definition: pos ? body.slice(pos[0].length) : body,
    partOfSpeech: pos?.[1]?.toLowerCase(),
    pronunciation,
    synonyms: [],
  };
}

const HELPER_RELATIVE_PATH = 'native/macos/DictionaryHelper/.build/release/DictionaryHelper';

/**
 * Returns the explicit helper path, or the locally built helper if `swift build -c release`
 * has been run in the repo (checked from the repo root and from a workspace directory).
 */
export function resolveHelperPath(
  explicit: string | undefined,
  cwd: string = process.cwd(),
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  if (explicit) return explicit;
  return [resolve(cwd, HELPER_RELATIVE_PATH), resolve(cwd, '../..', HELPER_RELATIVE_PATH)].find(
    exists,
  );
}

interface Pending {
  resolve: (raw: string) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Uses the system dictionary (Dictionary Services, DCSCopyTextDefinition).
 *
 * Preferred path: the compiled Swift helper (native/macos/DictionaryHelper), kept alive as
 * a long-running process speaking line-delimited JSON for sub-millisecond lookups.
 * Fallback path: a JXA script via `osascript` (no build step, ~50-100ms per lookup).
 */
export class MacOsDictionaryProvider implements DefinitionProvider {
  readonly name = 'macos-dictionary';
  readonly available: boolean;
  private helper: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(
    private readonly helperPath?: string,
    private readonly timeoutMs = 500,
    platform: NodeJS.Platform = process.platform,
  ) {
    this.available = platform === 'darwin';
  }

  async lookup(word: string): Promise<Definition | null> {
    if (!this.available) return null;
    const raw =
      this.helperPath && existsSync(this.helperPath)
        ? await this.viaHelper(word)
        : await this.viaJxa(word);
    return parseAppleDefinition(word, raw);
  }

  /** Spawns the helper up front so the first lookup doesn't pay process start-up cost. */
  warm(): void {
    if (this.available && this.helperPath && existsSync(this.helperPath)) this.ensureHelper();
  }

  dispose(): void {
    this.helper?.kill();
    this.helper = null;
  }

  private viaJxa(word: string): Promise<string> {
    return new Promise((resolve) => {
      execFile(
        'osascript',
        ['-l', 'JavaScript', '-e', JXA_SCRIPT, word],
        { timeout: this.timeoutMs * 4 },
        (err, stdout) => resolve(err ? '' : stdout),
      );
    });
  }

  private viaHelper(word: string): Promise<string> {
    const helper = this.ensureHelper();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('macOS dictionary helper timed out'));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      helper.stdin.write(`${JSON.stringify({ id, word })}\n`);
    }).then(
      (raw) => raw as string,
      () => '',
    );
  }

  private ensureHelper(): ChildProcessWithoutNullStreams {
    if (this.helper && !this.helper.killed) return this.helper;
    const child = spawn(this.helperPath!, [], { stdio: 'pipe' });
    createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        const msg = JSON.parse(line) as { id: number; definition?: string };
        const p = this.pending.get(msg.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        p.resolve(msg.definition ?? '');
      } catch {
        // ignore malformed lines
      }
    });
    child.on('exit', () => {
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error('helper exited'));
      }
      this.pending.clear();
      this.helper = null;
    });
    this.helper = child;
    return child;
  }
}
