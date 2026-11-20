import {
  tokenizeWords,
  type Issue,
  type ReviewGrade,
  type RewriteSuggestion,
} from '@vocabflow/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InsightsPanel } from './components/InsightsPanel';
import { IssueCard } from './components/IssueCard';
import { LookupCard } from './components/LookupCard';
import { NoteEditor, type NoteEditorHandle } from './components/NoteEditor';
import { RewriteCard } from './components/RewriteCard';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { StudyPanel } from './components/StudyPanel';
import { useAnalysis } from './hooks/useAnalysis';
import { useLookup } from './hooks/useLookup';
import { useRewrite, type RewriteTarget } from './hooks/useRewrite';
import { useVocabSocket } from './hooks/useVocabSocket';
import { createCard, gradeCard, loadDeck, saveDeck, type VocabCard } from './lib/deck';
import { loadNotes, newNote, saveNotes, type Note } from './lib/notes';

type PanelTab = 'insights' | 'study';

const issueKey = (i: Issue) => `${i.original}|${i.message}`;

/** Wraps a plain text range as an Issue so it can go through the editor's replace path. */
const rangeEdit = (start: number, original: string): Issue => ({
  id: `edit-${start}`,
  kind: 'style',
  source: 'llm',
  start,
  end: start + original.length,
  original,
  message: '',
  suggestions: [],
});

