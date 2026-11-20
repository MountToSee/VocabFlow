import {
  headingsPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  thematicBreakPlugin,
  type MDXEditorMethods,
} from '@mdxeditor/editor';
import type { Issue } from '@vocabflow/shared';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import {
  extractEditorText,
  occurrenceIndex,
  offsetForPosition,
  rangeForOffsets,
  replaceInMarkdown,
} from '../lib/editorText';
import { issueAt } from '../lib/issues';
import { selectionLookup, wordAtPoint, type LookupHit } from '../lib/lookupTerm';

export interface NoteEditorHandle {
  /** Applies a suggestion in place (keeps undo history); falls back to a Markdown rewrite. */
  applySuggestion(issue: Issue, replacement: string): boolean;
  focus(): void;
}

interface Props {
  noteId: string;
  markdown: string;
  issues: Issue[];
  onMarkdownChange: (markdown: string) => void;
  onTextChange: (text: string) => void;
  /** Show a definition peek when the pointer rests on a word. */
  hoverLookup: boolean;
  onLookup: (hit: LookupHit, origin: 'hover' | 'select') => void;
  /** The pointer left the hovered word (or the editor). */
  onHoverEnd: () => void;
  onTyping: () => void;
  onIssueClick: (issue: Issue, x: number, y: number) => void;
}

const HOVER_DELAY_MS = 450;
/** Hover peeks are suppressed right after typing so they don't pop up mid-sentence. */
const TYPING_QUIET_MS = 1200;

const HIGHLIGHT_KINDS = ['grammar', 'spelling', 'punctuation', 'word-choice', 'style'] as const;
const supportsHighlights = typeof CSS !== 'undefined' && 'highlights' in CSS;

export const NoteEditor = forwardRef<NoteEditorHandle, Props>(function NoteEditor(
  {
    noteId,
    markdown,
    issues,
    hoverLookup,
    onMarkdownChange,
    onTextChange,
    onLookup,
    onHoverEnd,
    onTyping,
    onIssueClick,
  },
  ref,
) {
  const editorRef = useRef<MDXEditorMethods>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastKeyAt = useRef(0);

  const contentRoot = useCallback(
    () => wrapperRef.current?.querySelector<HTMLElement>('[contenteditable="true"]') ?? null,
    [],
  );

  const emitText = useCallback(() => {
    requestAnimationFrame(() => {
      const root = contentRoot();
      if (root) onTextChange(extractEditorText(root).text);
    });
  }, [contentRoot, onTextChange]);

  useEffect(() => {
    emitText();
  }, [noteId, emitText]);

  // Draw issue underlines with the CSS Custom Highlight API (no editor state mutation).
  useEffect(() => {
    if (!supportsHighlights) return;
    const root = contentRoot();
    if (!root) return;
    const et = extractEditorText(root);
    const byKind = new Map<string, Range[]>();
    for (const issue of issues) {
      if (et.text.slice(issue.start, issue.end) !== issue.original) continue;
      const range = rangeForOffsets(et, issue.start, issue.end);
      if (!range) continue;
      const list = byKind.get(issue.kind) ?? [];
      list.push(range);
      byKind.set(issue.kind, list);
    }
    for (const kind of HIGHLIGHT_KINDS) {
      const ranges = byKind.get(kind);
      if (ranges?.length) CSS.highlights.set(`vf-${kind}`, new Highlight(...ranges));
      else CSS.highlights.delete(`vf-${kind}`);
    }
  }, [issues, contentRoot]);

  useEffect(
    () => () => {
      if (supportsHighlights)
        for (const kind of HIGHLIGHT_KINDS) CSS.highlights.delete(`vf-${kind}`);
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editorRef.current?.focus(),
      applySuggestion(issue, replacement) {
        const root = contentRoot();
        if (!root) return false;
        const et = extractEditorText(root);
        if (et.text.slice(issue.start, issue.end) !== issue.original) return false;

        const range = rangeForOffsets(et, issue.start, issue.end);
        const selection = window.getSelection();
        if (range && selection) {
          root.focus();
          selection.removeAllRanges();
          selection.addRange(range);
          const ok =
            replacement === ''
              ? document.execCommand('delete')
              : document.execCommand('insertText', false, replacement);
          if (ok) return true;
        }

        const md = editorRef.current?.getMarkdown();
        if (md === undefined) return false;
        const next = replaceInMarkdown(
          md,
          issue.original,
          replacement,
          occurrenceIndex(et.text, issue.original, issue.start),
        );
        if (next === null) return false;
        editorRef.current?.setMarkdown(next);
        onMarkdownChange(next);
        emitText();
        return true;
      },
    }),
    [contentRoot, emitText, onMarkdownChange],
  );

  const caretOffset = useCallback((): { offset: number; text: string } | null => {
    const root = contentRoot();
    const sel = window.getSelection();
    if (!root || !sel || sel.rangeCount === 0) return null;
    const et = extractEditorText(root);
    const r = sel.getRangeAt(0);
    const offset = offsetForPosition(et, r.startContainer, r.startOffset);
    return offset === null ? null : { offset, text: et.text };
  }, [contentRoot]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.detail > 1) return;
      const pos = caretOffset();
      if (!pos) return;
      const issue = issueAt(issues, pos.offset);
      if (issue && pos.text.slice(issue.start, issue.end) === issue.original) {
        onIssueClick(issue, e.clientX, e.clientY);
      }
    },
    [caretOffset, issues, onIssueClick],
  );

  // Selecting a word or short phrase (including double-click) opens a full lookup.
  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      // Let the browser finalize the selection first.
      setTimeout(() => {
        const root = contentRoot();
        const hit = root && selectionLookup(root);
        if (hit) onLookup(hit, 'select');
      });
    },
    [contentRoot, onLookup],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      clearTimeout(hoverTimer.current);
      if (!hoverLookup || e.buttons !== 0) return;
      if (Date.now() - lastKeyAt.current < TYPING_QUIET_MS) return;
      if (window.getSelection()?.isCollapsed === false) return;
      const { clientX, clientY } = e;
      hoverTimer.current = setTimeout(() => {
        const root = contentRoot();
        const hit = root && wordAtPoint(root, clientX, clientY);
        if (hit) onLookup(hit, 'hover');
        else onHoverEnd();
      }, HOVER_DELAY_MS);
    },
    [contentRoot, hoverLookup, onHoverEnd, onLookup],
  );

  const handleMouseLeave = useCallback(() => {
    clearTimeout(hoverTimer.current);
    onHoverEnd();
  }, [onHoverEnd]);

  const handleKeyDown = useCallback(() => {
    lastKeyAt.current = Date.now();
    clearTimeout(hoverTimer.current);
    onTyping();
  }, [onTyping]);

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  const plugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      linkPlugin(),
      markdownShortcutPlugin(),
    ],
    [],
  );

  return (
    <div
      ref={wrapperRef}
      className="editor-wrapper"
      onClick={handleClick}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
    >
      <MDXEditor
        key={noteId}
        ref={editorRef}
        markdown={markdown}
        plugins={plugins}
        contentEditableClassName="vf-prose"
        placeholder="Start writing…"
        spellCheck={false}
        onChange={(md, initialMarkdownNormalize) => {
          if (initialMarkdownNormalize) return;
          onMarkdownChange(md);
          emitText();
        }}
      />
    </div>
  );
});
