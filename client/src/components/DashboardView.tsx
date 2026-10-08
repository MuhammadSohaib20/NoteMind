import React, { useState } from 'react';
import { Note, Tag, ViewMode } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  Search,
  Brain,
  FilePlus2,
  Sparkles,
  FolderKanban,
  FileSpreadsheet,
  ArrowRight,
  MoreVertical,
  Folder,
  Tag as TagIcon,
  Eye,
  BookOpen,
  Edit3,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

interface DashboardViewProps {
  notes: Note[];
  tags: Tag[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onNavigate: (view: ViewMode) => void;
  onCreateNewNote: () => void;
  onOpenUploadModal: () => void;
  onOpenNoteView: (note: Note) => void;
  onEditNote: (note: Note) => void;
  onDeleteNote: (id: string) => void;
  onSelectTagFilter: (tagName: string) => void;
}

const FOLDER_ICON_STYLES = [
  'bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
  'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400',
  'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
  'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
  'bg-purple-100 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400',
];

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return 'Updated recently';
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Updated just now';
  if (diffMins < 60) return `Updated ${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Updated ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `Updated ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  notes,
  tags,
  searchQuery,
  onSearchChange,
  onNavigate,
  onCreateNewNote,
  onOpenUploadModal,
  onOpenNoteView,
  onEditNote,
  onDeleteNote,
  onSelectTagFilter,
}) => {
  const { user } = useAuth();
  const [menuOpenNoteId, setMenuOpenNoteId] = useState<string | null>(null);

  const displayName = user?.fullName || (user?.email ? user.email.split('@')[0] : 'Guest User');
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Live filter notes by searchQuery (matching title, content, collection, or tags)
  const qTrimmed = searchQuery.trim().toLowerCase();
  const qTag = qTrimmed.replace(/^#+/, '').trim();
  const filteredNotes = qTrimmed
    ? notes.filter((n) => {
        const titleMatch = (n.title || '').toLowerCase().includes(qTrimmed);
        const contentMatch = (n.content || '').toLowerCase().includes(qTrimmed);
        const colMatch = (n.collectionName || n.collection_name || '')
          .toLowerCase()
          .includes(qTrimmed);
        const noteTags = (n.tags || []).map((t) =>
          (typeof t === 'string' ? t : t.name).toLowerCase()
        );
        const tagMatch = qTag ? noteTags.some((t) => t.includes(qTag)) : false;
        return titleMatch || contentMatch || colMatch || tagMatch;
      })
    : notes.slice(0, 6);

  // Build unified tags list from both tags table and notes
  const tagMap = new Map<string, { name: string; count: number }>();
  for (const t of tags) {
    tagMap.set(t.name.toLowerCase(), { name: t.name, count: 0 });
  }
  for (const n of notes) {
    const nTags = (n.tags || []).map((t) => (typeof t === 'string' ? t : t.name)).filter(Boolean);
    for (const nt of nTags) {
      const key = nt.toLowerCase();
      const existing = tagMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        tagMap.set(key, { name: nt, count: 1 });
      }
    }
  }
  const unifiedTags = Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex-1 bg-[#F8FAFC] dark:bg-[#0F172A] flex flex-col h-screen overflow-hidden transition-colors">
      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-7 max-w-6xl mx-auto w-full">
        {/* Search Bar */}
        <div className="relative w-full max-w-md mx-auto sm:mx-0">
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                onNavigate('notes');
              }
            }}
            placeholder="Search your notes by title, content, or #tag..."
            className="w-full bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 rounded-xl pl-10 pr-8 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 focus:bg-white dark:focus:bg-slate-800 transition shadow-2xs"
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

        {/* Hero Greeting Banner */}
        <div className="rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 text-white p-6 sm:p-8 shadow-lg shadow-blue-500/15 relative overflow-hidden flex items-center justify-between">
          <div className="space-y-2 max-w-xl relative z-10">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {greeting}, {displayName}!
            </h1>
            <p className="text-blue-50 text-xs sm:text-sm leading-relaxed">
              Your knowledge grows here. Create notes, upload documents from your browser, explore
              your collections, or ask a question about your notes.
            </p>
          </div>

          <div className="hidden md:flex w-20 h-20 rounded-full bg-white/15 backdrop-blur-xs items-center justify-center border border-white/25 shrink-0 relative z-10">
            <Brain className="w-10 h-10 text-white/90" />
          </div>

          {/* Decorative circles */}
          <div className="absolute -right-8 -bottom-12 w-48 h-48 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute right-24 -top-12 w-32 h-32 rounded-full bg-cyan-300/20 pointer-events-none" />
        </div>

        {/* 4 Quick Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Card 1: Create Note */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/60 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4">
                <FilePlus2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Create Note</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Write a new note, add tags, or upload files from browser.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={onCreateNewNote}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-xl text-xs transition shadow-xs"
              >
                New Note
              </button>
              <button
                onClick={onOpenUploadModal}
                className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition"
                title="Upload file from browser"
              >
                <Upload className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Card 2: Ask My Notes */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/60 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Ask My Notes</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Get answers from your own notes using AI.
              </p>
            </div>
            <button
              onClick={() => onNavigate('ask-ai')}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-xl text-xs transition shadow-xs"
            >
              Ask Now
            </button>
          </div>

          {/* Card 3: View Collections */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
                <FolderKanban className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">View Collections</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Organize your notes into collections.
              </p>
            </div>
            <button
              onClick={() => onNavigate('collections')}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-xl text-xs transition shadow-xs"
            >
              Browse
            </button>
          </div>

          {/* Card 4: Manage Notes */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200/60 dark:border-rose-800/60 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-4">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Manage Notes</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                See all your notes &amp; search by tags in one place.
              </p>
            </div>
            <button
              onClick={() => onNavigate('notes')}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-xl text-xs transition shadow-xs"
            >
              View All
            </button>
          </div>
        </div>

        {/* Quick Search by Tags Bar */}
        {unifiedTags.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl px-5 py-3.5 border border-slate-200/80 dark:border-slate-800 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mr-1">
              <TagIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Memory &amp; Search Tags:</span>
            </span>
            {unifiedTags.map((tag) => (
              <button
                key={tag.name}
                onClick={() => onSelectTagFilter(tag.name)}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-200/60 dark:border-blue-800/60 transition flex items-center gap-1"
              >
                <span>#{tag.name}</span>
                {tag.count > 0 && (
                  <span className="text-[10px] opacity-75">({tag.count})</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Recent / Filtered Notes Section */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {qTrimmed
                ? `Search Results for "${searchQuery}" (${filteredNotes.length})`
                : 'Recent Notes'}
            </h2>
            <button
              onClick={() => onNavigate('notes')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {filteredNotes.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-10 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {qTrimmed ? 'No notes match your search or tag' : 'No notes created yet'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {qTrimmed
                  ? 'Try searching for another keyword or #tag, or create a new note.'
                  : 'Create your first note or upload a document from your browser to get started.'}
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  onClick={onCreateNewNote}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
                >
                  + Create New Note
                </button>
                <button
                  onClick={onOpenUploadModal}
                  className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold px-4 py-2 rounded-xl transition flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload File
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredNotes.map((note, idx) => {
                const iconStyle = FOLDER_ICON_STYLES[idx % FOLDER_ICON_STYLES.length];
                const collectionName =
                  note.collectionName || note.collection_name || 'General';
                const updatedStr = formatRelativeTime(
                  note.updatedAt || note.updated_at || note.createdAt || note.created_at
                );
                const parsedTags: string[] = (note.tags || [])
                  .map((t) => (typeof t === 'string' ? t : t.name))
                  .filter(Boolean);

                return (
                  <div
                    key={note.id}
                    onClick={() => onOpenNoteView(note)}
                    className="bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/80 rounded-2xl px-5 py-4 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center justify-between cursor-pointer transition group relative"
                  >
                    <div className="flex items-center gap-4 min-w-0 pr-4">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconStyle}`}
                      >
                        <Folder className="w-5 h-5 fill-current opacity-85" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                          {note.title || 'Untitled Note'}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                          <span>{updatedStr}</span>
                          <span>&bull;</span>
                          <span className="font-medium text-slate-600 dark:text-slate-300">{collectionName}</span>
                          {parsedTags.map((t, i) => (
                            <span
                              key={i}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectTagFilter(t);
                              }}
                              className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-[10px] font-semibold border border-blue-200/60 dark:border-blue-800/60 hover:bg-blue-600 hover:text-white transition"
                              title={`Search all notes tagged #${t}`}
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Explicit Read Button + Three-dots action button */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 shrink-0"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenNoteView(note)}
                        className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-600 text-blue-600 dark:text-blue-400 hover:text-white border border-blue-200/80 dark:border-blue-800/80 text-xs font-semibold flex items-center gap-1.5 transition"
                        title="Open note for manual reading"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Read</span>
                      </button>

                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setMenuOpenNoteId(menuOpenNoteId === note.id ? null : note.id)
                          }
                          className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {menuOpenNoteId === note.id && (
                          <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 py-1 z-20">
                            <button
                              onClick={() => {
                                setMenuOpenNoteId(null);
                                onOpenNoteView(note);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                              <span>Read Note</span>
                            </button>
                            <button
                              onClick={() => {
                                setMenuOpenNoteId(null);
                                onEditNote(note);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                              <span>Edit Note</span>
                            </button>
                            <button
                              onClick={() => {
                                setMenuOpenNoteId(null);
                                if (confirm(`Delete "${note.title}"?`)) {
                                  onDeleteNote(note.id);
                                }
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
