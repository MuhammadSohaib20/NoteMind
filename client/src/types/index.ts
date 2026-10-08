export type ViewMode =
  | 'dashboard'
  | 'notes'
  | 'create-note'
  | 'note-detail'
  | 'ask-ai'
  | 'collections'
  | 'trash'
  | 'settings';

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
}

export interface RagResultNote {
  id?: string;
  title: string;
  content: string;
  collectionName?: string;
  collection_name?: string;
  tags?: string[];
  similarity: number;
}

export interface RagResponse {
  question: string;
  answer: string;
  retrievedNotes: RagResultNote[];
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
