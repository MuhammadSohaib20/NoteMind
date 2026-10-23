import React from 'react';
import { Note, Tag, ViewMode } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  Search,
  Brain,
  FilePlus2,
  Sparkles,
  FolderKanban,
  FileSpreadsheet,
  Tag as TagIcon,
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
  onSelectTagFilter: (tagName: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  notes,
  tags,
  searchQuery,
  onSearchChange,
  onNavigate,
  onCreateNewNote,
  onOpenUploadModal,
  onSelectTagFilter,
}) => {
  const { user } = useAuth();

  const displayName = user?.fullName?.trim() || user?.email.split('@')[0] || 'there';
  const firstName = displayName.split(/\s+/)[0];

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
            placeholder="Search notes (press Enter to view results)..."
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
              Welcome {firstName}
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

      </div>
    </div>
  );
};
