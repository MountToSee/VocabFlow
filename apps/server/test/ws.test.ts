import type { AddressInfo } from 'node:net';
import type { ServerMessage } from '@vocabflow/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createVocabFlowServer, type VocabFlowServer } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LatencyAwareRouter } from '../src/llm/router.js';
import { LocalLexiconProvider } from '../src/lookup/localLexicon.js';
import { FakeLlm } from './fakes.js';

let app: VocabFlowServer;
let url: string;

beforeAll(async () => {
  const llm = new FakeLlm('fake', 'local', (messages) =>
    messages[0]!.content.includes('vocabulary tutor')
      ? JSON.stringify({ explanation: 'Everywhere at once.', synonyms: ['pervasive'] })
      : messages[0]!.content.includes('writing coach')
        ? JSON.stringify({ rewritten: 'I was exhausted.', changes: [] })
        : JSON.stringify({ issues: [] }),
  );
  app = createVocabFlowServer({
    config: loadConfig({}),
    router: new LatencyAwareRouter([llm], { latencyBudgetMs: 500 }),
    definitionProviders: [new LocalLexiconProvider()],
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  url = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/ws`;
});

afterAll(() => app.close());

function connect(origin?: string): Promise<{ ws: WebSocket; messages: ServerMessage[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, origin ? { origin } : {});
    const messages: ServerMessage[] = [];
    ws.on('message', (d) => messages.push(JSON.parse(d.toString()) as ServerMessage));
    ws.on('open', () => resolve({ ws, messages }));
    ws.on('error', reject);
  });
}

async function waitFor(messages: ServerMessage[], pred: (m: ServerMessage) => boolean) {
  for (let i = 0; i < 100; i++) {
    const found = messages.find(pred);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timed out waiting for message');
}

describe('WebSocket API', () => {
  it('greets with capabilities and streams analysis', async () => {
    const { ws, messages } = await connect();
    await waitFor(messages, (m) => m.type === 'hello');
    ws.send(JSON.stringify({ type: 'analyze', noteId: 'n1', revision: 1, text: 'i saw a owl.' }));
    const heur = await waitFor(
      messages,
      (m) => m.type === 'analysis:issues' && m.source === 'heuristic',
    );
    expect(heur.type === 'analysis:issues' && heur.issues.length).toBeGreaterThanOrEqual(2);
    const done = await waitFor(messages, (m) => m.type === 'analysis:done');
    expect(done).toMatchObject({ revision: 1, strategy: 'local-llm' });
    ws.close();
  });

  it('answers lookups in two phases', async () => {
    const { ws, messages } = await connect();
    ws.send(
      JSON.stringify({
        type: 'lookup',
        requestId: 'r1',
        word: 'ubiquitous',
        context: 'Phones are ubiquitous.',
      }),
    );
    const def = await waitFor(messages, (m) => m.type === 'lookup:definition');
    expect(def).toMatchObject({ definition: { source: 'local-lexicon' } });
    const exp = await waitFor(messages, (m) => m.type === 'lookup:explanation');
    expect(exp).toMatchObject({ explanation: { synonyms: ['pervasive'] } });
    ws.close();
  });

  it('streams an instant offline rewrite, then the AI rewrite', async () => {
    const { ws, messages } = await connect();
    ws.send(JSON.stringify({ type: 'rewrite', requestId: 'w1', paragraph: 'I was very tired.' }));
    const quick = await waitFor(messages, (m) => m.type === 'rewrite:result' && !m.final);
    expect(quick).toMatchObject({
      rewrite: { source: 'heuristic', rewritten: 'I was exhausted.' },
    });
    const final = await waitFor(messages, (m) => m.type === 'rewrite:result' && m.final);
    expect(final).toMatchObject({ requestId: 'w1', rewrite: { source: 'llm' } });
    ws.close();
  });

  it('reports invalid messages', async () => {
    const { ws, messages } = await connect();
    ws.send('{"type":"nope"}');
    expect(await waitFor(messages, (m) => m.type === 'error')).toBeTruthy();
    ws.close();
  });

  it('rejects connections from disallowed browser origins', async () => {
    await expect(connect('https://evil.example')).rejects.toThrow();
    const ok = await connect('http://localhost:5173');
    ok.ws.close();
  });
});
