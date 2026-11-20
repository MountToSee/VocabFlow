import { createServer, type Server } from 'node:http';
import cors from 'cors';
import express from 'express';
import { WebSocketServer } from 'ws';
import type { Capabilities } from '@vocabflow/shared';
import { AnalysisEngine } from './analysis/engine.js';
import type { Config } from './config.js';
import { createLlmRouter } from './llm/index.js';
import type { LatencyAwareRouter } from './llm/router.js';
import { LocalLexiconProvider } from './lookup/localLexicon.js';
import { MacOsDictionaryProvider } from './lookup/macosDictionary.js';
import { LookupPipeline } from './lookup/pipeline.js';
import type { DefinitionProvider } from './lookup/types.js';
import { ParagraphRewriter } from './rewrite/rewriter.js';
import { handleConnection } from './ws/session.js';

export interface AppOptions {
  config: Config;
  /** Overrides for tests. */
  router?: LatencyAwareRouter;
  definitionProviders?: DefinitionProvider[];
}

export interface VocabFlowServer {
  server: Server;
  close(): Promise<void>;
}

export function createVocabFlowServer({
  config,
  router = createLlmRouter(config),
  definitionProviders = [
    new MacOsDictionaryProvider(config.MACOS_DICTIONARY_HELPER),
    new LocalLexiconProvider(),
  ],
}: AppOptions): VocabFlowServer {
  const engine = new AnalysisEngine(router);
  const lookup = new LookupPipeline(definitionProviders, router);
  const rewriter = new ParagraphRewriter(router, config.LLM_REWRITE_BUDGET_MS);
  const allowedOrigins = new Set(
    config.ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
  const isAllowedOrigin = (origin: string | undefined) => !origin || allowedOrigins.has(origin);

  const capabilities = (): Capabilities => ({
    macosDictionary: lookup.hasNativeDictionary,
    llmProviders: router.providerNames,
    latencyBudgetMs: config.LLM_LATENCY_BUDGET_MS,
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: (origin, cb) => cb(null, isAllowedOrigin(origin)) }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, capabilities: capabilities(), providers: router.snapshot() });
  });

  /** REST fallback for clients without a WebSocket connection. */
  app.get('/api/lookup', async (req, res) => {
    const word = typeof req.query.word === 'string' ? req.query.word.trim() : '';
    const context = typeof req.query.context === 'string' ? req.query.context : undefined;
    if (!word || word.length > 64) {
      res.status(400).json({ error: 'word is required' });
      return;
    }
    const [definition, explanation] = await Promise.all([
      lookup.define(word),
      lookup.explain(word, context),
    ]);
    res.json({ definition, explanation });
  });

  const server = createServer(app);
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 256 * 1024,
    verifyClient: ({ origin }: { origin?: string }) => isAllowedOrigin(origin),
  });
  wss.on('connection', (ws) => handleConnection(ws, { engine, lookup, rewriter, capabilities }));

  return {
    server,
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of wss.clients) client.terminate();
        wss.close();
        lookup.dispose();
        server.close(() => resolve());
      }),
  };
}
