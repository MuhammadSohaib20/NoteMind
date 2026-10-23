import React, { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  Send,
  Sparkles,
  FileText,
  Copy,
  Check,
  Search,
} from 'lucide-react';
import { useRag } from '../hooks/useRag';
import { useNotes } from '../hooks/useNotes';
import { useAuth } from '../context/AuthContext';
import { Note, Collection } from '../types';
import { MarkdownContent } from './MarkdownContent';

interface RagViewProps {
  notes: Note[];
  collections: Collection[];
  onSelectNote: (note: Note) => void;
}

interface ChatTurn {
  question: string;
  answer: string;
  sources: {
    id?: string;
    title: string;
    content: string;
    collectionName?: string;
    tags?: string[];
    similarity: number;
  }[];
}

/** POST /notes/index accepts at most 50 ids per request. */
const INDEX_BATCH_SIZE = 50;

export const RagView: React.FC<RagViewProps> = ({ notes, collections, onSelectNote }) => {
  const { user } = useAuth();
  const { askRag, isAsking, error } = useRag();
  const { indexNotes } = useNotes();

  const [question, setQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // AI Index panel state. The selection is intentionally NOT persisted: every
  // visit starts fresh, so the assistant only ever analyses the notes the
  // user ticked for the current session.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [indexingIds, setIndexingIds] = useState<Set<string>>(new Set());
  const [noteFilter, setNoteFilter] = useState('');
  const [collectionFilter, setCollectionFilter] = useState<string>('all');
  const [indexError, setIndexError] = useState<string | null>(null);

  // The free AI tier can be busy (the primary model often answers with 503
  // "high demand" and the app fails over to a fallback model). After 15s of
  // waiting we say so instead of spinning silently.
  const [askElapsed, setAskElapsed] = useState(0);
  useEffect(() => {
    if (!isAsking) {
      setAskElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(
      () => setAskElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    );
    return () => clearInterval(timer);
  }, [isAsking]);

  const displayName = user?.fullName || 'Muhammad Sohaib';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Notes listed in the panel: scoped by the collection dropdown, then by the
  // text filter — this is the "pick the specific notes" selector.
  const listedNotes = useMemo(() => {
    const q = noteFilter.trim().toLowerCase();
    return notes.filter((note) => {
      if (collectionFilter === 'none') {
        if (note.collectionId) return false;
      } else if (collectionFilter !== 'all') {
        if (note.collectionId !== collectionFilter) return false;
      }
      return !q || note.title.toLowerCase().includes(q);
    });
  }, [notes, noteFilter, collectionFilter]);

  const listedReadyCount = listedNotes.filter((n) => n.indexed).length;
  const hasUncategorizedNotes = notes.some((n) => !n.collectionId);

  const markIndexing = (ids: string[], on: boolean) => {
    setIndexingIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const runIndexing = async (ids: string[]) => {
    if (ids.length === 0) return;
    markIndexing(ids, true);
    setIndexError(null);
    try {
      const batches: string[][] = [];
      for (let i = 0; i < ids.length; i += INDEX_BATCH_SIZE) {
        batches.push(ids.slice(i, i + INDEX_BATCH_SIZE));
      }
      await Promise.all(batches.map((batch) => indexNotes({ noteIds: batch })));
    } catch {
      setIndexError('Some notes could not be indexed. Check the server (GEMINI_API_KEY) and try again.');
    } finally {
      markIndexing(ids, false);
    }
  };

  // Ticking a note = "the AI may analyse this note". Unticked notes are
  // excluded from the search; unindexed notes get embedded right now.
  const toggleNoteIndex = (note: Note) => {
    const isSelected = selectedIds.has(note.id);
    if (isSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(note.id);
        return next;
      });
      return;
    }
    setSelectedIds((prev) => new Set(prev).add(note.id));
    if (!note.indexed) {
      void runIndexing([note.id]);
    }
  };

  const selectAllShown = () => {
    const shownIds = listedNotes.map((n) => n.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of shownIds) next.add(id);
      return next;
    });
    const toIndex = listedNotes.filter((n) => !n.indexed).map((n) => n.id);
    void runIndexing(toIndex);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Scope: only the ticked notes are searched. Nothing ticked = search all
  // indexed notes (the panel hint explains this). The backend caps noteIds
  // at 200, so oversized selections are trimmed to that.
  const scopedNoteIds =
    selectedIds.size > 0 ? Array.from(selectedIds).slice(0, 200) : undefined;

  const submitQuestion = async (qText: string) => {
    const trimmed = qText.trim();
    if (!trimmed) return;
    setQuestion('');

    try {
      const res = await askRag({ question: trimmed, topK: 4, noteIds: scopedNoteIds });
      if (res) {
        setChatHistory((prev) => [
          ...prev,
          {
            question: trimmed,
            answer: res.answer,
            sources: res.retrievedNotes || [],
          },
        ]);
      }
    } catch {
      // handled by error state
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitQuestion(question);
  };

  const handleOpenSourceNote = (noteId?: string, title?: string) => {
    let found: Note | undefined;
    if (noteId) {
      found = notes.find((n) => n.id === noteId);
    }
    if (!found && title) {
      found = notes.find(
        (n) =>
          n.title.toLowerCase() === title.toLowerCase() ||
          n.title.toLowerCase().includes(title.toLowerCase())
      );
    }
    if (found) {
      onSelectNote(found);
    }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const samplePrompts = [
    'Summarize my CS notes',
    'What are the key concepts in Operating System?',
    'Find information about my project ideas',
  ];

  return (
    <div className="flex-1 min-h-0 bg-[#F8FAFC] dark:bg-[#0F172A] flex flex-col h-full overflow-hidden transition-colors">

      {/* Main Content + Right AI Index Panel */}
      <div className="flex-1 min-h-0 min-w-0 flex overflow-hidden">
        {/* Center Chat Area */}
        <div className="flex-1 min-w-0 flex flex-col p-3 sm:p-5 overflow-hidden">
          <div className="flex-1 bg-slate-100/70 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800 rounded-2xl flex flex-col overflow-hidden">
            {/* Scrollable Messages / Welcome View */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {chatHistory.length === 0 && !isAsking ? (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-8">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 shadow-xs">
                    <Brain className="w-8 h-8" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 leading-relaxed">
                    Hi! I can help you find information from your notes.
                    <br />
                    Tick the notes on the right for me to analyse, then ask away...
                  </p>

                  {/* Preset Prompt Buttons */}
                  <div className="mt-6 flex flex-col items-center gap-2.5 w-full">
                    {samplePrompts.map((prompt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => submitQuestion(prompt)}
                        className="px-4 py-2 bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/80 dark:border-blue-800/80 rounded-xl text-xs font-medium shadow-2xs transition flex items-center gap-2"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0" />
                        <span>{prompt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6 max-w-5xl mx-auto w-full">
                  {chatHistory.map((turn, idx) => (
                    <div key={idx} className="space-y-3">
                      {/* User Question Bubble */}
                      <div className="flex justify-end">
                        <div className="bg-blue-600 text-white text-xs sm:text-sm font-medium px-4 py-2.5 rounded-2xl rounded-tr-xs max-w-md shadow-xs">
                          {turn.question}
                        </div>
                      </div>

                      {/* AI Response Card */}
                      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400">
                            <Brain className="w-4 h-4" />
                            <span>NoteMind AI</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopy(turn.answer, idx)}
                            className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1"
                          >
                            {copiedIdx === idx ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>

                        <MarkdownContent text={turn.answer} />

                        {/* Source Citations */}
                        {turn.sources.length > 0 && (
                          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                              Matched Notes ({turn.sources.length})
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {turn.sources.map((src, sIdx) => (
                                <div
                                  key={sIdx}
                                  onClick={() => handleOpenSourceNote(src.id, src.title)}
                                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50/60 dark:hover:bg-blue-950/60 border border-slate-200/80 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 cursor-pointer transition"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">
                                      <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                                      {src.title}
                                    </span>
                                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                      {src.similarity}%
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                                    {src.content}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {isAsking && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300 shadow-xs">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span>
                        {askElapsed >= 15
                          ? `Still working (${askElapsed}s) — the free AI tier can be busy, but this always finishes: an answer in about a minute, or a direct extract from your notes if the AI stays unavailable.`
                          : 'Searching your notes and generating answer...'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="p-3.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/80 rounded-xl text-xs text-red-600 dark:text-red-400 max-w-xl mx-auto">
                  Unable to query AI right now. Please make sure your notes are saved.
                </div>
              )}
            </div>

            {/* Bottom Input Bar */}
            <form
              onSubmit={handleFormSubmit}
              className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 flex items-center gap-3"
            >
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={
                  selectedIds.size > 0
                    ? `Ask about your ${selectedIds.size} selected note${selectedIds.size === 1 ? '' : 's'}...`
                    : 'Ask a question about your notes...'
                }
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 focus:bg-white dark:focus:bg-slate-800 transition"
              />
              <button
                type="submit"
                disabled={isAsking || !question.trim()}
                className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition shadow-sm disabled:opacity-50 shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* Right AI Index Panel — pick which notes the assistant may analyse */}
        <aside className="hidden lg:flex lg:flex-col w-64 xl:w-72 2xl:w-80 bg-white dark:bg-slate-900 border-l border-slate-200/80 dark:border-slate-800 shrink-0">
          <div className="p-4 xl:p-5 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                <Sparkles className="w-4 h-4 text-violet-500 dark:text-violet-400" />
                <span>AI Index</span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                {listedReadyCount}/{listedNotes.length} ready
              </span>
            </div>

            {/* Collection dropdown — scope the note list to one collection */}
            <select
              value={collectionFilter}
              onChange={(e) => setCollectionFilter(e.target.value)}
              className="w-full mt-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-violet-600 dark:focus:border-violet-400 cursor-pointer transition"
            >
              <option value="all">📁 All Collections</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  📁 {c.name}
                </option>
              ))}
              {hasUncategorizedNotes && <option value="none">📄 Uncategorized</option>}
            </select>

            {/* Filter box */}
            <div className="relative mt-2.5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={noteFilter}
                onChange={(e) => setNoteFilter(e.target.value)}
                placeholder="Find a note..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition"
              />
            </div>

            <div className="flex items-center justify-between mt-2.5">
              <button
                type="button"
                onClick={selectAllShown}
                disabled={listedNotes.length === 0}
                className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-40 disabled:hover:no-underline"
              >
                ✓ Select shown
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={selectedIds.size === 0}
                className="text-[11px] font-medium text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-40 disabled:hover:no-underline"
              >
                ✕ Clear
              </button>
            </div>
          </div>

          {/* Scrollable note checklist */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {notes.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic p-3 leading-relaxed">
                No notes yet. Create notes in My Notes, then tick them here so I can analyse them.
              </p>
            ) : listedNotes.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic p-3 leading-relaxed">
                No notes here{noteFilter ? ` matching "${noteFilter}"` : ' in this collection'}.
              </p>
            ) : (
              listedNotes.map((note) => {
                const isIndexingNow = indexingIds.has(note.id);
                return (
                  <label
                    key={note.id}
                    className="flex items-start gap-2.5 p-2 rounded-lg cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-800/60 transition"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(note.id)}
                      onChange={() => toggleNoteIndex(note)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-violet-600 focus:ring-violet-500 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                        {note.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-[10px]">
                        {isIndexingNow ? (
                          <>
                            <span className="w-2.5 h-2.5 border-[1.5px] border-violet-500 border-t-transparent rounded-full animate-spin" />
                            <span className="text-violet-600 dark:text-violet-400 font-semibold">Indexing...</span>
                          </>
                        ) : note.indexed ? (
                          <>
                            <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Ready</span>
                          </>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">
                            Not indexed — indexes on tick
                          </span>
                        )}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {/* Panel footer hint + error */}
          <div className="p-3.5 xl:p-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
            {indexError && (
              <p className="text-[11px] text-red-500 dark:text-red-400 leading-relaxed">{indexError}</p>
            )}
            <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              {selectedIds.size > 0 ? (
                <>
                  I will analyse only your{' '}
                  <span className="font-semibold text-violet-600 dark:text-violet-400">
                    {selectedIds.size} ticked note{selectedIds.size === 1 ? '' : 's'}
                  </span>{' '}
                  for this session.
                </>
              ) : (
                <>Nothing ticked — I will search all indexed notes.</>
              )}{' '}
              Your selection resets next visit.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};
