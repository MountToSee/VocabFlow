import type { ContextualExplanation, Definition } from '@vocabflow/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VocabSocket } from '../lib/socket';

export interface LookupState {
  requestId: string;
  word: string;
  context: string;
  x: number;
  y: number;
  definition: Definition | null;
  definitionMs: number | null;
  explanation: ContextualExplanation | null;
  explaining: boolean;
}

export function useLookup(socket: VocabSocket) {
  const [lookup, setLookup] = useState<LookupState | null>(null);
  const current = useRef<string | null>(null);

  useEffect(
    () =>
      socket.subscribe((msg) => {
        if (msg.type === 'lookup:definition' && msg.requestId === current.current) {
          setLookup((l) => l && { ...l, definition: msg.definition, definitionMs: msg.latencyMs });
        }
        if (msg.type === 'lookup:explanation' && msg.requestId === current.current) {
          setLookup((l) => l && { ...l, explanation: msg.explanation, explaining: false });
        }
      }),
    [socket],
  );

  const open = useCallback(
    (word: string, context: string, x: number, y: number) => {
      const requestId = crypto.randomUUID();
      current.current = requestId;
      setLookup({
        requestId,
        word,
        context,
        x,
        y,
        definition: null,
        definitionMs: null,
        explanation: null,
        explaining: true,
      });
      socket.send({ type: 'lookup', requestId, word, context }, 'lookup');
    },
    [socket],
  );

  const close = useCallback(() => {
    current.current = null;
    setLookup(null);
  }, []);

  return { lookup, open, close };
}
