import type { AnalysisStrategy, Issue } from '@vocabflow/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mergeIssues } from '../lib/issues';
import type { VocabSocket } from '../lib/socket';

const DEBOUNCE_MS = 350;

export interface AnalysisState {
  issues: Issue[];
  analyzing: boolean;
  strategy: AnalysisStrategy | null;
  latencyMs: number | null;
}

/** Debounced, revision-tracked real-time analysis for the active note. */
export function useAnalysis(socket: VocabSocket, noteId: string) {
  const revision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [heuristic, setHeuristic] = useState<Issue[]>([]);
  const [llm, setLlm] = useState<Issue[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [strategy, setStrategy] = useState<AnalysisStrategy | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    setHeuristic([]);
    setLlm([]);
    setStrategy(null);
    setLatencyMs(null);
    return socket.subscribe((msg) => {
      if (!('noteId' in msg) || msg.noteId !== noteId || msg.revision !== revision.current) return;
      if (msg.type === 'analysis:start') setAnalyzing(true);
      if (msg.type === 'analysis:issues') {
        (msg.source === 'heuristic' ? setHeuristic : setLlm)(msg.issues);
      }
      if (msg.type === 'analysis:done') {
        setAnalyzing(false);
        setStrategy(msg.strategy);
        setLatencyMs(msg.latencyMs);
      }
    });
  }, [socket, noteId]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [noteId],
  );

  const analyze = useCallback(
    (text: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        revision.current += 1;
        // LLM issues from the previous revision would have stale offsets.
        setLlm([]);
        socket.send(
          { type: 'analyze', noteId, revision: revision.current, text },
          `analyze:${noteId}`,
        );
      }, DEBOUNCE_MS);
    },
    [socket, noteId],
  );

  const issues = useMemo(() => mergeIssues(heuristic, llm), [heuristic, llm]);

  const state: AnalysisState = { issues, analyzing, strategy, latencyMs };
  return { ...state, analyze };
}
