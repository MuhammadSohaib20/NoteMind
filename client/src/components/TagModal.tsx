import React, { useState, useEffect } from 'react';
import { Tag as TagIcon, X } from 'lucide-react';
import { Tag } from '../types';

interface TagModalProps {
  isOpen: boolean;
  onClose: () => void;
  tagToEdit?: Tag | null;
  onCreateTag: (name: string) => Promise<any>;
  onUpdateTag: (payload: { id: string; name: string }) => Promise<any>;
}

export const TagModal: React.FC<TagModalProps> = ({
  isOpen,
  onClose,
  tagToEdit,
  onCreateTag,
  onUpdateTag,
}) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tagToEdit) {
      setName(tagToEdit.name);
    } else {
      setName('');
    }
    setError(null);
  }, [tagToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = name.trim().replace(/^#/, '');
    if (!cleaned) {
      setError('Tag name cannot be empty');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (tagToEdit) {
        await onUpdateTag({ id: tagToEdit.id, name: cleaned });
      } else {
        await onCreateTag(cleaned);
      }
      setName('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save tag');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden transition-colors">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
            <TagIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>{tagToEdit ? 'Rename Tag' : 'Create New Tag'}</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 p-2.5 rounded-xl border border-red-200 dark:border-red-800/80">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Tag Name</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Operating System, Exam, AI"
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 text-xs sm:text-sm transition"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition disabled:opacity-50"
            >
              {loading ? 'Saving...' : tagToEdit ? 'Update Tag' : 'Create Tag'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
