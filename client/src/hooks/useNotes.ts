import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUpload } from '../api/client';
import { GENERAL_COLLECTION_FILTER, Note, IndexNotesResult } from '../types';
import { useAuth } from '../context/AuthContext';

export function useNotes(collectionId?: string, tag?: string, search?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const queryParams = new URLSearchParams();
  if (collectionId === GENERAL_COLLECTION_FILTER) {
    queryParams.append('generalOnly', 'true');
  } else if (collectionId) {
    queryParams.append('collectionId', collectionId);
  }
  if (tag) queryParams.append('tag', tag);
  if (search) queryParams.append('search', search);

  const notesQuery = useQuery({
    queryKey: ['notes', user?.id, collectionId, tag, search],
    queryFn: async () => {
      const res = await apiFetch<Note[]>(`/notes?${queryParams.toString()}`);
      return res.data || [];
    },
    enabled: !!user?.id,
    // Keep imported note content and its auto-index status fresh while
    // extraction or background embedding is running.
    refetchInterval: (query) => {
      const data = query.state.data as Note[] | undefined;
      return data?.some((note) => note.extractionPending || note.indexingPending) ? 1500 : false;
    },
  });

  const trashQuery = useQuery({
    queryKey: ['trash', user?.id],
    queryFn: async () => {
      const res = await apiFetch<Note[]>('/notes/trash');
      return res.data || [];
    },
    enabled: !!user?.id,
  });

  const createNoteMutation = useMutation({
    mutationFn: async (payload: { title: string; content: string; collectionId?: string; tags?: string[]; fileName?: string; fileType?: string; fileData?: string }) => {
      const res = await apiFetch<Note>('/notes', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const uploadNoteMutation = useMutation({
    mutationFn: async ({ file, collectionId, tags }: { file: File; collectionId?: string; tags?: string[] }) => {
      const formData = new FormData();
      formData.append('file', file);
      if (collectionId) formData.append('collectionId', collectionId);
      if (tags && tags.length > 0) formData.append('tags', JSON.stringify(tags));

      const res = await apiUpload<Note>('/notes/upload', formData);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; title?: string; content?: string; collectionId?: string; tags?: string[]; fileName?: string; fileType?: string; fileData?: string }) => {
      const res = await apiFetch<Note>(`/notes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/notes/${id}`, {
        method: 'DELETE',
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['trash', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const restoreNoteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/notes/${id}/restore`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['trash', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const permanentlyDeleteNoteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/notes/${id}/permanent`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const indexNotesMutation = useMutation({
    mutationFn: async ({ noteIds, force = false }: { noteIds: string[]; force?: boolean }) => {
      const res = await apiFetch<IndexNotesResult>('/notes/index', {
        method: 'POST',
        body: JSON.stringify({ noteIds, force }),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['trash', user?.id] });
    },
  });

  return {
    notes: notesQuery.data || [],
    trashedNotes: trashQuery.data || [],
    isTrashLoading: trashQuery.isLoading,
    isTrashError: trashQuery.isError,
    refetchTrash: trashQuery.refetch,
    isLoading: notesQuery.isLoading,
    isError: notesQuery.isError,
    refetch: notesQuery.refetch,
    createNote: createNoteMutation.mutateAsync,
    uploadNote: uploadNoteMutation.mutateAsync,
    updateNote: updateNoteMutation.mutateAsync,
    deleteNote: deleteNoteMutation.mutateAsync,
    restoreNote: restoreNoteMutation.mutateAsync,
    permanentlyDeleteNote: permanentlyDeleteNoteMutation.mutateAsync,
    indexNotes: indexNotesMutation.mutateAsync,
    isIndexing: indexNotesMutation.isPending,
  };
}
