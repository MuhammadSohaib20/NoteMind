import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { Tag } from '../types';
import { useAuth } from '../context/AuthContext';

export function useTags() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const tagsQuery = useQuery({
    queryKey: ['tags', user?.id],
    queryFn: async () => {
      const res = await apiFetch<Tag[]>('/tags');
      return res.data || [];
    },
    enabled: !!user?.id,
  });

  const createTagMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiFetch<Tag>('/tags', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const updateTagMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiFetch<Tag>(`/tags/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/tags/${id}`, {
        method: 'DELETE',
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  return {
    tags: tagsQuery.data || [],
    isLoading: tagsQuery.isLoading,
    createTag: createTagMutation.mutateAsync,
    updateTag: updateTagMutation.mutateAsync,
    deleteTag: deleteTagMutation.mutateAsync,
  };
}
