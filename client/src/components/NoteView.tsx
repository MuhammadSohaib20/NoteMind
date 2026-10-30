import React, { useState, useEffect } from 'react';
import { Note, Tag } from '../types';
import { apiFetchBlob } from '../api/client';
import {
  ArrowLeft,
  Loader2,
  Edit3,
  Trash2,
  Share2,
  Folder,
  Check,
  Tag as TagIcon,
  BookOpen,
  Type,
  Sun,
  Maximize2,
  Minimize2,
  Search,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Save,
  Image as ImageIcon,
  FileText,
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCw,
  File as FileIcon,
  Sparkles,
  Maximize,
} from 'lucide-react';

interface NoteViewProps {
  note: Note;
  allNotes?: Note[];
  availableTags?: Tag[];
  onBack: () => void;
  onSelectNote?: (note: Note) => void;
  onEdit: (note: Note) => void;
  onDelete: (id: string) => void;
  onClickTag: (tagName: string) => void;
  onUpdateNoteTags?: (noteId: string, tags: string[]) => Promise<void>;
  onUpdateNote?: (payload: {
    id: string;
    title?: string;
    content?: string;
    tags?: string[];
  }) => Promise<void>;
}

type FontSizeOption = 'sm' | 'base' | 'lg' | 'xl';
type ReaderTheme = 'light' | 'sepia' | 'dark';

const MEMORY_QUICK_TAGS = [
  'Important',
  'Exam',
  'Revision',
  'Memory',
  'Summary',
  'KeyConcept',
  'ToRead',
];

