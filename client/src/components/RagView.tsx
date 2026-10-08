import React, { useState } from 'react';
import {
  Brain,
  Send,
  Sparkles,
  FileText,
  Folder,
  Tag as TagIcon,
  Copy,
  Check,
} from 'lucide-react';
import { useRag } from '../hooks/useRag';
import { useAuth } from '../context/AuthContext';
import { Note, Collection, Tag } from '../types';

interface RagViewProps {
  notes: Note[];
  collections: Collection[];
  tags: Tag[];
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

export const RagView: React.FC<RagViewProps> = ({
  notes,
  collections,
  tags,
  onSelectNote,
}) => {
  const { user } = useAuth();
  const { askRag, isAsking, error } = useRag();

  const [question, setQuestion] = useState('');
  const [selectedCollectionFilter, setSelectedCollectionFilter] = useState<string>('all');
  const [checkedCollections, setCheckedCollections] = useState<Record<string, boolean>>({});
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const displayName = user?.fullName || 'Muhammad Sohaib';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const isCollectionChecked = (colId: string) => {
    if (checkedCollections[colId] === undefined) return true;
    return checkedCollections[colId];
  };

  const toggleCollectionSource = (colId: string) => {
    setCheckedCollections((prev) => ({
      ...prev,
      [colId]: !isCollectionChecked(colId),
    }));
  };

  const submitQuestion = async (qText: string) => {
    const trimmed = qText.trim();
    if (!trimmed) return;
    setQuestion('');

    try {
      const res = await askRag({ question: trimmed, topK: 4 });
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
    <div className="flex-1 bg-[#F8FAFC] dark:bg-[#0F172A] flex flex-col h-screen overflow-hidden transition-colors">


      {/* Main Content + Right Filter Panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Center Chat Area */}
        <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-hidden">
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
                    Ask me anything...
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
                <div className="space-y-6 max-w-3xl mx-auto w-full">
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

                        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                          {turn.answer}
                        </p>

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
                      <span>Searching your notes and generating answer...</span>
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
                placeholder="Ask a question about your notes..."
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

        {/* Right Sources & Search Filter Sidebar */}
        <aside className="hidden lg:block w-68 bg-white dark:bg-slate-900 border-l border-slate-200/80 dark:border-slate-800 p-6 space-y-6 shrink-0 overflow-y-auto">
          {/* Search in dropdown */}
          <div>
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">Search in</label>
            <select
              value={selectedCollectionFilter}
              onChange={(e) => setSelectedCollectionFilter(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 cursor-pointer transition"
            >
              <option value="all">All Collections</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sources Checkboxes */}
          <div>
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-3">Sources</label>
            <div className="space-y-2.5">
              {collections.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">All notes included</p>
              ) : (
                collections.map((col) => (
                  <label
                    key={col.id}
                    className="flex items-center gap-2.5 cursor-pointer select-none text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  >
                    <input
                      type="checkbox"
                      checked={isCollectionChecked(col.id)}
                      onChange={() => toggleCollectionSource(col.id)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-blue-600 focus:ring-blue-500"
                    />
                    <Folder className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0" />
                    <span className="truncate">{col.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Tags Quick Ask */}
          {tags.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2.5">
                Ask by Tag Topic
              </label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => submitQuestion(`Summarize my notes tagged with #${t.name}`)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-600 text-blue-600 dark:text-blue-400 hover:text-white text-[11px] font-medium border border-blue-200/60 dark:border-blue-800/60 transition"
                  >
                    <TagIcon className="w-2.5 h-2.5" />
                    <span>#{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
