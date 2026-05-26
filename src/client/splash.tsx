import './index.css';

import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { navigateTo, requestExpandedMode } from '@devvit/web/client';
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

const badge = (pct: number) =>
  pct >= 80 ? 'Very similar' :
  pct >= 60 ? 'Similar' :
  pct >= 40 ? 'Related' : 'Loosely related';

// ---- sub-components ----

const PostCard = ({ post, onNavigate }: { post: RelatedPost; onNavigate: (p: RelatedPost) => void }) => (
  <button
    onClick={() => onNavigate(post)}
    className="w-full text-left p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-[#d93900] dark:hover:border-orange-500 transition-colors group"
  >
    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug line-clamp-2 group-hover:text-[#d93900] dark:group-hover:text-orange-400">
      {post.title}
    </p>
    {post.preview && (
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{post.preview}</p>
    )}
    <div className="mt-2 flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
      <span className="flex items-center gap-1">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 3l7 7h-4v7H7v-7H3l7-7z"/></svg>
        {post.score}
      </span>
      <span className="flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
        {post.numComments}
      </span>
      <span>{timeAgo(post.createdAt)}</span>
      <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
        {badge(post.similarity)}
      </span>
    </div>
  </button>
);

// ---- main splash component ----

export const Splash = () => {
  const { posts, loading, source } = useRelated();
  const [expanded, setExpanded] = useState(false);

  const display = expanded ? posts : posts.slice(0, 3);
  const hasMore = posts.length > 3 && !expanded;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#d93900] flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">ThreadStitch</h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">Related Discussions</p>
            </div>
          </div>
          {posts.length > 0 && (
            <button
              onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
              className="text-xs text-[#d93900] dark:text-orange-400 hover:underline font-medium"
            >
              Full view →
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-3 space-y-2 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-[#d93900] border-t-transparent rounded-full animate-spin" />
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Finding related posts…</span>
          </div>
        ) : display.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <svg className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No related discussions yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {source === 'fallback'
                ? 'Browse the subreddit for similar posts'
                : 'ThreadStitch builds index as more posts arrive'}
            </p>
          </div>
        ) : (
          <>
            {display.map((p) => (
              <PostCard key={p.id} post={p} onNavigate={(post) => navigateTo(post.url)} />
            ))}
            {hasMore && (
              <button
                onClick={() => setExpanded(true)}
                className="w-full py-2 text-xs font-medium text-[#d93900] dark:text-orange-400 hover:underline"
              >
                Show {posts.length - 3} more →
              </button>
            )}
          </>
        )}
      </div>

      {!loading && display.length > 0 && (
        <div className="px-4 pb-3 pt-1 text-center">
          <p className="text-[10px] text-gray-400 dark:text-gray-600">
            Powered by ThreadStitch · TF-IDF similarity
          </p>
        </div>
      )}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
