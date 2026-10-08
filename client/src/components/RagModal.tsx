import React, { useState } from 'react';
import { Sparkles, Search, X, FileText, ArrowRight, Bot, Zap } from 'lucide-react';
import { useRag } from '../hooks/useRag';
import { Note } from '../types';

interface RagModalProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Note[];
  onSelectNote: (note: Note) => void;
}

export const RagModal: React.FC<RagModalProps> = ({ isOpen, onClose, notes, onSelectNote }) => {
  const [question, setQuestion] = useState('');
  const { askRag, isAsking, data, error } = useRag();

  if (!isOpen) return null;

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    await askRag({ question: question.trim(), topK: 3 });
  };

  const handleOpenRetrievedNote = (title: string) => {
    const found = notes.find((n) => n.title.toLowerCase() === title.toLowerCase() || n.title.includes(title));
    if (found) {
      onSelectNote(found);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-gray-900">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="font-bold text-white text-base leading-tight flex items-center gap-2">
                NoteMind RAG AI Assistant
                <span className="text-[10px] bg-blue-600/30 text-blue-300 font-mono px-2 py-0.5 rounded-full border border-blue-500/30">
                  pgvector
                </span>
              </h2>
              <p className="text-xs text-gray-400">Ask questions against your notes using vector similarity search</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Input Bar */}
        <form onSubmit={handleAsk} className="p-4 border-b border-gray-800 bg-gray-950/50">
          <div className="relative flex items-center">
            <Search className="absolute left-4 w-4 h-4 text-blue-400" />
            <input
              type="text"
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask anything about your notes... (e.g. 'What tools are used for Express API?')"
              className="w-full bg-gray-800 border border-gray-700/80 rounded-xl pl-11 pr-28 py-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
            />
            <button
              type="submit"
              disabled={isAsking || !question.trim()}
              className="absolute right-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-lg transition disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-blue-600/20"
            >
              {isAsking ? (
                <span>Searching...</span>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>Ask AI</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-950/50 border border-red-800 rounded-xl text-xs text-red-300">
              Failed to query AI Vector Search. Please try again.
            </div>
          )}

          {!data && !isAsking && (
            <div className="py-12 text-center space-y-3">
              <Bot className="w-12 h-12 text-gray-700 mx-auto" />
              <p className="text-sm font-semibold text-gray-300">Ask NoteMind AI Anything</p>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                NoteMind indexes your notes using PostgreSQL <code className="text-blue-400">pgvector</code> embeddings to retrieve relevant note chunks and synthesize accurate answers.
              </p>
            </div>
          )}

          {isAsking && (
            <div className="py-12 text-center space-y-3">
              <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-blue-400 font-mono">Performing cosine similarity search across note embeddings...</p>
            </div>
          )}

          {data && (
            <div className="space-y-6">
              {/* Answer Card */}
              <div className="p-5 bg-gradient-to-b from-blue-950/30 to-gray-900 border border-blue-900/40 rounded-2xl space-y-2 shadow-lg">
                <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold uppercase tracking-wider">
                  <Bot className="w-4 h-4" />
                  <span>AI Synthesized Answer</span>
                </div>
                <p className="text-sm text-gray-200 leading-relaxed font-sans">{data.answer}</p>
              </div>

              {/* Retrieved Notes Sources */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Retrieved Context Sources ({data.retrievedNotes.length})
                </h3>

                <div className="space-y-3">
                  {data.retrievedNotes.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">No notes matched vector threshold.</p>
                  ) : (
                    data.retrievedNotes.map((item, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleOpenRetrievedNote(item.title)}
                        className="p-4 bg-gray-800/60 hover:bg-gray-800 border border-gray-700/60 rounded-xl transition cursor-pointer group"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-400" />
                            <span className="font-semibold text-sm text-white group-hover:text-blue-400 transition">
                              {item.title}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                            {item.similarity}% Match
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{item.content}</p>
                        <div className="mt-2.5 flex items-center justify-end text-[11px] text-blue-400 font-medium opacity-0 group-hover:opacity-100 transition">
                          Open in Editor <ArrowRight className="w-3 h-3 ml-1" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