function formatUpdatedTime(dateStr?: string): string {
  if (!dateStr) return 'Updated recently';
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Updated just now';
  if (diffMins < 60) return `Updated ${diffMins} min ago`;
  const diffHours = Math.floor(diffMs / 60);
  if (diffHours < 24) return `Updated ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `Updated ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

export const NoteView: React.FC<NoteViewProps> = ({
  note,
  allNotes = [],
  availableTags = [],
  onBack,
  onSelectNote,
  onEdit,
  onDelete,
  onClickTag,
  onUpdateNoteTags,
  onUpdateNote,
}) => {
  const [sharedCopied, setSharedCopied] = useState(false);

  // Manual Reading Mode states
  const [fontSize, setFontSize] = useState<FontSizeOption>('base');
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>('light');
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [inNoteSearch, setInNoteSearch] = useState('');
  const [showInNoteSearch, setShowInNoteSearch] = useState(false);

  // Inline Tag Management states
  const [newTagInput, setNewTagInput] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [isUpdatingTags, setIsUpdatingTags] = useState(false);

  // Inline Editor State
  const [isEditingInline, setIsEditingInline] = useState(false);
  const [editTitle, setEditTitle] = useState(note.title);
  const [editContent, setEditContent] = useState(note.content);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  // File Attachment & Original View states
  const fileName = note.fileName || note.file_name || '';
  const fileType = note.fileType || note.file_type || '';
  const filePreview = note.filePreview || note.file_preview || '';
  const [fileUrl, setFileUrl] = useState('');
  const [fileLoadError, setFileLoadError] = useState('');
  const [isFileLoading, setIsFileLoading] = useState(false);

  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const mime = fileType.toLowerCase();

  const isImageFile =
    mime.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'svg', 'tiff'].includes(ext);

  const isPdfFile =
    mime === 'application/pdf' || ext === 'pdf';

  const isWordOrOdfFile =
    ['docx', 'doc', 'odt', 'odf'].includes(ext) ||
    mime.includes('word') ||
    mime.includes('officedocument') ||
    mime.includes('opendocument');

  const hasAttachedFile = Boolean(fileName);

  useEffect(() => {
    if (!hasAttachedFile) {
      setFileUrl('');
      setFileLoadError('');
      setIsFileLoading(false);
      return;
    }

    let isCurrent = true;
    let objectUrl = '';
    setFileUrl('');
    setFileLoadError('');
    setIsFileLoading(true);

    apiFetchBlob(`/notes/${note.id}/file`)
      .then((fileBlob) => {
        if (!isCurrent) return;
        objectUrl = URL.createObjectURL(fileBlob);
        setFileUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setFileLoadError(error instanceof Error ? error.message : 'Unable to load original file');
        }
      })
      .finally(() => {
        if (isCurrent) setIsFileLoading(false);
      });

    return () => {
      isCurrent = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [hasAttachedFile, note.id]);

  const [activeViewMode, setActiveViewMode] = useState<'original' | 'text'>(() => {
    return hasAttachedFile ? 'original' : 'text';
  });

  const [imageZoom, setImageZoom] = useState(100);
  const [imageRotation, setImageRotation] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    setEditTitle(note.title);
    setEditContent(note.content);
    setImageZoom(100);
    setImageRotation(0);

    if (hasAttachedFile) {
      setActiveViewMode('original');
    } else {
      setActiveViewMode('text');
    }
  }, [note]);

  const collectionName = note.collectionName || note.collection_name || 'General';
  const updatedText = formatUpdatedTime(
    note.updatedAt || note.updated_at || note.createdAt || note.created_at
  );
  const parsedTags: string[] = (note.tags || [])
    .map((t) => (typeof t === 'string' ? t : t.name))
    .filter(Boolean);

  const words = (note.content || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const readingTimeMins = Math.max(1, Math.ceil(words / 200));

  const currentNoteIndex = allNotes.findIndex((n) => n.id === note.id);
  const prevNote = currentNoteIndex > 0 ? allNotes[currentNoteIndex - 1] : null;
  const nextNote =
    currentNoteIndex >= 0 && currentNoteIndex < allNotes.length - 1
      ? allNotes[currentNoteIndex + 1]
      : null;

  const handleShare = () => {
    const tagLine = parsedTags.length > 0 ? `\nTags: ${parsedTags.map((t) => `#${t}`).join(' ')}` : '';
    const shareText = `${note.title}${tagLine}\n\n${note.content}`;
    navigator.clipboard.writeText(shareText);
    setSharedCopied(true);
    setTimeout(() => setSharedCopied(false), 2000);
  };

  const handleAddInlineTag = async (tagToAdd?: string) => {
    if (!onUpdateNoteTags) return;
    const raw = tagToAdd !== undefined ? tagToAdd : newTagInput;
    const newTags = raw
      .split(',')
      .map((t) => t.trim().replace(/^#+/, '').trim())
      .filter(Boolean);

    if (newTags.length === 0) return;

    const merged = [...parsedTags];
    for (const t of newTags) {
      if (!merged.some((existing) => existing.toLowerCase() === t.toLowerCase())) {
        merged.push(t);
      }
    }

    setIsUpdatingTags(true);
    try {
      await onUpdateNoteTags(note.id, merged);
      setNewTagInput('');
    } finally {
      setIsUpdatingTags(false);
    }
  };

  const handleRemoveInlineTag = async (tagToRemove: string) => {
    if (!onUpdateNoteTags) return;
    const updated = parsedTags.filter((t) => t.toLowerCase() !== tagToRemove.toLowerCase());
    setIsUpdatingTags(true);
    try {
      await onUpdateNoteTags(note.id, updated);
    } finally {
      setIsUpdatingTags(false);
    }
  };

  const handleSaveInlineNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateNote) {
      onEdit({ ...note, title: editTitle, content: editContent });
      setIsEditingInline(false);
      return;
    }

    setIsSavingNote(true);
    try {
      await onUpdateNote({
        id: note.id,
        title: editTitle.trim() || 'Untitled Note',
        content: editContent.trim() || '(Empty note)',
      });
      setSaveSuccessMsg(true);
      setTimeout(() => setSaveSuccessMsg(false), 2500);
      setIsEditingInline(false);
    } finally {
      setIsSavingNote(false);
    }
  };

  const fontSizeClass = {
    sm: 'text-xs sm:text-sm leading-relaxed',
    base: 'text-sm sm:text-base leading-relaxed',
    lg: 'text-base sm:text-lg leading-loose',
    xl: 'text-lg sm:text-xl leading-loose',
  }[fontSize];

  const themeContainerClasses = {
    light: 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 text-slate-800 dark:text-slate-100',
    sepia: 'bg-[#FBF7EE] dark:bg-[#1C1813] border-[#E6DEC8] dark:border-[#332B20] text-[#3D3326] dark:text-[#E8DCC8]',
    dark: 'bg-[#0F172A] border-slate-800 text-slate-100',
  }[readerTheme];

  const themeSubtextClasses = {
    light: 'text-slate-700 dark:text-slate-300',
    sepia: 'text-[#4A3F31] dark:text-[#C4B7A5]',
    dark: 'text-slate-300',
  }[readerTheme];

  const highlightText = (text: string) => {
    const query = inNoteSearch.trim();
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-amber-300 text-slate-900 px-1 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const renderFormattedContent = (raw: string) => {
    const lines = raw.split('\n');
    return lines.map((line, index) => {
      if (!line.trim()) return <div key={index} className="h-4" />;
      if (line.startsWith('# ')) {
        return (
          <h1 key={index} className="text-xl sm:text-2xl font-bold mt-6 mb-3">
            {highlightText(line.replace('# ', ''))}
          </h1>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <h2 key={index} className="text-lg sm:text-xl font-bold mt-5 mb-2">
            {highlightText(line.replace('## ', ''))}
          </h2>
        );
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <li key={index} className={`${fontSizeClass} ${themeSubtextClasses} ml-5 list-disc my-1`}>
            {highlightText(line.substring(2))}
          </li>
        );
      }
      if (line.startsWith('> ')) {
        return (
          <blockquote
            key={index}
            className="border-l-4 border-blue-500 pl-4 py-1 italic opacity-90 my-3 bg-blue-50/30 dark:bg-blue-950/20 rounded-r-lg"
          >
            {highlightText(line.substring(2))}
          </blockquote>
        );
      }
      return (
        <p key={index} className={`${fontSizeClass} ${themeSubtextClasses} my-2`}>
          {highlightText(line)}
        </p>
      );
    });
  };

  const suggestedTags = Array.from(
    new Set([...availableTags.map((t) => t.name), ...MEMORY_QUICK_TAGS])
  ).filter((t) => !parsedTags.some((pt) => pt.toLowerCase() === t.toLowerCase()));

  return (
    <div className="flex-1 bg-[#F8FAFC] dark:bg-[#0F172A] flex flex-col h-screen overflow-y-auto transition-colors">
      <div
        className={`${
          isFocusMode ? 'max-w-6xl' : 'max-w-4xl'
        } w-full mx-auto py-6 sm:py-8 px-4 sm:px-8 transition-all duration-200`}
      >
        <div
          className={`rounded-2xl border shadow-xs p-6 sm:p-10 transition-colors duration-200 ${themeContainerClasses}`}
        >
          {/* Background extraction still running for this import */}
          {note.extractionPending && (
            <div className="mb-5 inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs font-semibold text-amber-700 dark:text-amber-300">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>
                Extracting text in the background — large scanned PDFs can take
                a minute. This view refreshes automatically.
              </span>
            </div>
          )}

          {/* Top Navigation & Action Bar */}
          <div
            className={`flex flex-wrap items-center justify-between gap-3 pb-5 border-b ${
              readerTheme === 'dark' ? 'border-slate-800' : 'border-slate-200/70'
            }`}
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onBack}
                className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl border transition ${
                  readerTheme === 'dark'
                    ? 'border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Notes</span>
              </button>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 text-xs font-bold">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Reader &amp; Document View</span>
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Find in note button */}

              {/* Edit Note Toggle */}
              <button
                type="button"
                onClick={() => setIsEditingInline(!isEditingInline)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
                  isEditingInline
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : readerTheme === 'dark'
                      ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5 text-blue-500" />
                <span>{isEditingInline ? 'Cancel Editing' : 'Edit Note'}</span>
              </button>

              {/* Delete Note */}
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete note "${note.title}"?`)) {
                    onDelete(note.id);
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
                  readerTheme === 'dark'
                    ? 'border-slate-700 text-slate-300 hover:bg-red-950 hover:text-red-400'
                    : 'border-slate-200 text-slate-700 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                <span>Delete</span>
              </button>

              {/* Share/Copy Note */}
              <button
                type="button"
                onClick={handleShare}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
                  readerTheme === 'dark'
                    ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {sharedCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-500">Copied!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Copy Note</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Reading Comfort Toolbar (Font Size, Theme, Focus Mode) */}
          {!isEditingInline && (
            <div
              className={`mt-4 px-4 py-2.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs ${
                readerTheme === 'dark'
                  ? 'bg-slate-800/70 text-slate-300'
                  : readerTheme === 'sepia'
                    ? 'bg-[#F3ECE0] text-[#5C4E3C]'
                    : 'bg-slate-50 text-slate-600'
              }`}
            >
              <div className="flex flex-wrap items-center gap-4">
                {/* Font Size Selector */}
                <div className="flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-blue-500" />
                  <span className="font-semibold">Text Size:</span>
                  {(['sm', 'base', 'lg', 'xl'] as FontSizeOption[]).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setFontSize(sz)}
                      className={`px-2 py-0.5 rounded-md font-bold uppercase text-[11px] transition ${
                        fontSize === sz
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-blue-500/10'
                      }`}
                    >
                      {sz === 'sm' ? 'S' : sz === 'base' ? 'M' : sz === 'lg' ? 'L' : 'XL'}
                    </button>
                  ))}
                </div>

                {/* Reading Theme Selector */}
                <div className="flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span className="font-semibold">Paper:</span>
                  <button
                    type="button"
                    onClick={() => setReaderTheme('light')}
                    className={`px-2.5 py-0.5 rounded-md font-semibold text-[11px] transition ${
                      readerTheme === 'light'
                        ? 'bg-blue-600 text-white'
                        : 'hover:bg-blue-500/10'
                    }`}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    onClick={() => setReaderTheme('sepia')}
                    className={`px-2.5 py-0.5 rounded-md font-semibold text-[11px] transition ${
                      readerTheme === 'sepia'
                        ? 'bg-[#8B5E3C] text-white'
                        : 'hover:bg-amber-500/10'
                    }`}
                  >
                    Warm Sepia
                  </button>
                  <button
                    type="button"
                    onClick={() => setReaderTheme('dark')}
                    className={`px-2.5 py-0.5 rounded-md font-semibold text-[11px] transition ${
                      readerTheme === 'dark'
                        ? 'bg-slate-900 text-white'
                        : 'hover:bg-slate-500/10'
                    }`}
                  >
                    Night
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="opacity-70 font-medium">
                  ⏱ {readingTimeMins} min read • {words} words
                </span>
                <button
                  type="button"
                  onClick={() => setIsFocusMode(!isFocusMode)}
                  className="px-2.5 py-1 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-semibold text-[11px] inline-flex items-center gap-1 transition"
                >
                  {isFocusMode ? (
                    <>
                      <Minimize2 className="w-3 h-3" />
                      <span>Normal View</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3 h-3" />
                      <span>Wide Reader</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}



          {/* Note Title, Collection & Memory Tags Header */}
          <div
            className={`py-6 border-b ${
              readerTheme === 'dark' ? 'border-slate-800' : 'border-slate-200/70'
            }`}
          >
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {highlightText(note.title || 'Untitled Note')}
            </h1>

            <div className="flex flex-wrap items-center gap-2.5 mt-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold border border-blue-500/20">
                <Folder className="w-3.5 h-3.5" />
                <span>{collectionName}</span>
              </span>

              <span className="text-xs opacity-60 font-medium">{updatedText}</span>

              {/* File Attachment Badge */}
              {hasAttachedFile && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                  {isImageFile ? (
                    <ImageIcon className="w-3.5 h-3.5" />
                  ) : isPdfFile ? (
                    <FileText className="w-3.5 h-3.5 text-red-500" />
                  ) : isWordOrOdfFile ? (
                    <FileText className="w-3.5 h-3.5 text-blue-500" />
                  ) : (
                    <FileIcon className="w-3.5 h-3.5" />
                  )}
                  <span>{fileName || 'Original Attached File'}</span>
                </span>
              )}

              {/* Top Tag Pills */}
              {parsedTags.map((tag, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onClickTag(tag)}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-500/10 hover:bg-blue-600 text-blue-600 hover:text-white text-xs font-semibold border border-blue-500/20 transition"
                  title={`Click to find all notes tagged #${tag}`}
                >
                  <TagIcon className="w-3 h-3" />
                  <span>#{tag}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Original File View Switcher */}
          {hasAttachedFile && !isEditingInline && (
            <div className="mt-6 p-1.5 bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl flex flex-wrap items-center justify-between gap-2 shadow-inner">
              <div className="flex items-center gap-1.5 flex-1 min-w-[280px]">
                <button
                  type="button"
                  onClick={() => setActiveViewMode('original')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition ${
                    activeViewMode === 'original'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-md border border-slate-200/60 dark:border-slate-800'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {isImageFile ? (
                    <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  ) : isPdfFile ? (
                    <FileText className="w-4 h-4 text-red-500" />
                  ) : isWordOrOdfFile ? (
                    <FileText className="w-4 h-4 text-blue-500" />
                  ) : (
                    <FileIcon className="w-4 h-4 text-emerald-500" />
                  )}
                  <span>
                    Original File View{' '}
                    {isImageFile
                      ? '(Scanned Image)'
                      : isPdfFile
                        ? '(PDF Document)'
                        : isWordOrOdfFile
                          ? '(Word/ODF Document)'
                          : ''}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveViewMode('text')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition ${
                    activeViewMode === 'text'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-md border border-slate-200/60 dark:border-slate-800'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Extracted Text Content</span>
                </button>
              </div>

              {fileUrl && (
                <a
                  href={fileUrl}
                  download={fileName || 'original-file'}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm shrink-0"
                  title="Download original file to your device"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download File</span>
                </a>
              )}
            </div>
          )}

          {/* MAIN CONTENT AREA */}
          {!isEditingInline ? (
            activeViewMode === 'original' && hasAttachedFile ? (
              /* ORIGINAL FILE VIEW (Scanned Image / PDF / Word / ODF / File) */
              <div className="py-6 space-y-6">
                {/* 1. SCANNED IMAGE VIEW */}
                {isImageFile && (
                  <div className="space-y-4">
                    {/* Controls Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-blue-600" />
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          Scanned Image Viewer
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 font-semibold uppercase">
                          {ext || 'Image'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Zoom Controls */}
                        <button
                          type="button"
                          onClick={() => setImageZoom((prev) => Math.max(50, prev - 25))}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                          title="Zoom Out"
                        >
                          <ZoomOut className="w-4 h-4" />
                        </button>

                        <span className="font-semibold text-[11px] w-12 text-center">{imageZoom}%</span>

                        <button
                          type="button"
                          onClick={() => setImageZoom((prev) => Math.min(300, prev + 25))}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                          title="Zoom In"
                        >
                          <ZoomIn className="w-4 h-4" />
                        </button>

                        {/* Rotation */}
                        <button
                          type="button"
                          onClick={() => setImageRotation((prev) => (prev + 90) % 360)}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1 transition"
                          title="Rotate image 90 degrees"
                        >
                          <RotateCw className="w-4 h-4" />
                          <span className="text-[10px] hidden sm:inline">{imageRotation}°</span>
                        </button>

                        {/* Fullscreen Modal */}
                        <button
                          type="button"
                          onClick={() => setIsLightboxOpen(true)}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1 transition"
                          title="Open Fullscreen Image View"
                        >
                          <Maximize className="w-4 h-4" />
                          <span className="text-[11px] hidden sm:inline font-medium">Fullscreen</span>
                        </button>

                        {/* Download */}
                        {fileUrl && (
                          <a
                            href={fileUrl}
                            download={fileName || 'scanned-image.png'}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-1 transition shadow-2xs"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Save Image</span>
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Image Preview Window */}
                    <div className="relative border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-slate-900/5 dark:bg-black/40 flex items-center justify-center overflow-auto min-h-[380px] max-h-[700px]">
                      {fileUrl ? (
                        <img
                          src={fileUrl}
                          alt={fileName || 'Scanned note image'}
                          className="max-w-full h-auto rounded-xl transition-transform duration-200 shadow-xl object-contain cursor-zoom-in"
                          style={{
                            transform: `scale(${imageZoom / 100}) rotate(${imageRotation}deg)`,
                          }}
                          onClick={() => setIsLightboxOpen(true)}
                        />
                      ) : (
                        <div className="text-center py-12 space-y-2">
                          <ImageIcon className="w-12 h-12 text-slate-400 mx-auto" />
                          <p className="text-xs text-slate-500 font-semibold">
                            {fileLoadError || (isFileLoading ? 'Loading original image...' : `Scanned image "${fileName}" is attached.`)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* OCR Text Summary Section */}
                    {note.content &&
                      !note.content.startsWith('[Uploaded') &&
                      !note.content.startsWith('(No extractable') && (
                        <div className="p-5 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/40 rounded-2xl space-y-2">
                          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-bold text-xs">
                            <Sparkles className="w-4 h-4 text-blue-600" />
                            <span>Extracted OCR Text from Scanned Image</span>
                          </div>
                          <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">
                            {note.content}
                          </div>
                        </div>
                      )}
                  </div>
                )}

                {/* 2. PDF DOCUMENT VIEW */}
                {isPdfFile && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-xs">
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-5 h-5 text-red-500 shrink-0" />
                        <div>
                          <p className="font-bold text-slate-800 dark:text-slate-100 truncate max-w-sm">
                            {fileName || note.title || 'PDF Document'}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">PDF Reader View</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">

                        {fileUrl && (
                          <a
                            href={fileUrl}
                            download={fileName || 'document.pdf'}
                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-1.5 transition shadow-xs"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download PDF</span>
                          </a>
                        )}
                      </div>
                    </div>

                    {fileUrl ? (
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-lg bg-slate-900">
                        <iframe
                          src={fileUrl}
                          title={fileName || 'PDF Viewer'}
                          className="w-full h-[680px] border-none"
                        />
                      </div>
                    ) : (
                      <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <FileText className="w-10 h-10 text-red-500 mx-auto mb-2" />
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {fileLoadError || (isFileLoading ? 'Loading PDF...' : `PDF file "${fileName}" is attached.`)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. WORD / ODF DOCUMENT VIEW */}
                {isWordOrOdfFile && (
                  <div className="space-y-4">
                    <div className="p-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800/90 border border-blue-200 dark:border-slate-700 rounded-2xl flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-md uppercase">
                          {ext || 'DOC'}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {fileName || note.title}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Original Word / OpenDocument File attached
                          </p>
                        </div>
                      </div>

                      {fileUrl && (
                        <a
                          href={fileUrl}
                          download={fileName || `document.${ext}`}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download Original File</span>
                        </a>
                      )}
                    </div>

                    <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-blue-500" />
                        <span>{filePreview ? 'Word Document Preview' : 'Extracted Document Text'}</span>
                      </h3>
                      {filePreview ? (
                        <iframe
                          title={`${fileName || note.title} preview`}
                          sandbox=""
                          className="w-full h-[680px] rounded-xl border border-slate-200 bg-white"
                          srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'"><style>body{font:15px/1.65 Arial,sans-serif;color:#1e293b;max-width:850px;margin:40px auto;padding:0 36px}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #cbd5e1;padding:6px 10px}blockquote{border-left:3px solid #cbd5e1;margin-left:0;padding-left:16px}pre{white-space:pre-wrap}</style></head><body>${filePreview}</body></html>`}
                        />
                      ) : (
                        <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                          {note.content}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. GENERIC FILE ATTACHMENT VIEW */}
                {!isImageFile && !isPdfFile && !isWordOrOdfFile && (
                  <div className="p-6 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileIcon className="w-8 h-8 text-blue-600" />
                        <div>
                          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                            {fileName || 'Attached File'}
                          </h4>
                          <p className="text-xs text-slate-500 uppercase">{ext || fileType}</p>
                        </div>
                      </div>

                      {fileUrl && (
                        <a
                          href={fileUrl}
                          download={fileName || 'download'}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download Original File</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* EXTRACTED TEXT CONTENT VIEW */
              <article className="py-7 min-h-[280px] select-text">
                {note.content ? (
                  renderFormattedContent(note.content)
                ) : (
                  <p className="text-sm opacity-50 italic">No text content in this note.</p>
                )}
              </article>
            )
          ) : (
            /* MODE 2: INLINE NOTE EDITOR */
            <form onSubmit={handleSaveInlineNote} className="py-6 space-y-5">
              {saveSuccessMsg && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Note saved and updated successfully!</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Note Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Enter note title..."
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Note Text Content
                </label>
                <textarea
                  rows={14}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Write or update your study notes, summary, or thoughts..."
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-600 transition resize-y font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingInline(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingNote}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-blue-600/25 flex items-center gap-2 transition"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingNote ? 'Saving Changes...' : 'Save & Update Note'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Lightbox Fullscreen Image Modal */}
          {isLightboxOpen && fileUrl && (
            <div
              className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
              onClick={() => setIsLightboxOpen(false)}
            >
              <div className="relative max-w-5xl w-full max-h-[90vh] flex flex-col items-center justify-center">
                <button
                  type="button"
                  onClick={() => setIsLightboxOpen(false)}
                  className="absolute top-2 right-2 p-2 bg-black/60 text-white rounded-full hover:bg-black/80 transition"
                >
                  <X className="w-6 h-6" />
                </button>
                <img
                  src={fileUrl}
                  alt={fileName || 'Original Image Fullscreen'}
                  className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl transition-transform"
                  style={{
                    transform: `scale(${imageZoom / 100}) rotate(${imageRotation}deg)`,
                  }}
                />
                <div className="mt-4 px-4 py-2 bg-black/70 rounded-xl text-white text-xs font-semibold flex items-center gap-3">
                  <span>{fileName}</span>
                  <span>•</span>
                  <a
                    href={fileUrl}
                    download={fileName || 'image.png'}
                    className="text-blue-400 hover:underline flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download className="w-3.5 h-3.5" /> Download Image
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Note Tags Section */}
          <div
            className={`pt-6 border-t space-y-3 ${
              readerTheme === 'dark' ? 'border-slate-800' : 'border-slate-200/70'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TagIcon className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold">
                  Note Memory &amp; Search Tags ({parsedTags.length})
                </span>
                <span className="text-[11px] opacity-60">
                  — Click any tag to search related notes, or add tags for memory recall
                </span>
              </div>

              {onUpdateNoteTags && !isAddingTag && (
                <button
                  type="button"
                  onClick={() => setIsAddingTag(true)}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Tag to Note</span>
                </button>
              )}
            </div>

            {/* Current Tags */}
            <div className="flex flex-wrap items-center gap-2">
              {parsedTags.map((t, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold border border-blue-500/20"
                >
                  <span>#{t}</span>
                  {onUpdateNoteTags && (
                    <button
                      type="button"
                      onClick={() => handleRemoveInlineTag(t)}
                      className="ml-1 text-slate-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}

              {isAddingTag && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    autoFocus
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddInlineTag();
                      } else if (e.key === 'Escape') {
                        setIsAddingTag(false);
                      }
                    }}
                    placeholder="tag name..."
                    className="bg-white dark:bg-slate-800 border border-blue-500 rounded-full px-3 py-1 text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={isUpdatingTags}
                    onClick={() => handleAddInlineTag()}
                    className="px-2.5 py-1 rounded-full bg-blue-600 text-white text-xs font-semibold"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingTag(false)}
                    className="p-1 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Quick Memory Tags */}
            {onUpdateNoteTags && suggestedTags.length > 0 && (
              <div className="pt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] opacity-60">Quick Memory Tags:</span>
                {suggestedTags.slice(0, 6).map((stag) => (
                  <button
                    key={stag}
                    type="button"
                    onClick={() => handleAddInlineTag(stag)}
                    className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-slate-600 dark:text-slate-300 hover:text-blue-600 text-[11px] font-medium transition"
                  >
                    + #{stag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sequential Reader Navigation (Previous Note / Next Note) */}
          <div
            className={`mt-8 pt-6 border-t flex items-center justify-between gap-4 text-xs ${
              readerTheme === 'dark' ? 'border-slate-800' : 'border-slate-200/70'
            }`}
          >
            {prevNote ? (
              <button
                type="button"
                onClick={() => onSelectNote && onSelectNote(prevNote)}
                className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition max-w-[45%]"
              >
                <ChevronLeft className="w-4 h-4 shrink-0 text-blue-500" />
                <div className="truncate">
                  <span className="text-[10px] opacity-60 block uppercase font-bold">
                    Previous Note
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
                    {prevNote.title}
                  </span>
                </div>
              </button>
            ) : (
              <div />
            )}

            {nextNote ? (
              <button
                type="button"
                onClick={() => onSelectNote && onSelectNote(nextNote)}
                className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-right transition max-w-[45%] ml-auto"
              >
                <div className="truncate">
                  <span className="text-[10px] opacity-60 block uppercase font-bold">
                    Next Note
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
                    {nextNote.title}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 text-blue-500" />
              </button>
            ) : (
              <div />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
