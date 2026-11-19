import { parseClientMessage, type ClientMessage, type ServerMessage } from '@vocabflow/shared';
import type { WebSocket } from 'ws';
import type { AnalysisEngine } from '../analysis/engine.js';
import type { LookupPipeline } from '../lookup/pipeline.js';
import type { Capabilities } from '@vocabflow/shared';

export interface SessionDeps {
  engine: AnalysisEngine;
  lookup: LookupPipeline;
  capabilities: () => Capabilities;
}

/** Handles one WebSocket connection. Newer revisions of a note cancel in-flight analysis. */
export function handleConnection(ws: WebSocket, deps: SessionDeps): void {
  const inflight = new Map<string, AbortController>();

  const send = (msg: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  send({ type: 'hello', capabilities: deps.capabilities() });

  ws.on('message', (data) => {
    const msg = parseClientMessage(data.toString());
    if ('error' in msg) {
      send({ type: 'error', message: msg.error });
      return;
    }
    void dispatch(msg).catch((err: unknown) => {
      send({ type: 'error', message: err instanceof Error ? err.message : 'Internal error' });
    });
  });

  ws.on('close', () => {
    for (const c of inflight.values()) c.abort();
    inflight.clear();
  });

  async function dispatch(msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case 'ping':
        send({ type: 'pong' });
        return;

      case 'analyze': {
        inflight.get(msg.noteId)?.abort();
        const controller = new AbortController();
        inflight.set(msg.noteId, controller);
        const { noteId, revision } = msg;
        send({ type: 'analysis:start', noteId, revision });
        try {
          await deps.engine.analyze(
            msg.text,
            (event) => {
              if (controller.signal.aborted) return;
              if (event.type === 'issues') {
                send({
                  type: 'analysis:issues',
                  noteId,
                  revision,
                  source: event.source,
                  issues: event.issues,
                  partial: event.partial,
                });
              } else {
                send({
                  type: 'analysis:done',
                  noteId,
                  revision,
                  strategy: event.strategy,
                  latencyMs: event.latencyMs,
                });
              }
            },
            controller.signal,
          );
        } finally {
          if (inflight.get(noteId) === controller) inflight.delete(noteId);
        }
        return;
      }

      case 'lookup': {
        const started = Date.now();
        const definition = await deps.lookup.define(msg.word);
        send({
          type: 'lookup:definition',
          requestId: msg.requestId,
          definition,
          latencyMs: Date.now() - started,
        });
        const explanation = await deps.lookup.explain(msg.word, msg.context);
        send({
          type: 'lookup:explanation',
          requestId: msg.requestId,
          explanation,
          latencyMs: Date.now() - started,
        });
        return;
      }
    }
  }
}
