import './index.css';

import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { navigateTo } from '@devvit/web/client';
import { useRelated } from './hooks/useRelated.js';
import type { RelatedPost } from '../shared/api.js';

// ---- helpers ----

const timeAgo = (createdAt: number): string => {
  const secs = Math.floor(Date.now() / 1000) - createdAt;
  if (secs < 60)      return 'just now';
  if (secs < 3600)    return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400)   return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 2592000) return `${Math.floor(secs / 86400)}d ago`;
  return `${Math.floor(secs / 2592000)}mo ago`;
};

const similarityColor = (pct: number): string => {
  if (pct >= 80) return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30';
  if (pct >= 60) return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30';
  if (pct >= 40) return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30';
  return 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700';
};

const similarityLabel = (pct: number): string => {
  if (pct >= 80) return `${pct}% match`;
  if (pct >= 60) return `${pct}% similar`;
  if (pct >= 40) return `${pct}% related`;
  return `${pct}% loose`;
};

// ---- expanded post card ----

type ExpandedCardProps = {
  post: RelatedPost;
  onNavigate: (post: RelatedPost) => void;
};

const ExpandedCard = ({ post, onNavigate }: ExpandedCardProps) => (
  <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-[#d93900] dark:hover:border-orange-500 transition-colors group shadow-sm">
    <button
      onClick={() => onNavigate(post)}
      className="w-full text-left p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug flex-1 group-hover:text-[#d93900] dark:group-hover:text-orange-400">
          {post.title}
        </p>
        <span className={`flex-shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${similarityColor(post.similarity)}`}>
          {similarityLabel(post.similarity)}
        </span>
      </div>

      {post.preview && (
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2">
          {post.preview}
        </p>
      )}

      <div className="mt-3 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 3l7 7h-4v7H7v-7H3l7-7z"/>
          </svg>
          <span className="font-medium">{post.score.toLocaleString()}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
          <span className="font-medium">{post.numComments.toLocaleString()} comments</span>
        </span>
        <span className="ml-auto">{timeAgo(post.createdAt)}</span>
      </div>
    </button>
  </div>
);

// ---- empty / loading states ----

const EmptyState = ({ source }: { source: 'cache' | 'computed' | 'fallback' | null }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
    <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
      <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
    </div>
    <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">
      No related discussions found
    </h3>
    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
      {source === 'fallback'
        ? 'This subreddit is brand new — check back after a few more posts are submitted.'
        : 'ThreadStitch improves as more posts are made. Come back soon!'}
    </p>
  </div>
);

const LoadingState = () => (
  <div className="flex flex-col items-center justify-center py-16">
    <div className="w-8 h-8 border-2 border-[#d93900] border-t-transparent rounded-full animate-spin mb-4" />
    <p className="text-sm text-gray-500 dark:text-gray-400">Finding related discussions…</p>
  </div>
);

// ---- main expanded view ----

export const App = () => {
  const { posts, loading, source, trackClick } = useRelated();
  const [filter, setFilter] = useState<'all' | 'top'>('all');

  const displayPosts: RelatedPost[] =
    filter === 'top' ? [...posts].sort((a, b) => b.score - a.score) : posts;

  const handleNavigate = async (post: RelatedPost) => {
    await trackClick(post.id);
    navigateTo(post.url);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 pt-4 pb-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#d93900] flex items-center justify-center flex-shrink-0 shadow">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-white">ThreadStitch</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {loading
                ? 'Loading…'
                : posts.length > 0
                  ? `${posts.length} related discussion${posts.length !== 1 ? 's' : ''} found`
                  : 'No related discussions'}
            </p>
          </div>
        </div>

        {!loading && posts.length > 1 && (
          <div className="flex gap-2 mt-3">
            {(['all', 'top'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filter === f
                    ? 'bg-[#d93900] text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {f === 'all' ? 'Best match' : 'Most upvoted'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4 space-y-3 overflow-y-auto">
        {loading ? (
          <LoadingState />
        ) : displayPosts.length === 0 ? (
          <EmptyState source={source} />
        ) : (
          <>
            {displayPosts.map((post) => (
              <ExpandedCard key={post.id} post={post} onNavigate={handleNavigate} />
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <p className="text-[11px] text-center text-gray-400 dark:text-gray-600">
          ThreadStitch · TF-IDF similarity matching · Results improve over time
        </p>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
