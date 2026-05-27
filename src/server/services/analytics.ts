import { getRecentPostIds, getPostMeta, getPostCount } from './storage.js';
import { tokenize } from './similarity.js';
import type { PostMeta } from './storage.js';
import type { DashboardData, TopicCluster, TrendingTopic } from '../../shared/api.js';

export type { DashboardData, TopicCluster, TrendingTopic };

// ---- terms that are too generic to surface as meaningful topics ----
// Includes both raw and Porter-stemmed forms.
const GENERIC_TERMS = new Set([
  // action words
  'post', 'like', 'get', 'know', 'think', 'use', 'want', 'help', 'make',
  'go', 'got', 'run', 'look', 'see', 'work', 'works', 'working', 'tri',
  'alreadi', 'realli', 'still', 'done', 'come', 'keep', 'check', 'find',
  'show', 'happen', 'start', 'stop', 'put', 'set', 'add', 'turn', 'switch',
  'need', 'take', 'fix', 'updat', 'reset', 'test', 'read', 'write',
  'chang', 'mov', 'remov', 'delet',
  // quantity / descriptor
  'good', 'new', 'old', 'high', 'low', 'long', 'short', 'small', 'big',
  'one', 'two', 'three', 'time', 'back', 'way', 'thing', 'lot', 'bit',
  'gam',     // "gaming" stemmed to "gam"
  'issu',    // "issues" → "issu"
  'hit',     // "hitting"
  'differ',  // "different" → "differ"
  // money / meta
  'question', 'answer', 'reddit', 'subreddit', 'thread',
  'expens', 'cheap', 'cost', 'price', 'budget', 'worth',
  // pc-hardware filler that's in almost every post
  'pc', 'built', 'build', 'system', 'setup', 'rig', 'spec',
]);

const MIN_TERM_LENGTH = 3;
const WEEK_SECS = 7 * 24 * 3600;

// ---- main analytics computation ----

export const computeDashboard = async (subreddit: string): Promise<DashboardData> => {
  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - WEEK_SECS;

  // 1. Fetch all indexed post IDs and the stored total count in parallel
  const [totalPosts, postIds] = await Promise.all([
    getPostCount(subreddit),
    getRecentPostIds(subreddit, 500),
  ]);

  if (postIds.length === 0) {
    return { totalPosts: 0, postsThisWeek: 0, topTopics: [], trending: [], recentPosts: [], computedAt: now };
  }

  // 2. Fetch metadata for up to 200 most-recent posts in parallel
  const cappedIds = postIds.slice(0, 200);
  const rawMetas = await Promise.all(cappedIds.map((id) => getPostMeta(id)));
  const metas = rawMetas.filter((m): m is PostMeta => m !== null);

  if (metas.length === 0) {
    return { totalPosts: totalPosts || 0, postsThisWeek: 0, topTopics: [], trending: [], recentPosts: [], computedAt: now };
  }

  // 3. Partition into all-time vs this-week
  const recentMetas = metas.filter((m) => m.createdAt >= weekAgo);
  const postsThisWeek = recentMetas.length;

  // ---- helper: tokenize a post's content, returns unique terms only ----
  const postTerms = (meta: PostMeta): Set<string> => {
    const text = `${meta.title} ${meta.title} ${meta.preview}`;
    const all = tokenize(text);
    const filtered = new Set<string>();
    for (const t of all) {
      if (!GENERIC_TERMS.has(t) && t.length >= MIN_TERM_LENGTH) filtered.add(t);
    }
    return filtered;
  };

  // 4. Build term → [PostMeta] map for all posts
  const termPosts = new Map<string, PostMeta[]>();
  for (const meta of metas) {
    for (const term of postTerms(meta)) {
      const arr = termPosts.get(term) ?? [];
      arr.push(meta);
      termPosts.set(term, arr);
    }
  }

  // 5. Build term → recentCount map
  const recentCount = new Map<string, number>();
  for (const meta of recentMetas) {
    for (const term of postTerms(meta)) {
      recentCount.set(term, (recentCount.get(term) ?? 0) + 1);
    }
  }

  // 6. Top topics — terms appearing in ≥2 posts, ranked by post count
  const topTopics: TopicCluster[] = Array.from(termPosts.entries())
    .filter(([, posts]) => posts.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([term, posts]) => ({
      term,
      postCount: posts.length,
      // Sort sample posts by score so the most-upvoted examples show first
      posts: [...posts]
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((m) => ({ id: m.id, title: m.title, url: m.url, createdAt: m.createdAt })),
    }));

  // 7. Trending — terms whose recent_rate is meaningfully above baseline
  //    baseline_rate = postsThisWeek / metas.length
  //    term_rate     = recentCount[term] / allTimeCount[term]
  //    multiplier    = term_rate / baseline_rate
  const trending: TrendingTopic[] = [];
  if (postsThisWeek >= 2 && metas.length > postsThisWeek) {
    const baselineRate = postsThisWeek / metas.length;
    for (const [term, rc] of recentCount.entries()) {
      const allCount = termPosts.get(term)?.length ?? 0;
      if (allCount < 2 || rc < 2) continue;
      const termRate = rc / allCount;
      const multiplier = +(termRate / Math.max(baselineRate, 0.01)).toFixed(1);
      if (multiplier > 1.3) {
        trending.push({ term, allTimeCount: allCount, recentCount: rc, growthMultiplier: multiplier });
      }
    }
    trending.sort((a, b) => b.growthMultiplier - a.growthMultiplier);
    trending.splice(8);
  }

  // 8. Recent posts — newest 10 by createdAt
  const recentPosts = [...metas]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10)
    .map((m) => ({ id: m.id, title: m.title, url: m.url, createdAt: m.createdAt }));

  return {
    totalPosts: Math.max(totalPosts, metas.length),
    postsThisWeek,
    topTopics,
    trending,
    recentPosts,
    computedAt: now,
  };
};
