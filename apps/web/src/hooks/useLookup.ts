import type { ContextualExplanation, Definition } from '@vocabflow/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LookupAnchor } from '../lib/lookupTerm';
import type { VocabSocket } from '../lib/socket';

/** `peek`: definition only (hover). `full`: definition + contextual AI explanation. */
export type LookupMode = 'peek' | 'full';
export type LookupOrigin = 'hover' | 'select';

export interface LookupState {
  requestId: string;
  word: string;
  context: string;
  x: number;
  y: number;
  mode: LookupMode;
  origin: LookupOrigin;
  definition: Definition | null;
  definitionMs: number | null;
  explanation: ContextualExplanation | null;
  explaining: boolean;
}

export function useLookup(socket: VocabSocket) {
  const [lookup, setLookupState] = useState<LookupState | null>(null);
  const current = useRef<LookupState | null>(null);
  // Definitions are stable per word, so repeat lookups render instantly without a round-trip.
  const definitions = useRef(new Map<string, Definition>());

  const setLookup = useCallback((next: LookupState | null) => {
    current.current = next;
    setLookupState(next);
  }, []);

  useEffect(
    () =>
      socket.subscribe((msg) => {
        const l = current.current;
        if (msg.type === 'lookup:definition') {
          definitions.current.set(msg.definition.word.toLowerCase(), msg.definition);
          if (l && msg.requestId === l.requestId && !l.definition) {
            setLookup({ ...l, definition: msg.definition, definitionMs: msg.latencyMs });
          }
        }
        if (msg.type === 'lookup:explanation' && l && msg.requestId === l.requestId) {
          setLookup({ ...l, explanation: msg.explanation, explaining: false });
        }
      }),
    [socket, setLookup],
  );

  const request = useCallback(
    (state: LookupState) => {
      setLookup(state);
      if (state.mode === 'peek' && state.definition) return;
      socket.send(
        {
          type: 'lookup',
          requestId: state.requestId,
          word: state.word,
          context: state.context,
          explain: state.mode === 'full',
        },
        'lookup',
      );
    },
    [socket, setLookup],
  );

  const open = useCallback(
    (
      word: string,
      context: string,
      anchor: LookupAnchor,
      { mode = 'full', origin = 'select' }: { mode?: LookupMode; origin?: LookupOrigin } = {},
    ) => {
      const l = current.current;
      if (
        l &&
        l.word === word &&
        l.context === context &&
        (l.mode === mode || origin === 'hover')
      ) {
        return;
      }
      const cached = definitions.current.get(word.toLowerCase()) ?? null;
      request({
        requestId: crypto.randomUUID(),
        word,
        context,
        x: anchor.x,
        y: anchor.y,
        mode,
        origin,
        definition: cached,
        definitionMs: cached ? 0 : null,
        explanation: null,
        explaining: mode === 'full',
      });
    },
    [request],
  );

  /** Upgrades a peek into a full lookup with the contextual explanation. */
  const expand = useCallback(() => {
    const l = current.current;
    if (!l || l.mode === 'full') return;
    request({ ...l, requestId: crypto.randomUUID(), mode: 'full', explaining: true });
  }, [request]);

  const close = useCallback(() => setLookup(null), [setLookup]);

  /** Closes the popover only if it is a hover peek the user hasn't interacted with. */
  const closePeek = useCallback(() => {
    const l = current.current;
    if (l?.origin === 'hover' && l.mode === 'peek') setLookup(null);
  }, [setLookup]);

  return { lookup, open, expand, close, closePeek };
}
