import React, { useState } from 'react';
import { Note, Collection, Tag } from '../types';
import {
  Search,
  Tag as TagIcon,
  FileText,
  Folder,
  X,
  Trash2,
  Edit3,
  Plus,
  Upload,
  BookOpen,
} from 'lucide-react';

interface NoteListProps {
  notes: Note[];
  allNotes?: Note[];
  collections: Collection[];
  tags: Tag[];
  selectedCollectionId: string | null;
  selectedTagName: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectCollection: (id: string | null) => void;
  onSelectTag: (tagName: string | null) => void;
  onSelectNote: (note: Note) => void;
  onEditNote: (note: Note) => void;
  onDeleteNote: (id: string) => void;
  onCreateNewNote: () => void;
  onOpenUploadModal: () => void;
  onOpenTagModal: () => void;
  onUpdateNoteTags?: (noteId: string, tags: string[]) => Promise<void>;
  isLoading: boolean;
}

const ICON_COLORS = [
  'bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
  'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400',
  'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
  'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
  'bg-purple-100 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400',
];

export const NoteList: React.FC<NoteListProps> = ({
  notes,
  allNotes = [],
  collections,
  tags,
  selectedCollectionId,
  selectedTagName,
  searchQuery,
  onSearchChange,
  onSelectCollection,
  onSelectTag,
  onSelectNote,
  onEditNote,
  onDeleteNote,
  onCreateNewNote,
  onOpenUploadModal,
  onOpenTagModal,
  onUpdateNoteTags,
  isLoading,
}) => {
  const [addingTagNoteId, setAddingTagNoteId] = useState<string | null>(null);
  const [inlineTagValue, setInlineTagValue] = useState('');

  const activeCollection = collections.find((c) => c.id === selectedCollectionId);

  // Build unified tag list with accurate note counts from allNotes + tags
  const sourceNotes = allNotes.length > 0 ? allNotes : notes;
  const tagCountsMap = new Map<string, { name: string; count: number }>();

  for (const t of tags) {
    tagCountsMap.set(t.name.toLowerCase(), {
      name: t.name,
      count: t.noteCount ?? t.note_count ?? 0,
    });
  }
  if (allNotes.length > 0) {
    // Recompute exact counts from allNotes for accuracy
    for (const entry of tagCountsMap.values()) {
      entry.count = 0;
    }
    for (const n of allNotes) {
      const nTags = (n.tags || []).map((t) => (typeof t === 'string' ? t : t.name)).filter(Boolean);
      for (const nt of nTags) {
        const key = nt.toLowerCase();
        const existing = tagCountsMap.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          tagCountsMap.set(key, { name: nt, count: 1 });
        }
      }
    }
  }

  const unifiedTags = Array.from(tagCountsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const handleQuickAddTag = async (note: Note) => {
    if (!onUpdateNoteTags || !inlineTagValue.trim()) return;
    const currentTags: string[] = (note.tags || [])
      .map((t) => (typeof t === 'string' ? t : t.name))
      .filter(Boolean);
    const newParts = inlineTagValue
      .split(',')
      .map((t) => t.trim().replace(/^#+/, '').trim())
      .filter(Boolean);

    const merged = [...currentTags];
    for (const part of newParts) {
      if (!merged.some((m) => m.toLowerCase() === part.toLowerCase())) {
        merged.push(part);
      }
    }

    await onUpdateNoteTags(note.id, merged);
    setInlineTagValue('');
    setAddingTagNoteId(null);
  };

  const handleQuickRemoveTag = async (note: Note, tagToRemove: string) => {
    if (!onUpdateNoteTags) return;
    const currentTags: string[] = (note.tags || [])
      .map((t) => (typeof t === 'string' ? t : t.name))
      .filter(Boolean);
    const updated = currentTags.filter((t) => t.toLowerCase() !== tagToRemove.toLowerCase());
    await onUpdateNoteTags(note.id, updated);
  };

  return (
    <div className="flex-1 bg-[#F8FAFC] dark:bg-[#0F172A] flex flex-col h-screen overflow-y-auto transition-colors">
      <div className="max-w-5xl w-full mx-auto py-8 px-4 sm:px-8 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {activeCollection
                ? `${activeCollection.name} Notes`
                : selectedTagName
                  ? `Notes Tagged #${selectedTagName}`
                  : 'My Notes'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Open any note for manual reading, or use tags on each note for easy searching &amp; memory recall.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenUploadModal}
              className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition"
            >
              <Upload className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Add File from Browser</span>
            </button>
            <button
              type="button"
              onClick={onCreateNewNote}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-blue-600/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create Note</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Controls Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs space-y-4 transition-colors">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input (searches title, content, AND tags) */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search notes by title, content, or #tag for quick memory lookup..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-8 py-2 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 focus:bg-white dark:focus:bg-slate-800 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Collection Dropdown */}
            <select
              value={selectedCollectionId || ''}
              onChange={(e) => onSelectCollection(e.target.value || null)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 cursor-pointer transition"
            >
              <option value="">All Collections</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Easy Tag Search Bar */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
              <TagIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Search by Memory Tag:</span>
            </span>

            <button
              type="button"
              onClick={() => onSelectTag(null)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                !selectedTagName
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              All Notes ({sourceNotes.length})
            </button>

            {unifiedTags.map((t) => {
              const active =
                selectedTagName !== null &&
                selectedTagName.toLowerCase() === t.name.toLowerCase();
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => onSelectTag(active ? null : t.name)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition flex items-center gap-1 ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-blue-50/70 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border-blue-200/70 dark:border-blue-800/70 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                  }`}
                >
                  <span>#{t.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      active ? 'bg-blue-700 text-white' : 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                    }`}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={onOpenTagModal}
              className="px-2.5 py-1 rounded-full text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 transition"
            >
              + New Tag
            </button>

            {(selectedTagName || selectedCollectionId || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  onSelectTag(null);
                  onSelectCollection(null);
                  onSearchChange('');
                }}
                className="ml-auto text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear Filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Notes Feed */}
        {isLoading ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 dark:text-slate-400">Loading your notes...</p>
          </div>
        ) : notes.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">No matching notes found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Create a new note, upload a document from your browser, or clear your current tag/search
              filters.
            </p>
            <div className="flex justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={onCreateNewNote}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
              >
                + Create Note
              </button>
              <button
                type="button"
                onClick={onOpenUploadModal}
                className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold px-4 py-2 rounded-xl transition"
              >
                Upload File
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            {notes.map((note, idx) => {
              const colorClass = ICON_COLORS[idx % ICON_COLORS.length];
              const collectionName =
                note.collectionName || note.collection_name || 'General';
              const dateStr =
                note.updatedAt || note.updated_at || note.createdAt || note.created_at;
              const formattedDate = dateStr
                ? new Date(dateStr).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'Recent';
              const parsedTags: string[] = (note.tags || [])
                .map((t) => (typeof t === 'string' ? t : t.name))
                .filter(Boolean);

              return (
                <div
                  key={note.id}
                  onClick={() => onSelectNote(note)}
                  className="bg-white dark:bg-slate-900 hover:bg-slate-50/70 dark:hover:bg-slate-800/70 rounded-2xl p-5 border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:shadow-md transition cursor-pointer flex flex-col justify-between gap-4 group"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0 flex-1">
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${colorClass}`}
                      >
                        <Folder className="w-5 h-5 fill-current opacity-85" />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition truncate">
                            {note.title || 'Untitled Note'}
                          </h3>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold">
                            <Folder className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                            {collectionName}
                          </span>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">
                            Updated {formattedDate}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                          {note.content}
                        </p>

                        {/* Note's Memory & Search Tags Row */}
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex flex-wrap items-center gap-1.5 pt-1.5"
                        >
                          <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 flex items-center gap-1 mr-0.5">
                            <TagIcon className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                            <span>Tags:</span>
                          </span>

                          {parsedTags.map((tagStr, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[11px] font-semibold border border-blue-200/80 dark:border-blue-800/80 transition"
                            >
                              <button
                                type="button"
                                onClick={() => onSelectTag(tagStr)}
                                title={`Filter notes by #${tagStr}`}
                              >
                                #{tagStr}
                              </button>
                              {onUpdateNoteTags && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickRemoveTag(note, tagStr)}
                                  className="text-blue-400 dark:text-blue-400 hover:text-red-600 dark:hover:text-red-400 p-0.5 rounded-full"
                                  title={`Remove #${tagStr}`}
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </span>
                          ))}

                          {/* Quick inline + Tag button on each note */}
                          {onUpdateNoteTags && (
                            <>
                              {addingTagNoteId === note.id ? (
                                <div className="inline-flex items-center gap-1 bg-slate-50 dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-full px-2 py-0.5">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={inlineTagValue}
                                    onChange={(e) => setInlineTagValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleQuickAddTag(note);
                                      } else if (e.key === 'Escape') {
                                        setAddingTagNoteId(null);
                                        setInlineTagValue('');
                                      }
                                    }}
                                    placeholder="Add tag..."
                                    className="w-24 bg-transparent text-[11px] text-slate-800 dark:text-slate-100 focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleQuickAddTag(note)}
                                    className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 px-1"
                                  >
                                    Add
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAddingTagNoteId(null);
                                      setInlineTagValue('');
                                    }}
                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddingTagNoteId(note.id);
                                    setInlineTagValue('');
                                  }}
                                  className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-dashed border-blue-300 dark:border-blue-700 transition flex items-center gap-0.5"
                                  title="Add a tag to this note for memory & search"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Add Tag</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons (Explicit Read Option + Edit + Delete) */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 shrink-0 self-end sm:self-center"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectNote(note)}
                        className="px-3.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-600 text-blue-600 dark:text-blue-400 hover:text-white border border-blue-200/80 dark:border-blue-800/80 text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs"
                        title="Open Note in Manual Reader Mode"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Read</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditNote(note)}
                        className="px-3 py-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition"
                        title="Edit Note"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete note "${note.title}"?`)) {
                            onDeleteNote(note.id);
                          }
                        }}
                        className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 border border-transparent hover:border-red-200 dark:hover:border-red-800 rounded-xl transition"
                        title="Delete Note"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
