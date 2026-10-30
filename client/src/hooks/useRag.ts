import { useMutation } from '@tanstack/react-query';
import { RagResponse, RagResultNote, RagSource } from '../types';

const BASE_URL = '/api/v1';

export interface AskStreamCallbacks {
  /** Retrieval finished: matched notes and sources are known (early render). */
  onMeta?: (data: { retrievedNotes: RagResultNote[]; sources: RagSource[] }) => void;
  /** Called with the FULL answer text accumulated so far. */
  onDelta?: (accumulated: string) => void;
  /** Partial answer discarded — a fallback model is restarting it. */
  onRestart?: (reason: string) => void;
}

export interface AskParams {
  question: string;
  topK?: number;
  collectionIds?: string[];
  noteIds?: string[];
}

/**
 * Asks the assistant via the STREAMING endpoint (POST /rag/ask/stream).
 *
 * The server sends Server-Sent Events: `meta` (retrieved notes), a series of
 * `delta` frames (the answer, piece by piece — the UI shows it typing), an
 * optional `restart` (the provider died mid-answer and the fallback model is
 * starting over), and a final `done` carrying the complete answer. The
 * mutation stays pending until `done`, so `isAsking` covers the whole turn.
 */
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
        throw new Error(`AI request failed (HTTP ${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventName = '';
      let frameLines: string[] = [];
      let answer = '';
      // Held in an object so TypeScript does not narrow it to `null` below
      // (it is assigned inside the SSE-reading closure).
      const state: { final: RagResponse | null } = { final: null };

      const dispatchFrame = (frame: string) => {
        let data = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) return;

        let payload: any;
        try {
          payload = JSON.parse(data);
        } catch {
          return;
        }

        if (eventName === 'meta') {
          onMeta?.(payload);
        } else if (eventName === 'delta') {
          answer += payload.text ?? '';
          onDelta?.(answer);
        } else if (eventName === 'restart') {
          answer = '';
          onRestart?.(payload.reason);
        } else if (eventName === 'done') {
          state.final = {
            question: payload.question,
            answer: payload.answer,
            retrievedNotes: payload.retrievedNotes ?? [],
            sources: payload.sources ?? [],
            degraded: payload.degraded ?? false,
          };
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineAt: number;
        while ((newlineAt = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineAt);
          buffer = buffer.slice(newlineAt + 1);
          if (line.trim() === '') {
            // Blank line = one complete SSE frame.
            dispatchFrame(frameLines.join('\n'));
            frameLines = [];
          } else {
            frameLines.push(line);
          }
        }
      }

      if (!state.final) {
        throw new Error('The AI answer stream ended unexpectedly. Please try again.');
      }
      return state.final;
    },
  });

  return {
    askRag: askRagMutation.mutateAsync,
    isAsking: askRagMutation.isPending,
    error: askRagMutation.error,
    // Resolves to the final answer once the `done` frame arrives (legacy
    // consumers that render the complete response read it from here).
    data: askRagMutation.data,
    reset: askRagMutation.reset,
  };
}
