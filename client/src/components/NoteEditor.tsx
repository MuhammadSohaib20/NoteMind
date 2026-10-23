import React, { useState, useEffect, useRef } from 'react';
import { Note, Collection, Tag } from '../types';
import { ThemeToggle } from './ThemeToggle';
import {
  Plus,
  Tag as TagIcon,
  Upload,
  FileText,
  X,
  Bold,
  Italic,
  Underline,
  Link as LinkIcon,
  Code,
  List,
  ListOrdered,
  Quote,
  Search,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface NoteEditorProps {
  activeNote: Note | null;
  collections: Collection[];
  availableTags: Tag[];
  onSave: (payload: {
    id?: string;
    title: string;
    content: string;
    collectionId?: string;
    tags?: string[];
  }) => Promise<void>;
  onUploadFile: (payload: {
    file: File;
    collectionId?: string;
    tags?: string[];
  }) => Promise<Note | undefined>;
  onCancel: () => void;
  onOpenNewCollection: () => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  activeNote,
  collections,
  availableTags,
  onSave,
  onUploadFile,
  onCancel,
  onOpenNewCollection,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [collectionId, setCollectionId] = useState<string>('');
  const [tagsInput, setTagsInput] = useState('');
  const [tagsList, setTagsList] = useState<string[]>([]);
  const [selectedBrowserFile, setSelectedBrowserFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileStatus, setFileStatus] = useState<string | null>(null);

  // The upload+extract step can legitimately run for a couple of minutes on a
  // large scanned PDF; tick a timer while saving so the button shows progress.
  useEffect(() => {
    if (!saving) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    );
    return () => clearInterval(timer);
  }, [saving]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isEditing = Boolean(activeNote?.id && activeNote.id.trim() !== '');

  useEffect(() => {
    if (activeNote) {
      setTitle(activeNote.title || '');
      setContent(activeNote.content || '');
      setCollectionId(activeNote.collectionId || activeNote.collection_id || '');
      const parsed: string[] = (activeNote.tags || []).map((t) =>
        typeof t === 'string' ? t : t.name
      );
      setTagsList(parsed);
    } else {
      setTitle('');
      setContent('');
      setCollectionId('');
      setTagsList([]);
    }
    setSelectedBrowserFile(null);
    setError(null);
    setFileStatus(null);
  }, [activeNote]);

  const parseAndMergeTags = (existing: string[], rawInput: string): string[] => {
    const parts = rawInput
      .split(',')
      .map((t) => t.trim().replace(/^#+/, '').trim())
      .filter(Boolean);
    const merged = [...existing];
    for (const part of parts) {
      if (!merged.some((t) => t.toLowerCase() === part.toLowerCase())) {
        merged.push(part);
      }
    }
    return merged;
  };

  const addTagFromInput = () => {
    if (!tagsInput.trim()) return;
    setTagsList((prev) => parseAndMergeTags(prev, tagsInput));
    setTagsInput('');
  };

  const handleTagInputChange = (val: string) => {
    if (val.includes(',')) {
      const segments = val.split(',');
      const completed = segments.slice(0, -1).join(',');
      const remainder = segments[segments.length - 1];
      if (completed.trim()) {
        setTagsList((prev) => parseAndMergeTags(prev, completed));
      }
      setTagsInput(remainder);
    } else {
      setTagsInput(val);
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTagFromInput();
    } else if (e.key === 'Backspace' && !tagsInput && tagsList.length > 0) {
      setTagsList(tagsList.slice(0, -1));
    }
  };

  const toggleSuggestedTag = (tagName: string) => {
    const exists = tagsList.some((t) => t.toLowerCase() === tagName.toLowerCase());
    if (exists) {
      setTagsList(tagsList.filter((t) => t.toLowerCase() !== tagName.toLowerCase()));
    } else {
      setTagsList([...tagsList, tagName]);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTagsList(tagsList.filter((t) => t !== tagToRemove));
  };

  // Browser file selection handler
  const processSelectedFile = async (file: File) => {
    setSelectedBrowserFile(file);
    setError(null);

    const fileBaseName = file.name.replace(/\.[^/.]+$/, '');
    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';

    if (!title.trim()) {
      setTitle(fileBaseName);
    }

    if (fileExt) {
      setTagsList((prev) => parseAndMergeTags(prev, fileExt));
    }

    // For plain text / markdown / csv / json files, also preview content directly in the editor!
    if (['txt', 'md', 'csv', 'json'].includes(fileExt)) {
      try {
        const text = await file.text();
        setContent((prev) => (prev ? `${prev}\n\n${text}` : text));
        setFileStatus(`Loaded content from "${file.name}" into editor.`);
      } catch {
        setFileStatus(`Attached "${file.name}" ready to import.`);
      }
    } else {
      setFileStatus(
        `Selected "${file.name}" (${(file.size / 1024).toFixed(1)} KB). Click "Save Note" to extract & index.`
      );
    }
  };

  const handleBrowserFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const insertFormatting = (prefix: string, suffix: string = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.substring(start, end) || 'text';
    const updated =
      content.substring(0, start) + prefix + selected + suffix + content.substring(end);
    setContent(updated);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 10);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Combine any pending tag input (splitting commas if any)
    const finalTags = parseAndMergeTags(tagsList, tagsInput);

    setSaving(true);
    try {
      // If a browser file (like PDF or DOCX) was chosen and user hasn't typed custom text, or wants file uploaded
      if (selectedBrowserFile && (!content.trim() || ['pdf', 'docx', 'doc'].includes(selectedBrowserFile.name.split('.').pop()?.toLowerCase() || ''))) {
        const uploadedNote = await onUploadFile({
          file: selectedBrowserFile,
          collectionId: collectionId || undefined,
          tags: finalTags,
        });
        // If user also customized title or added extra text, update the note
        if (uploadedNote && (title.trim() && title.trim() !== uploadedNote.title)) {
          await onSave({
            id: uploadedNote.id,
            title: title.trim(),
            content: content.trim() ? `${content.trim()}\n\n${uploadedNote.content}` : uploadedNote.content,
            collectionId: collectionId || undefined,
            tags: finalTags,
          });
        }
        return;
      }

      if (!title.trim() && !content.trim()) {
        setError('Please enter a note title/content or upload a file from your browser.');
        setSaving(false);
        return;
      }

      await onSave({
        id: isEditing ? activeNote!.id : undefined,
        title: title.trim() || 'Untitled Note',
        content: content.trim() || '(Empty note)',
        collectionId: collectionId && collectionId.trim() !== '' ? collectionId.trim() : undefined,
        tags: finalTags,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 bg-[#F8FAFC] dark:bg-[#0F172A] flex flex-col h-screen overflow-y-auto transition-colors">
      <div className="max-w-4xl w-full mx-auto py-8 px-4 sm:px-10">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs p-6 sm:p-8 transition-colors">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
              {isEditing ? 'Edit Note' : 'Create New Note'}
            </h1>
            <ThemeToggle variant="button" />
          </div>

          {error && (
            <div className="mb-5 p-3.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/80 rounded-xl text-xs font-medium text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Title Input */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter note title..."
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 transition"
              />
            </div>

            {/* Collection Selector Row */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Collection</label>
                <button
                  type="button"
                  onClick={onOpenNewCollection}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New</span>
                </button>
              </div>
              <select
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 transition cursor-pointer"
              >
                <option value="">Select a collection</option>
                {collections.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags Feature for Easy Search & Memory */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <TagIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Note Tags (For easy searching &amp; memory recall)</span>
                </label>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  Press Enter, comma, or click + Add
                </span>
              </div>

              <div className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 focus-within:border-blue-600 dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/15 transition">
                <div className="flex flex-wrap items-center gap-1.5">
                  {tagsList.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-xs font-semibold border border-blue-200 dark:border-blue-800"
                    >
                      <span>#{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-red-500 dark:hover:text-red-400 ml-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}

                  <div className="flex-1 flex items-center min-w-[180px]">
                    <input
                      type="text"
                      value={tagsInput}
                      onChange={(e) => handleTagInputChange(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      placeholder={
                        tagsList.length === 0
                          ? 'Type tags e.g. Operating System, Exam, Memory, KeyConcept...'
                          : 'Add another tag...'
                      }
                      className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none px-1.5 py-1"
                    />
                    {tagsInput.trim() && (
                      <button
                        type="button"
                        onClick={addTagFromInput}
                        className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-lg transition shrink-0"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Memory & Existing Tags Quick-Select Pills */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[11px] text-slate-400 dark:text-slate-500 mr-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                  <span>Quick memory &amp; search tags:</span>
                </span>
                {Array.from(
                  new Set([
                    ...availableTags.map((t) => t.name),
                    'Important',
                    'Exam',
                    'Revision',
                    'Memory',
                    'Summary',
                    'KeyConcept',
                    'ToRead',
                  ])
                ).map((tagName) => {
                  const active = tagsList.some(
                    (t) => t.toLowerCase() === tagName.toLowerCase()
                  );
                  return (
                    <button
                      key={tagName}
                      type="button"
                      onClick={() => toggleSuggestedTag(tagName)}
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium border transition ${
                        active
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400'
                      }`}
                    >
                      #{tagName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Add Files from Browser Section */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Add File from Browser (Optional — Upload PDF, Word, TXT, MD)</span>
                </label>
              </div>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition flex flex-col sm:flex-row items-center justify-between gap-3 ${
                  selectedBrowserFile
                    ? 'border-blue-400 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-blue-50/20 dark:hover:bg-blue-950/20'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.odt,.odf,.txt,.md,.csv,.json,image/*,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tiff,.svg"
                  onChange={handleBrowserFileChange}
                  className="hidden"
                />

                {selectedBrowserFile ? (
                  <div className="flex items-center gap-3 w-full justify-between">
                    <div className="flex items-center gap-3 text-left min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                          {selectedBrowserFile.name}
                        </p>
                        <p className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>
                            {fileStatus ||
                              `${(selectedBrowserFile.size / 1024).toFixed(1)} KB attached`}
                          </span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBrowserFile(null);
                        setFileStatus(null);
                      }}
                      className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 text-left">
                      <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <Upload className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Click to browse files from your computer or drag &amp; drop here
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          Supports Scanned Images, PDF, Word (.docx), ODF (.odt), Text (.txt), Markdown (.md) — renders original file view &amp; indexes text automatically
                        </p>
                      </div>
                    </div>
                    <span className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-blue-600 dark:text-blue-400 shadow-2xs shrink-0">
                      Browse Files
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Content Rich Text Editor */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">Content</label>
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden focus-within:border-blue-600 dark:focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/15 transition bg-white dark:bg-slate-800">
                {/* Rich Formatting Toolbar */}
                <div className="flex items-center gap-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 flex-wrap">
                  <button
                    type="button"
                    onClick={() => insertFormatting('**', '**')}
                    className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg transition"
                    title="Bold"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting('*', '*')}
                    className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg transition"
                    title="Italic"
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting('__', '__')}
                    className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg transition"
                    title="Underline"
                  >
                    <Underline className="w-3.5 h-3.5" />
                  </button>
                  <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
                  <button
                    type="button"
                    onClick={() => insertFormatting('[', '](https://)')}
                    className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg transition"
                    title="Insert Link"
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting('`', '`')}
                    className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg transition"
                    title="Code"
                  >
                    <Code className="w-3.5 h-3.5" />
                  </button>
                  <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
                  <button
                    type="button"
                    onClick={() => insertFormatting('\n- ')}
                    className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg transition"
                    title="Bullet List"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting('\n1. ')}
                    className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg transition"
                    title="Numbered List"
                  >
                    <ListOrdered className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting('\n> ')}
                    className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg transition"
                    title="Quote"
                  >
                    <Quote className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertFormatting('\n### ')}
                    className="p-1.5 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg transition text-xs font-bold"
                    title="Heading"
                  >
                    H3
                  </button>
                </div>

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  rows={10}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Start writing your note here, or upload a file above..."
                  className="w-full p-4 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 bg-white dark:bg-slate-800 focus:outline-none resize-y leading-relaxed"
                />
              </div>
            </div>

            {/* Bottom Action Buttons */}
            <div className="flex items-center justify-between pt-3">
              <button
                type="button"
                onClick={onCancel}
                className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition disabled:opacity-50"
              >
                {saving ? `Saving Note… ${elapsed}s` : 'Save Note'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
