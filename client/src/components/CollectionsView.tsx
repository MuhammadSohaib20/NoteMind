import React, { useState } from 'react';
import { Collection } from '../types';
import {
  Plus,
  Folder,
  Lightbulb,
  MoreVertical,
  ArrowRight,
  Edit2,
  Trash2,
} from 'lucide-react';

interface CollectionsViewProps {
  collections: Collection[];
  onOpenNewCollection: () => void;
  onEditCollection: (col: Collection) => void;
  onDeleteCollection: (id: string) => void;
  onSelectCollectionView: (collectionId: string) => void;
}

const CARD_STYLES = [
  { bg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400', isIdea: false },
  { bg: 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400', isIdea: false },
  { bg: 'bg-purple-100 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400', isIdea: false },
  { bg: 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400', isIdea: true },
  { bg: 'bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400', isIdea: false },
];

export const CollectionsView: React.FC<CollectionsViewProps> = ({
  collections,
  onOpenNewCollection,
  onEditCollection,
  onDeleteCollection,
  onSelectCollectionView,
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  return (
    <div className="flex-1 bg-[#F8FAFC] dark:bg-[#0F172A] flex flex-col h-screen overflow-y-auto transition-colors">
      <div className="max-w-5xl w-full mx-auto py-8 px-4 sm:px-8 space-y-7">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Collections</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Organize your notes into collections.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenNewCollection}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-blue-600/20 flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              <span>New Collection</span>
            </button>
          </div>
        </div>

        {/* Collections Grid */}
        {collections.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
              <Folder className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">No collections yet</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Create collections like &ldquo;CS Notes&rdquo;, &ldquo;Study Guide&rdquo;, or
              &ldquo;Project Ideas&rdquo; to keep your notes organized.
            </p>
            <button
              type="button"
              onClick={onOpenNewCollection}
              className="mt-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
            >
              + Create First Collection
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {collections.map((col, idx) => {
              const style = CARD_STYLES[idx % CARD_STYLES.length];
              const count =
                col.noteCount !== undefined ? col.noteCount : col.note_count || 0;
              const isIdeaIcon =
                col.name.toLowerCase().includes('idea') || style.isIdea;

              return (
                <div
                  key={col.id}
                  onClick={() => onSelectCollectionView(col.id)}
                  className="bg-white dark:bg-slate-900 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-6 shadow-2xs hover:shadow-md transition cursor-pointer flex flex-col justify-between relative group"
                >
                  <div>
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center ${style.bg}`}
                      >
                        {isIdeaIcon ? (
                          <Lightbulb className="w-5 h-5" />
                        ) : (
                          <Folder className="w-5 h-5 fill-current opacity-85" />
                        )}
                      </div>

                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === col.id ? null : col.id);
                          }}
                          className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {openMenuId === col.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 mt-1 w-36 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 py-1 z-20"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                onEditCollection(col);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                              <span>Rename</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                if (confirm(`Delete collection "${col.name}"?`)) {
                                  onDeleteCollection(col.id);
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

                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                      {col.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {count} {count === 1 ? 'note' : 'notes'}
                    </p>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform">
                    <span>View</span>
                    <ArrowRight className="w-3.5 h-3.5" />
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
