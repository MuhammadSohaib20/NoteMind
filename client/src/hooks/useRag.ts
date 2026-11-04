import { useMutation } from '@tanstack/react-query';
import { RagResponse, RagResultNote, RagSource } from '../types';

const BASE_URL = '/api/v1';

export interface AskParams {
  question: string;
  topK?: number;
  collectionIds?: string[];
  noteIds?: string[];
}

export interface AskStreamCallbacks {
  onMeta?: (meta: { retrievedNotes: RagResultNote[]; sources: RagSource[] }) => void;
  onDelta?: (answer: string) => void;
  onRestart?: () => void;
}

/** Streams answer deltas from POST /rag/ask/stream. */
export function useRag() {
  const askRagMutation = useMutation({
    mutationFn: async ({
      question,
      topK = 3,
      collectionIds,
      noteIds,
      onMeta,
      onDelta,
      onRestart,
    }: AskParams & AskStreamCallbacks): Promise<RagResponse> => {
      const token = localStorage.getItem('notemind_token');
      const response = await fetch(`${BASE_URL}/rag/ask/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question, topK, collectionIds, noteIds }),
      });

      if (!response.ok || !response.body) {
        if (response.status === 401) {
          localStorage.removeItem('notemind_token');
          localStorage.removeItem('notemind_user');
        }
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message || `AI request failed (HTTP ${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventLines: string[] = [];
      let answer = '';
      let finalResponse: RagResponse | null = null;

      const dispatchFrame = (lines: string[]) => {
        let event = 'message';
        const data: string[] = [];
        for (const line of lines) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
        }
        if (data.length === 0) return;

        const payload = JSON.parse(data.join('\n'));
        if (event === 'meta') {
          onMeta?.({
            retrievedNotes: payload.retrievedNotes ?? [],
            sources: payload.sources ?? [],
          });
        } else if (event === 'delta') {
          answer += payload.text ?? '';
          onDelta?.(answer);
        } else if (event === 'restart') {
          answer = '';
          onRestart?.();
        } else if (event === 'error') {
          throw new Error(payload.message || 'The answer stream failed.');
        } else if (event === 'done') {
          finalResponse = {
            question: payload.question,
            answer: payload.answer,
            retrievedNotes: payload.retrievedNotes ?? [],
            sources: payload.sources ?? [],
            degraded: payload.degraded ?? false,
          };
        }
      };

      const processLine = (line: string) => {
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.length === 0) {
          dispatchFrame(eventLines);
          eventLines = [];
        } else {
          eventLines.push(line);
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          let newlineAt: number;
          while ((newlineAt = buffer.indexOf('\n')) !== -1) {
            processLine(buffer.slice(0, newlineAt));
            buffer = buffer.slice(newlineAt + 1);
          }
          if (done) break;
        }
        if (buffer.length > 0) processLine(buffer);
        if (eventLines.length > 0) dispatchFrame(eventLines);
      } finally {
        reader.releaseLock();
      }

      if (!finalResponse) {
        throw new Error('The answer stream ended unexpectedly. Please try again.');
      }
      return finalResponse;
    },
  });

  return {
    askRag: askRagMutation.mutateAsync,
    isAsking: askRagMutation.isPending,
    error: askRagMutation.error,
    data: askRagMutation.data,
    reset: askRagMutation.reset,
  };
}
