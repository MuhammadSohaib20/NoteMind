import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { Collection } from '../types';
import { useAuth } from '../context/AuthContext';

export function useCollections() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const collectionsQuery = useQuery({
    queryKey: ['collections', user?.id],
    queryFn: async () => {
      const res = await apiFetch<Collection[]>('/collections');
      return res.data || [];
    },
    enabled: !!user?.id,
  });

  const createCollectionMutation = useMutation({
    mutationFn: async (payload: { name: string }) => {
      const res = await apiFetch<Collection>('/collections', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  const updateCollectionMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiFetch<Collection>(`/collections/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  const deleteCollectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/collections/${id}`, {
        method: 'DELETE',
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['trash', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  return {
    collections: collectionsQuery.data || [],
    isLoading: collectionsQuery.isLoading,
    createCollection: createCollectionMutation.mutateAsync,
    updateCollection: updateCollectionMutation.mutateAsync,
    deleteCollection: deleteCollectionMutation.mutateAsync,
  };
}
