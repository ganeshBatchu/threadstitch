import { useEffect, useRef, useState } from 'react';
import { context } from '@devvit/web/client';
import type { RelatedPost, RelatedPostsResponse } from '../../shared/api.js';

type State = {
  posts: RelatedPost[];
  loading: boolean;
  source: 'cache' | 'computed' | 'fallback' | null;
  postId: string | null;
};

export const useRelated = () => {
  const [state, setState] = useState<State>({
    posts: [],
    loading: true,
    source: null,
    postId: null,
  });

  const didFetch = useRef(false);

  useEffect(() => {
    if (didFetch.current) return;
    didFetch.current = true;

    const load = async () => {
      const postId = context.postId;
      if (!postId) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }

      try {
        const res = await fetch(`/api/related?postId=${encodeURIComponent(postId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: RelatedPostsResponse = await res.json();
        setState({
          posts: data.posts ?? [],
          loading: false,
          source: data.source,
          postId: data.postId,
        });
      } catch (err) {
        console.error('useRelated fetch failed', err);
        setState((s) => ({ ...s, loading: false }));
      }
    };

    void load();
  }, []);

  const trackClick = async (toPostId: string) => {
    if (!state.postId) return;
    try {
      await fetch('/api/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromPostId: state.postId, toPostId }),
      });
    } catch {
      // click tracking is best-effort
    }
  };

  return { ...state, trackClick } as const;
};
