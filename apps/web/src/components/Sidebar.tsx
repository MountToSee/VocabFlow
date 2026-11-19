import { noteTitle, type Note } from '../lib/notes';

interface Props {
  notes: Note[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

export function Sidebar({ notes, activeId, onSelect, onCreate, onDelete }: Props) {
  const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <aside className="sidebar" aria-label="Notes">
      <div className="sidebar-header">
        <span className="brand">VocabFlow</span>
        <button className="ghost" onClick={onCreate} title="New note" aria-label="New note">
          +
        </button>
      </div>
      <ul className="note-list">
        {sorted.map((note) => (
          <li key={note.id} className={note.id === activeId ? 'active' : ''}>
            <button className="note-item" onClick={() => onSelect(note.id)}>
              <span className="note-title">{noteTitle(note)}</span>
              <span className="note-date">{new Date(note.updatedAt).toLocaleDateString()}</span>
            </button>
            {notes.length > 1 && (
              <button
                className="ghost delete"
                aria-label={`Delete ${noteTitle(note)}`}
                onClick={() => onDelete(note.id)}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