export function App() {
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [activeId, setActiveId] = useState(() => notes[0]!.id);
  const [deck, setDeck] = useState<VocabCard[]>(loadDeck);
  const [focusMode, setFocusMode] = useState(false);
  const [tab, setTab] = useState<PanelTab>('insights');
  const [plainText, setPlainText] = useState('');
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [openIssue, setOpenIssue] = useState<{ issue: Issue; x: number; y: number } | null>(null);
  const editor = useRef<NoteEditorHandle>(null);

  const active = notes.find((n) => n.id === activeId) ?? notes[0]!;
  const { socket, status, capabilities } = useVocabSocket();
  const analysis = useAnalysis(socket, active.id);
  const { lookup, open: openLookup, close: closeLookup } = useLookup(socket);
  const { rewrite, open: openRewrite, markApplied, close: closeRewrite } = useRewrite(socket);
  const lookupParagraph = useRef<RewriteTarget | null>(null);
  const hasAi = (capabilities?.llmProviders.length ?? 0) > 0;

  const startRewrite = useCallback(
    (target: RewriteTarget | null | undefined) => {
      if (!target) return;
      closeLookup();
      setOpenIssue(null);
      openRewrite(target);
    },
    [closeLookup, openRewrite],
  );
  const rewriteAtSelection = useRef(() => {});
  rewriteAtSelection.current = () => startRewrite(editor.current?.paragraphAtSelection());

  useEffect(() => saveNotes(notes), [notes]);
  useEffect(() => saveDeck(deck), [deck]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        setFocusMode((f) => !f);
      }
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyR') {
        e.preventDefault();
        rewriteAtSelection.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visibleIssues = useMemo(
    () => analysis.issues.filter((i) => !dismissed.has(issueKey(i))),
    [analysis.issues, dismissed],
  );

  const { analyze } = analysis;
  const handleTextChange = useCallback(
    (text: string) => {
      setPlainText(text);
      analyze(text);
    },
    [analyze],
  );

  const handleMarkdownChange = useCallback(
    (markdown: string) => {
      setNotes((all) =>
        all.map((n) => (n.id === activeId ? { ...n, markdown, updatedAt: Date.now() } : n)),
      );
    },
    [activeId],
  );

  const applySuggestion = useCallback((issue: Issue, replacement: string) => {
    editor.current?.applySuggestion(issue, replacement);
    setOpenIssue(null);
  }, []);

  const dismiss = useCallback((issue: Issue) => {
    setDismissed((d) => new Set(d).add(issueKey(issue)));
    setOpenIssue(null);
  }, []);

  const applyRewrite = (s: RewriteSuggestion) => {
    if (!rewrite) return;
    if (
      editor.current?.applySuggestion(rangeEdit(rewrite.start + s.start, s.original), s.replacement)
    )
      markApplied(s);
  };

  const replaceParagraph = (text: string) => {
    if (!rewrite) return;
    if (editor.current?.applySuggestion(rangeEdit(rewrite.start, rewrite.text), text))
      closeRewrite();
  };

  const createNote = () => {
    const note = newNote();
    setNotes((all) => [note, ...all]);
    setActiveId(note.id);
  };

  const deleteNote = (id: string) => {
    setNotes((all) => {
      const rest = all.filter((n) => n.id !== id);
      if (id === activeId && rest[0]) setActiveId(rest[0].id);
      return rest;
    });
  };

  const saveLookup = () => {
    if (!lookup) return;
    const definition =
      lookup.definition?.definition || lookup.explanation?.explanation || '(no definition)';
    setDeck((d) => [
      ...d,
      createCard({ word: lookup.word, definition, sentence: lookup.context, noteId: active.id }),
    ]);
  };

  const inDeck = !!lookup && deck.some((c) => c.word.toLowerCase() === lookup.word.toLowerCase());
  const wordCount = useMemo(() => tokenizeWords(plainText).length, [plainText]);

  return (
    <div className={`app ${focusMode ? 'focus' : ''}`}>
      {!focusMode && (
        <Sidebar
          notes={notes}
          activeId={active.id}
          onSelect={setActiveId}
          onCreate={createNote}
          onDelete={deleteNote}
        />
      )}

      <main className="main">
        <div className="toolbar">
          <button
            className="ghost small"
            onClick={() => setFocusMode((f) => !f)}
            title="Toggle focus mode (Ctrl/Cmd + .)"
          >
            {focusMode ? 'Exit focus' : 'Focus'}
          </button>
          <button
            className="ghost small"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => rewriteAtSelection.current()}
            title="Rewrite the paragraph at the cursor more naturally (Alt/Option + R)"
          >
            Rephrase
          </button>
        </div>
        <div className="page">
          <NoteEditor
            ref={editor}
            noteId={active.id}
            markdown={active.markdown}
            issues={visibleIssues}
            onMarkdownChange={handleMarkdownChange}
            onTextChange={handleTextChange}
            onLookup={(word, context, x, y) => {
              setOpenIssue(null);
              closeRewrite();
              lookupParagraph.current = editor.current?.paragraphAtSelection() ?? null;
              openLookup(word, context, x, y);
            }}
            onIssueClick={(issue, x, y) => {
              closeLookup();
              closeRewrite();
              setOpenIssue({ issue, x, y });
            }}
          />
        </div>
        <StatusBar
          status={status}
          capabilities={capabilities}
          analyzing={analysis.analyzing}
          strategy={analysis.strategy}
          latencyMs={analysis.latencyMs}
          wordCount={wordCount}
          issueCount={visibleIssues.length}
        />
      </main>

      {!focusMode && (
        <aside className="panel" aria-label="Learning panel">
          <div className="tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'insights'}
              className={tab === 'insights' ? 'active' : ''}
              onClick={() => setTab('insights')}
            >
              Insights{' '}
              {visibleIssues.length > 0 && <span className="badge">{visibleIssues.length}</span>}
            </button>
            <button
              role="tab"
              aria-selected={tab === 'study'}
              className={tab === 'study' ? 'active' : ''}
              onClick={() => setTab('study')}
            >
              Study
            </button>
          </div>
          {tab === 'insights' ? (
            <InsightsPanel issues={visibleIssues} onApply={applySuggestion} onDismiss={dismiss} />
          ) : (
            <StudyPanel
              deck={deck}
              onGrade={(card: VocabCard, grade: ReviewGrade) =>
                setDeck((d) => d.map((c) => (c.id === card.id ? gradeCard(c, grade) : c)))
              }
              onRemove={(card) => setDeck((d) => d.filter((c) => c.id !== card.id))}
            />
          )}
        </aside>
      )}

      {lookup && (
        <LookupCard
          lookup={lookup}
          inDeck={inDeck}
          onSave={saveLookup}
          onRewrite={
            lookupParagraph.current
              ? () => startRewrite({ ...lookupParagraph.current!, focus: lookup.word })
              : undefined
          }
          onClose={closeLookup}
        />
      )}
      {rewrite && (
        <RewriteCard
          state={rewrite}
          hasAi={hasAi}
          onApply={applyRewrite}
          onReplaceParagraph={replaceParagraph}
          onClose={closeRewrite}
        />
      )}
      {openIssue && (
        <IssueCard
          {...openIssue}
          onApply={(r) => applySuggestion(openIssue.issue, r)}
          onDismiss={() => dismiss(openIssue.issue)}
          onClose={() => setOpenIssue(null)}
        />
      )}
    </div>
  );
}
