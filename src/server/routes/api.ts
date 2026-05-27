import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  DecrementResponse,
  IncrementResponse,
  InitResponse,
  RelatedPostsResponse,
  RecordClickRequest,
  RecordClickResponse,
  ErrorResponse,
} from '../../shared/api.js';
import {
  getCachedRelated,
  cacheRelated,
  getPostMeta,
  getPostVector,
  getPostCount,
  getOriginalPostId,
  recordClick,
  flushAllData,
} from '../services/storage.js';

// ---- helpers shared across endpoints ----
const displayTerm = (term: string): string => {
  if (term.length <= 4 || /\d/.test(term)) return term.toUpperCase();
  return term.charAt(0).toUpperCase() + term.slice(1);
};
import { computeDashboard } from '../services/analytics.js';
import type { DashboardData } from '../../shared/api.js';
import { findSimilar } from '../services/similarity.js';
import { rankRelated } from '../services/ranking.js';

export const api = new Hono();

api.get('/init', async (c) => {
  const { postId } = context;

  if (!postId) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'postId is required but missing from context' },
      400
    );
  }

  try {
    const [count, username] = await Promise.all([
      redis.get('count'),
      reddit.getCurrentUsername(),
    ]);

    return c.json<InitResponse>({
      type: 'init',
      postId,
      count: count ? parseInt(count) : 0,
      username: username ?? 'anonymous',
    });
  } catch (error) {
    return c.json<ErrorResponse>(
      { status: 'error', message: error instanceof Error ? error.message : 'Init failed' },
      400
    );
  }
});

api.post('/increment', async (c) => {
  const { postId } = context;
  if (!postId) return c.json<ErrorResponse>({ status: 'error', message: 'postId required' }, 400);
  const count = await redis.incrBy('count', 1);
  return c.json<IncrementResponse>({ count, postId, type: 'increment' });
});

api.post('/decrement', async (c) => {
  const { postId } = context;
  if (!postId) return c.json<ErrorResponse>({ status: 'error', message: 'postId required' }, 400);
  const count = await redis.incrBy('count', -1);
  return c.json<DecrementResponse>({ count, postId, type: 'decrement' });
});

// GET /api/related — returns related posts for the current ThreadStitch widget.
//
// context.postId is the ThreadStitch *custom* post ID, not the original user post ID.
// Resolution order:
//   1. Check cache under `context.postId` (set by trigger at widget creation time)
//   2. Resolve `context.postId` → `originalPostId` via ts_map Redis key, then check that cache
//   3. Compute on-demand using the original post's stored vector
//   4. Fall back to hot posts on new subreddits
api.get('/related', async (c) => {
  const tsPostId = c.req.query('postId') ?? context.postId;

  if (!tsPostId) {
    return c.json<ErrorResponse>({ status: 'error', message: 'postId required' }, 400);
  }

  try {
    // --- Step 1: fast cache hit under the widget's own ID ---
    const directCache = await getCachedRelated(tsPostId);
    if (directCache && directCache.length > 0) {
      return c.json<RelatedPostsResponse>({
        type: 'related',
        posts: directCache,
        postId: tsPostId,
        source: 'cache',
      });
    }

    // --- Step 2: resolve ThreadStitch post ID → original user post ID ---
    const originalPostId = (await getOriginalPostId(tsPostId)) ?? tsPostId;
    const originalCache = await getCachedRelated(originalPostId);
    if (originalCache && originalCache.length > 0) {
      // Backfill the widget's own cache key so next call is instant
      await cacheRelated(tsPostId, originalCache);
      return c.json<RelatedPostsResponse>({
        type: 'related',
        posts: originalCache,
        postId: tsPostId,
        source: 'cache',
      });
    }

    // --- Step 3: on-demand computation using stored vector ---
    const meta = await getPostMeta(originalPostId);
    if (meta) {
      const vector = await getPostVector(originalPostId);
      if (vector.size > 0) {
        const candidates = await findSimilar(meta, vector, 8);
        if (candidates.length > 0) {
          const candidateMetas = await Promise.all(
            candidates.map(async (cand) => {
              const m = await getPostMeta(cand.postId);
              return m ? { ...cand, meta: m, clickCount: 0 } : null;
            })
          );
          const valid = candidateMetas.filter((m) => m !== null);
          if (valid.length > 0) {
            const ranked = rankRelated(valid);
            const top5 = ranked.slice(0, 5);
            // Cache under both IDs for future requests
            await Promise.all([
              cacheRelated(originalPostId, top5),
              cacheRelated(tsPostId, top5),
            ]);
            return c.json<RelatedPostsResponse>({
              type: 'related',
              posts: top5,
              postId: tsPostId,
              source: 'computed',
            });
          }
        }
      }
    }

    // --- Step 4: subreddit has fewer than 3 indexed posts — show hot posts ---
    const subreddit = meta?.subreddit ?? context.subredditName;
    const postCount = subreddit ? await getPostCount(subreddit) : 0;

    if (subreddit && postCount < 5) {
      try {
        const listing = reddit.getHotPosts({ subredditName: subreddit, limit: 8 });
        const posts = (await listing.get(8))
          .filter((p) =>
            p.id !== originalPostId &&
            p.body && p.body.length > 20 &&
            !p.body.includes('not supported on old Reddit') &&
            !p.body.includes('content not supported')
          )
          .slice(0, 5);

        const related = posts.map((p) => ({
          id: p.id,
          title: p.title,
          url: `https://reddit.com${p.permalink}`,
          score: p.score,
          numComments: p.numberOfComments,
          createdAt: Math.floor(p.createdAt.getTime() / 1000),
          preview: (p.body ?? p.url ?? '').slice(0, 150),
          similarity: 50,
        }));

        if (related.length > 0) {
          return c.json<RelatedPostsResponse>({
            type: 'related',
            posts: related,
            postId: tsPostId,
            source: 'fallback',
          });
        }
      } catch (searchErr) {
        console.error('Hot posts fallback failed:', searchErr);
      }
    }

    return c.json<RelatedPostsResponse>({
      type: 'related',
      posts: [],
      postId: tsPostId,
      source: 'computed',
    });
  } catch (error) {
    console.error('API /related error:', error);
    return c.json<RelatedPostsResponse>({
      type: 'related',
      posts: [],
      postId: tsPostId,
      source: 'computed',
    });
  }
});

