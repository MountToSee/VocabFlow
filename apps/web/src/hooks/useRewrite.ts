import type { ParagraphRewrite, RewriteSuggestion } from '@vocabflow/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { afterApplying } from '../lib/rewrite';
import type { VocabSocket } from '../lib/socket';

export interface RewriteTarget {
  /** Paragraph text as currently shown in the editor. */
  text: string;
  /** Offset of the paragraph within the editor's plain text. */
  start: number;
  /** Word or phrase the writer was looking at, if any. */
  focus?: string;
  x: number;
  y: number;
}

export interface RewriteState extends RewriteTarget {
  requestId: string;
  rewrite: ParagraphRewrite | null;
  /** True until the final (AI or offline-only) result arrives. */
  pending: boolean;
  latencyMs: number | null;
}

export function useRewrite(socket: VocabSocket) {
  const [state, setState] = useState<RewriteState | null>(null);
  const current = useRef<string | null>(null);

  useEffect(
    () =>
      socket.subscribe((msg) => {
        if (msg.type !== 'rewrite:result' || msg.requestId !== current.current) return;
        setState(
          (s) =>
            s && {
              ...s,
              // Keep the offline result if the AI pass came back with nothing to say.
              rewrite:
                msg.final && s.rewrite && msg.rewrite.source === 'heuristic'
                  ? s.rewrite
                  : msg.rewrite,
              pending: !msg.final,
              latencyMs: msg.latencyMs,
            },
        );
      }),
    [socket],
  );

  const open = useCallback(
    (target: RewriteTarget) => {
      const requestId = crypto.randomUUID();
      current.current = requestId;
      setState({ ...target, requestId, rewrite: null, pending: true, latencyMs: null });
      socket.send(
        { type: 'rewrite', requestId, paragraph: target.text, focus: target.focus },
        'rewrite',
      );
    },
    [socket],
  );

  /** Records that one suggestion was applied in the editor, keeping the rest in sync. */
  const markApplied = useCallback((applied: RewriteSuggestion) => {
    setState((s) => {
      if (!s?.rewrite) return s;
      const text = s.text.slice(0, applied.start) + applied.replacement + s.text.slice(applied.end);
      return {
        ...s,
        text,
        rewrite: {
          ...s.rewrite,
          paragraph: text,
          suggestions: afterApplying(s.rewrite.suggestions, applied),
        },
      };
    });
  }, []);

  const close = useCallback(() => {
    current.current = null;
    setState(null);
  }, []);

  return { rewrite: state, open, markApplied, close };
}
