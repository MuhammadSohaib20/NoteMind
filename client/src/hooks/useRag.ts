import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { RagResponse } from '../types';

export function useRag() {
  const askRagMutation = useMutation({
    mutationFn: async ({ question, topK = 3 }: { question: string; topK?: number }) => {
      const res = await apiFetch<RagResponse>('/rag/ask', {
        method: 'POST',
        body: JSON.stringify({ question, topK }),
      });
      return res.data;
    },
  });

  return {
    askRag: askRagMutation.mutateAsync,
    isAsking: askRagMutation.isPending,
    data: askRagMutation.data,
    error: askRagMutation.error,
    reset: askRagMutation.reset,
  };
}
