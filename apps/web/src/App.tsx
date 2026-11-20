import { tokenizeWords, type Issue, type ReviewGrade } from '@vocabflow/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InsightsPanel } from './components/InsightsPanel';
import { IssueCard } from './components/IssueCard';
import { LookupCard } from './components/LookupCard';
import { NoteEditor, type NoteEditorHandle } from './components/NoteEditor';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { StudyPanel } from './components/StudyPanel';
import { useAnalysis } from './hooks/useAnalysis';
import { useLookup } from './hooks/useLookup';
import { useVocabSocket } from './hooks/useVocabSocket';
import { createCard, gradeCard, loadDeck, saveDeck, type VocabCard } from './lib/deck';
import type { LookupHit } from './lib/lookupTerm';
import { loadNotes, newNote, saveNotes, type Note } from './lib/notes';
import { readJson, writeJson } from './lib/storage';

type PanelTab = 'insights' | 'study';

const issueKey = (i: Issue) => `${i.original}|${i.message}`;
const HOVER_KEY = 'vocabflow:hover-lookup:v1';
const PEEK_CLOSE_DELAY_MS = 300;

export function App() {
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [activeId, setActiveId] = useState(() => notes[0]!.id);
  const [deck, setDeck] = useState<VocabCard[]>(loadDeck);
  const [focusMode, setFocusMode] = useState(false);
  const [tab, setTab] = useState<PanelTab>('insights');
  const [plainText, setPlainText] = useState('');
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [openIssue, setOpenIssue] = useState<{ issue: Issue; x: number; y: number } | null>(null);
  const [hoverLookup, setHoverLookup] = useState(() => readJson(HOVER_KEY, true));
  const editor = useRef<NoteEditorHandle>(null);
  const peekCloseTimer = useRef<ReturnType<typeof setTimeout>>();

  const active = notes.find((n) => n.id === activeId) ?? notes[0]!;
  const { socket, status, capabilities } = useVocabSocket();
  const analysis = useAnalysis(socket, active.id);
  const {
    lookup,
    open: openLookup,
    expand: expandLookup,
    close: closeLookup,
    closePeek,
  } = useLookup(socket);

  useEffect(() => saveNotes(notes), [notes]);
  useEffect(() => saveDeck(deck), [deck]);
  useEffect(() => writeJson(HOVER_KEY, hoverLookup), [hoverLookup]);

  const cancelPeekClose = useCallback(() => clearTimeout(peekCloseTimer.current), []);
  const schedulePeekClose = useCallback(() => {
    clearTimeout(peekCloseTimer.current);
    peekCloseTimer.current = setTimeout(closePeek, PEEK_CLOSE_DELAY_MS);
  }, [closePeek]);
  useEffect(() => cancelPeekClose, [cancelPeekClose]);

  const handleLookup = useCallback(
    (hit: LookupHit, origin: 'hover' | 'select') => {
      cancelPeekClose();
      if (origin === 'select') setOpenIssue(null);
      openLookup(hit.word, hit.context, hit.anchor, {
        mode: origin === 'hover' ? 'peek' : 'full',
        origin,
      });
    },
    [cancelPeekClose, openLookup],
  );

  const handleTyping = useCallback(() => {
    cancelPeekClose();
    closeLookup();
  }, [cancelPeekClose, closeLookup]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        setFocusMode((f) => !f);
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
            aria-pressed={hoverLookup}
            onClick={() => setHoverLookup((h) => !h)}
            title="Show definitions when the pointer rests on a word"
          >
            Hover lookup: {hoverLookup ? 'on' : 'off'}
          </button>
          <button
            className="ghost small"
            onClick={() => setFocusMode((f) => !f)}
            title="Toggle focus mode (Ctrl/Cmd + .)"
          >
            {focusMode ? 'Exit focus' : 'Focus'}
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
            hoverLookup={hoverLookup}
            onLookup={handleLookup}
            onHoverEnd={schedulePeekClose}
            onTyping={handleTyping}
            onIssueClick={(issue, x, y) => {
              closeLookup();
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
          onExpand={expandLookup}
          onClose={closeLookup}
          onPointerEnter={cancelPeekClose}
          onPointerLeave={schedulePeekClose}
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
