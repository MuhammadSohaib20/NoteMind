import React, { useEffect, useState, useRef } from 'react';
import { Upload, FileText, X, AlertCircle, CheckCircle2, Tag as TagIcon } from 'lucide-react';
import { Collection } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: Collection[];
  onUpload: (payload: { file: File; collectionId?: string; tags?: string[] }) => Promise<any>;
  onSuccessSelect?: (note: any) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  collections,
  onUpload,
  onSuccessSelect,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [collectionId, setCollectionId] = useState<string>('');
  const [tagsInput, setTagsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Large scans are OCR'd page by page on the server; tick a timer while the
  // import runs so it never looks stuck. Hook must sit above the early return.
  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    );
    return () => clearInterval(timer);
  }, [loading]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a file from your browser to upload');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const tagsList = tagsInput
        .split(',')
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean);

      const createdNote = await onUpload({
        file: selectedFile,
        collectionId: collectionId || undefined,
        tags: tagsList,
      });

      setSuccessMsg(`File "${selectedFile.name}" imported & indexed as a note!`);
      setTimeout(() => {
        if (onSuccessSelect && createdNote) {
          onSuccessSelect(createdNote);
        }
        onClose();
        setSelectedFile(null);
        setTagsInput('');
        setCollectionId('');
        setSuccessMsg(null);
      }, 900);
    } catch (err: any) {
      setError(err.message || 'Failed to upload and import note file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-slate-900 dark:text-white font-bold text-base">
            <Upload className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Add File from Browser as Note</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/80 rounded-xl flex items-center gap-2.5 text-red-600 dark:text-red-400 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/80 rounded-xl flex items-center gap-2.5 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* File Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 rounded-xl p-6 text-center cursor-pointer bg-slate-50/70 dark:bg-slate-800/40 hover:bg-blue-50/30 dark:hover:bg-blue-950/30 transition group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.odt,.odf,.txt,.md,.json,.csv,image/*,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tiff,.svg"
              onChange={handleFileChange}
              className="hidden"
            />

            {selectedFile ? (
              <div className="flex items-center justify-center gap-3 text-blue-600 dark:text-blue-400 font-medium">
                <FileText className="w-8 h-8 shrink-0 text-blue-600 dark:text-blue-400" />
                <div className="text-left truncate">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{selectedFile.name}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {(selectedFile.size / 1024).toFixed(1)} KB — Click or drag to replace
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="w-9 h-9 text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 mx-auto transition" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Drop Scanned Images (PNG, JPG, WEBP), PDF (.pdf), Word (.docx), ODF (.odt), TXT, or Markdown here
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">or click to browse your computer</p>
              </div>
            )}
          </div>

          {/* Collection Target Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Collection (Optional)
            </label>
            <select
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 cursor-pointer transition"
            >
              <option value="">Select a collection</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Optional Tags */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
              <TagIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Tags for Easy Search (comma-separated)</span>
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. Operating System, CS, Lecture"
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-600 dark:focus:border-blue-400 transition"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedFile}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-md shadow-blue-600/20 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <span>Importing… {elapsed}s</span>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import as Note</span>
                </>
              )}
            </button>
          </div>

          {loading && elapsed >= 15 && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-1">
              Reading &amp; indexing the file — large scanned PDFs are OCR'd
              page by page and can take a couple of minutes. Keep this window open.
            </p>
          )}
        </form>
      </div>
    </div>
  );
};
