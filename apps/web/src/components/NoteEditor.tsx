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
import { sentenceAt, type Issue } from '@vocabflow/shared';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import {
  extractEditorText,
  occurrenceIndex,
  offsetForPosition,
  rangeForOffsets,
  replaceInMarkdown,
} from '../lib/editorText';
import { issueAt } from '../lib/issues';

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
  onLookup: (word: string, context: string, x: number, y: number) => void;
  onIssueClick: (issue: Issue, x: number, y: number) => void;
}

const HIGHLIGHT_KINDS = ['grammar', 'spelling', 'punctuation', 'word-choice', 'style'] as const;
const supportsHighlights = typeof CSS !== 'undefined' && 'highlights' in CSS;

export const NoteEditor = forwardRef<NoteEditorHandle, Props>(function NoteEditor(
  { noteId, markdown, issues, onMarkdownChange, onTextChange, onLookup, onIssueClick },
  ref,
) {
  const editorRef = useRef<MDXEditorMethods>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const word =
        window
          .getSelection()
          ?.toString()
          .trim()
          .replace(/[^A-Za-z'-]/g, '') ?? '';
      if (!word || word.length > 64) return;
      const pos = caretOffset();
      const context = pos ? sentenceAt(pos.text, pos.offset) : word;
      onLookup(word, context, e.clientX, e.clientY);
    },
    [caretOffset, onLookup],
  );

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
      onDoubleClick={handleDoubleClick}
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