// GET /api/dashboard — mod-only analytics: top topics, trending, recent activity.
// Results are cached in Redis for 30 minutes to avoid re-scanning all post metadata.
api.get('/dashboard', async (c) => {
  const subreddit = c.req.query('subreddit') ?? context.subredditName;
  if (!subreddit) {
    return c.json({ status: 'error', message: 'subreddit required' }, 400);
  }

  const CACHE_TTL = 30 * 60; // 30 minutes
  const cacheKey = `dashboard:${subreddit}`;

  try {
    // Serve from cache if fresh
    const cached = await redis.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached) as DashboardData;
      if (Date.now() / 1000 - data.computedAt < CACHE_TTL) {
        return c.json(data);
      }
    }

    const data = await computeDashboard(subreddit);
    await redis.set(cacheKey, JSON.stringify(data));
    await redis.expire(cacheKey, CACHE_TTL);
    return c.json(data);
  } catch (err) {
    console.error('ThreadStitch /api/dashboard error:', err);
    return c.json({ status: 'error', message: String(err) }, 500);
  }
});

// POST /api/admin/flush — dev tool: wipe all ThreadStitch Redis data for a subreddit.
// Called by `npm run seed -- --reset` so the inverted index stays in sync with Reddit posts.
// Body (JSON): { subreddit: string }
api.post('/admin/flush', async (c) => {
  let subreddit: string | undefined;
  try {
    const body = await c.req.json<{ subreddit?: string }>();
    subreddit = body.subreddit;
  } catch {
    // ignore parse errors — fall through to context
  }
  subreddit = subreddit ?? context.subredditName;

  if (!subreddit) {
    return c.json({ status: 'error', message: 'subreddit required' }, 400);
  }

  try {
    const { posts, terms } = await flushAllData(subreddit);
    console.log(`ThreadStitch flush: cleared ${posts} posts, ${terms} terms for r/${subreddit}`);
    return c.json({ status: 'ok', deleted: { posts, terms } });
  } catch (err) {
    console.error('ThreadStitch flush error:', err);
    return c.json({ status: 'error', message: String(err) }, 500);
  }
});

// POST /api/megathread — mod action: create a pinned megathread for a topic cluster.
// Called from the dashboard Topics tab "Create Megathread" button.
// Body: { term: string, posts: Array<{title, url}>, subreddit: string }
api.post('/megathread', async (c) => {
  try {
    const body = await c.req.json<{
      term: string;
      posts: Array<{ title: string; url: string }>;
      subreddit: string;
    }>();

    const { term, posts, subreddit } = body;
    if (!term || !subreddit) {
      return c.json({ status: 'error', message: 'term and subreddit required' }, 400);
    }

    const label = displayTerm(term);
    const postLines = posts
      .slice(0, 8)
      .map((p, i) => `${i + 1}. [${p.title}](${p.url})`)
      .join('\n');

    const bodyText = [
      `Use this thread to discuss anything related to **${label}** in this community.`,
      '',
      'Previous discussions on this topic:',
      '',
      postLines,
      '',
      '---',
      '^(Created by ThreadStitch · auto-generated from recurring topic cluster)',
    ].join('\n');

    const post = await reddit.submitPost({
      subredditName: subreddit,
      title: `📌 Megathread: ${label}`,
      text: bodyText,
      runAs: 'APP',
    });

    console.log(`ThreadStitch megathread: created ${post.id} for term "${term}" in r/${subreddit}`);
    return c.json({ status: 'ok', url: `https://reddit.com${post.permalink}`, postId: post.id });
  } catch (err) {
    console.error('ThreadStitch /api/megathread error:', err);
    return c.json({ status: 'error', message: String(err) }, 500);
  }
});

// POST /api/click — record user click-through for collaborative filtering
api.post('/click', async (c) => {
  const { postId } = context;
  try {
    const body = await c.req.json<RecordClickRequest>();
    const fromId = body.fromPostId ?? postId;
    const toId = body.toPostId;

    if (!fromId || !toId) {
      return c.json<ErrorResponse>(
        { status: 'error', message: 'fromPostId and toPostId required' },
        400
      );
    }

    await recordClick(fromId, toId);
    return c.json<RecordClickResponse>({ type: 'click_recorded' });
  } catch (error) {
    console.error('API /click error:', error);
    return c.json<ErrorResponse>({ status: 'error', message: 'Failed to record click' }, 400);
  }
});
