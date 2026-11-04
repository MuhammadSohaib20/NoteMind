import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { RagResultNote } from '../types';

/** One completed turn of the Ask-My-Notes conversation. */
export interface ChatTurn {
  question: string;
  answer: string;
  sources: RagResultNote[];
}

/**
 * The Ask-My-Notes conversation lives in the react-query cache instead of
 * component state, because the view unmounts on every navigation (dashboard,
 * collections, profile…) and component state would drop the chat each time.
 *
 * The cache lives in the QueryClient at the app root, so:
 *   - the conversation survives every in-app page switch, and
 *   - AuthContext.logout() calls queryClient.clear(), which wipes it exactly
 *     when the user logs out — nowhere else.
 *
 * The key is scoped per account so two people sharing a browser never see each
 * other's conversation, even if one logs in without logging out first.
 */
export function useChatHistory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Scoped per account: two people sharing a browser never see each other's
  // conversation, even if one signs in without signing out first.
  const chatKey = ['ask-ai', 'chat-history', user?.id ?? 'anonymous'] as const;

  // This is local state, not server data: it is seeded empty and only ever
  // updated locally, so it must never be refetched and must never be garbage
  // collected while the user is off the Ask page.
  const { data: chatHistory = [] } = useQuery<ChatTurn[]>({
    queryKey: chatKey,
    queryFn: async () => [],
    initialData: [],
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const userId = user?.id ?? 'anonymous';
  const setChatHistory = useCallback(
    (updater: ChatTurn[] | ((prev: ChatTurn[]) => ChatTurn[])) => {
      queryClient.setQueryData(['ask-ai', 'chat-history', userId], updater);
    },
    [queryClient, userId]
  );

  return { chatHistory, setChatHistory };
}
