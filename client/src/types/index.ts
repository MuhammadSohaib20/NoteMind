export type ViewMode =
  | 'dashboard'
  | 'notes'
  | 'create-note'
  | 'note-detail'
  | 'ask-ai'
  | 'collections'
  | 'trash'
  | 'settings';

export const GENERAL_COLLECTION_FILTER = 'general';

export interface User {
  id: string;
  email: string;
  fullName?: string;
  bio?: string;
  avatarUrl?: string;
}

export interface Collection {
  id: string;
  userId?: string;
  user_id?: string;
  name: string;
  colorIndex?: number;
  color_index?: number;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  noteCount?: number;
  note_count?: number;
}

export interface Tag {
  id: string;
  userId?: string;
  user_id?: string;
  name: string;
  createdAt?: string;
  created_at?: string;
  noteCount?: number;
  note_count?: number;
}

export interface Note {
  id: string;
  userId?: string;
  user_id?: string;
  collectionId?: string | null;
  collection_id?: string | null;
  title: string;
  content: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  tags?: (string | Tag)[];
  collectionName?: string;
  collection_name?: string;
  fileName?: string;
  file_name?: string;
  fileType?: string;
  file_type?: string;
  fileData?: string;
  file_data?: string;
  filePreview?: string;
  file_preview?: string;
  /** True when the note's embeddings are current for the active AI model. */
  indexed?: boolean;
  /**
   * True while an imported file's text extraction (PDF parse / OCR) is still
   * running in the background. The list query polls until it flips to false.
   */
  extractionPending?: boolean;
  /** True while server-side automatic embedding is in progress. */
  indexingPending?: boolean;
}

/** Per-note result of POST /notes/index. */
export interface NoteIndexResult {
  noteId: string;
  title: string | null;
  status: 'indexed' | 'up_to_date' | 'failed' | 'not_found' | 'trashed';
  chunks?: number;
  error?: string;
}

export interface IndexNotesResult {
  results: NoteIndexResult[];
  summary: { requested: number; indexed: number; upToDate: number; failed: number };
}

export interface RagResultNote {
  id?: string;
  title: string;
  content: string;
  collectionName?: string;
  collection_name?: string;
  tags?: string[];
  similarity: number;
  snippet?: string;
}

/** A single cited passage backing the generated answer. */
export interface RagSource {
  index: number;
  noteId: string;
  title: string;
  collectionName?: string;
  similarity: number;
  chunkContent: string;
}

export interface RagResponse {
  question: string;
  answer: string;
  retrievedNotes: RagResultNote[];
  sources?: RagSource[];
  /** True when the answer fell back to extractive mode (no generation provider). */
  degraded?: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    details?: any;
  };
  pagination?: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}
