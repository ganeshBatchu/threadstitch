import { redis } from '@devvit/web/server';
import type { RelatedPost } from '../../shared/api.js';

// TTLs in seconds
const TTL_VECTOR = 90 * 24 * 3600; // 90 days
const TTL_CACHE = 24 * 3600;       // 24 hours
const TTL_META = 90 * 24 * 3600;   // 90 days

export type PostMeta = {
  id: string;
  title: string;
  url: string;
  preview: string;
  score: number;
  numComments: number;
  createdAt: number;
  subreddit: string;
};

// ---- post metadata ----

export const storePostMeta = async (meta: PostMeta): Promise<void> => {
  const key = `meta:${meta.id}`;
  await redis.set(key, JSON.stringify(meta));
  await redis.expire(key, TTL_META);
};

export const getPostMeta = async (postId: string): Promise<PostMeta | null> => {
  const raw = await redis.get(`meta:${postId}`);
  if (!raw) return null;
  return JSON.parse(raw) as PostMeta;
};

// ---- post TF-IDF sparse vectors ----
// Stored as a hash: field=term, value=weight string

export const storePostVector = async (
  postId: string,
  vector: Map<string, number>
): Promise<void> => {
  const key = `vec:${postId}`;
  const fields: Record<string, string> = {};
  for (const [term, weight] of vector) {
    fields[term] = String(weight);
  }
  if (Object.keys(fields).length === 0) return;
  await redis.hSet(key, fields);
  await redis.expire(key, TTL_VECTOR);
};

export const getPostVector = async (postId: string): Promise<Map<string, number>> => {
  const raw = await redis.hGetAll(`vec:${postId}`);
  const vec = new Map<string, number>();
  if (!raw) return vec;
  for (const [term, val] of Object.entries(raw)) {
    vec.set(term, parseFloat(val));
  }
  return vec;
};

// ---- inverted index: for each term, which posts contain it ----
// Key: idx:{subreddit}:{term}  — sorted set, score = TF-IDF weight

export const addToInvertedIndex = async (
  subreddit: string,
  term: string,
  postId: string,
  weight: number
): Promise<void> => {
  await redis.zAdd(`idx:${subreddit}:${term}`, { member: postId, score: weight });
};

// Returns up to `limit` postIds that have this term, ordered by weight desc
export const getTermPostIds = async (
  subreddit: string,
  term: string,
  limit = 200
): Promise<string[]> => {
  // Use rank-based range (reverse=true → rank 0 = highest score).
  // Score-based range with '+inf'/'-inf' returns empty in Devvit's Redis.
  const members = await redis.zRange(
    `idx:${subreddit}:${term}`,
    0,
    limit - 1,
    { by: 'rank', reverse: true }
  );
  return members.map((m) => m.member);
};

// ---- document frequency (how many docs contain each term) ----

export const incrementDF = async (subreddit: string, term: string): Promise<void> => {
  await redis.incrBy(`df:${subreddit}:${term}`, 1);
};

export const getDF = async (subreddit: string, term: string): Promise<number> => {
  const val = await redis.get(`df:${subreddit}:${term}`);
  return val ? parseInt(val) : 0;
};

// ---- total post count per subreddit ----

export const incrementPostCount = async (subreddit: string): Promise<number> => {
  return redis.incrBy(`count:${subreddit}`, 1);
};

export const getPostCount = async (subreddit: string): Promise<number> => {
  const val = await redis.get(`count:${subreddit}`);
  return val ? parseInt(val) : 0;
};

// ---- post index: all post IDs for a subreddit (ZSET, score=createdAt) ----

export const addPostToIndex = async (
  subreddit: string,
  postId: string,
  createdAt: number
): Promise<void> => {
  await redis.zAdd(`posts:${subreddit}`, { member: postId, score: createdAt });
};

// Returns recent postIds (newest first)
export const getRecentPostIds = async (
  subreddit: string,
  limit = 500
): Promise<string[]> => {
  // Use rank-based range (reverse=true → rank 0 = highest score = most recent).
  const members = await redis.zRange(
    `posts:${subreddit}`,
    0,
    limit - 1,
    { by: 'rank', reverse: true }
  );
  return members.map((m) => m.member);
};

// ---- cached similarity results ----

export const cacheRelated = async (postId: string, related: RelatedPost[]): Promise<void> => {
  const key = `related:${postId}`;
  await redis.set(key, JSON.stringify(related));
  await redis.expire(key, TTL_CACHE);
};

export const getCachedRelated = async (postId: string): Promise<RelatedPost[] | null> => {
  const raw = await redis.get(`related:${postId}`);
  if (!raw) return null;
  return JSON.parse(raw) as RelatedPost[];
};

// ---- ThreadStitch custom post → original post ID mapping ----
// Lets the widget know which user post it's showing related discussions for.
// Key: ts_map:{threadstitchPostId}  Value: originalUserPostId

const TTL_MAPPING = 90 * 24 * 3600; // 90 days

export const storePostMapping = async (
  tsPostId: string,
  originalPostId: string
): Promise<void> => {
  const key = `ts_map:${tsPostId}`;
  await redis.set(key, originalPostId);
  await redis.expire(key, TTL_MAPPING);
};

export const getOriginalPostId = async (tsPostId: string): Promise<string | null> => {
  return (await redis.get(`ts_map:${tsPostId}`)) ?? null;
};

// ---- click tracking ----

export const recordClick = async (fromPostId: string, toPostId: string): Promise<void> => {
  await redis.hIncrBy(`clicks:${fromPostId}`, toPostId, 1);
};

// Returns map of {toPostId: clickCount}
export const getClickCounts = async (postId: string): Promise<Map<string, number>> => {
  const raw = await redis.hGetAll(`clicks:${postId}`);
  const counts = new Map<string, number>();
  if (!raw) return counts;
  for (const [toId, val] of Object.entries(raw)) {
    counts.set(toId, parseInt(val));
  }
  return counts;
};

// ---- dev-only: flush all ThreadStitch data for a subreddit ----
// Deletes every key this app has written: vectors, inverted index, DF counters,
// post metadata, similarity caches, and the post/count tracking sets.

export const flushAllData = async (subreddit: string): Promise<{ posts: number; terms: number }> => {
  // 1. Collect all indexed post IDs (newest-first, up to 10 000)
  const postIds = await getRecentPostIds(subreddit, 10_000);

  // 2. Gather every term across all stored vectors so we can delete idx/df keys
  const termSet = new Set<string>();
  await Promise.all(
    postIds.map(async (id) => {
      const vec = await getPostVector(id);
      for (const term of vec.keys()) termSet.add(term);
    })
  );
  const terms = Array.from(termSet);

  // 3. Build the full list of keys to delete
  const keys: string[] = [
    // Per-post keys
    ...postIds.flatMap((id) => [
      `meta:${id}`,
      `vec:${id}`,
      `related:${id}`,
      `clicks:${id}`,
    ]),
    // Per-term keys
    ...terms.flatMap((term) => [
      `idx:${subreddit}:${term}`,
      `df:${subreddit}:${term}`,
    ]),
    // Subreddit-level keys
    `count:${subreddit}`,
    `posts:${subreddit}`,
    `dashboard:${subreddit}`,
  ];

  // 4. Delete in batches of 100 to stay within platform limits
  const BATCH = 100;
  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = keys.slice(i, i + BATCH);
    if (batch.length > 0) await redis.del(...batch);
  }

  return { posts: postIds.length, terms: terms.length };
};
