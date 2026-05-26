import { Hono } from 'hono';
import type { OnAppInstallRequest, OnPostSubmitRequest, TriggerResponse } from '@devvit/web/shared';
import { context, reddit } from '@devvit/web/server';
import type { T3 } from '@devvit/shared-types/tid.js';
import { indexPost, findSimilar } from '../services/similarity.js';
import { storePostMeta, getPostMeta, cacheRelated } from '../services/storage.js';
import { rankRelated } from '../services/ranking.js';
import type { PostMeta } from '../services/storage.js';
import type { RelatedPost } from '../../shared/api.js';

export const triggers = new Hono();

// On install, do nothing
triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  console.log(`ThreadStitch installed in ${context.subredditName} (${input.type})`);
  return c.json<TriggerResponse>({}, 200);
});

// ---- format related posts as a markdown comment ----
//
// faqCount: total number of deduplicated similar posts found (before slicing).
//   ≥ 3 → treat this as a recurring/FAQ topic and say so explicitly.

function formatRelatedComment(
  related: RelatedPost[],
  fallback = false,
  faqCount = 0
): string {
  const isRecurring = !fallback && faqCount >= 3;

  const heading = fallback
    ? '## 🧵 ThreadStitch — Other Recent Posts'
    : isRecurring
      ? '## 🔁 ThreadStitch — Recurring Topic'
      : '## 🧵 ThreadStitch — Related Discussions';

  const intro = fallback
    ? 'The index is still building — here are the most recent posts in this subreddit:'
    : isRecurring
      ? `This topic has come up **${faqCount} time${faqCount !== 1 ? 's' : ''}** in this subreddit. Here are the most relevant past discussions:`
      : 'These posts cover similar topics:';

  const lines: string[] = [heading, '', intro, ''];

  for (let i = 0; i < related.length; i++) {
    const p = related[i];
    const pct = Math.round(p.similarity * 100);
    const badge = fallback ? '🕐 Recent' :
      pct >= 80 ? '🟢 Very similar' :
      pct >= 60 ? '🟡 Similar' :
      pct >= 40 ? '🟠 Related' : '⚪ Loosely related';

    lines.push(`**${i + 1}. [${p.title}](${p.url})**`);
    lines.push(`${badge} · ↑ ${p.score} · 💬 ${p.numComments} comments`);
    if (p.preview && p.preview.trim().length > 10) {
      lines.push(`> ${p.preview.slice(0, 120).trim()}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('^(Powered by ThreadStitch · TF-IDF content similarity)');

  return lines.join('\n');
}

// Fires when any post is submitted to the subreddit
triggers.post('/on-post-submit', async (c) => {
  try {
    const input = await c.req.json<OnPostSubmitRequest>();
    const post = input.post;
    const subreddit = input.subreddit;

    if (!post || !subreddit) {
      return c.json<TriggerResponse>({}, 200);
    }

    // Skip any posts that already came from this bot to avoid infinite loops
    if (post.title.startsWith('🔍 Related: ') || post.title.startsWith('🧵 ThreadStitch')) {
      return c.json<TriggerResponse>({}, 200);
    }

    const subredditName = subreddit.name ?? context.subredditName ?? 'unknown';
    // Never use post.url as preview — the URL contains the post ID and subreddit name
    // which become high-IDF garbage tokens that crowd out real content terms.
    const preview = (post.selftext ?? '').slice(0, 150);

    // The PostV2 trigger event sends post.id with the "t3_" prefix already included.
    // Strip it for storage keys (meta:, vec:, etc.) and re-add it only for submitComment.
    const rawPostId = post.id.startsWith('t3_') ? post.id.slice(3) : post.id;

    const meta: PostMeta = {
      id: rawPostId,
      title: post.title,
      url: post.permalink
        ? `https://reddit.com${post.permalink}`
        : `https://reddit.com/r/${subredditName}/comments/${post.id}`,
      preview,
      score: post.score ?? 1,
      numComments: post.numComments ?? 0,
      createdAt: post.createdAt ?? Math.floor(Date.now() / 1000),
      subreddit: subredditName,
    };

    // 1. Index the new post (TF-IDF vectorization + update inverted index)
    const queryVector = await indexPost(meta);

    // 2. Find similar posts using the inverted index
    const candidates = await findSimilar(meta, queryVector, 8);
    let rankedRelated: ReturnType<typeof rankRelated> = [];

    if (candidates.length > 0) {
      const candidateMetas = await Promise.all(
        candidates.map(async (cand) => {
          const m = await getPostMeta(cand.postId);
          return m ? { ...cand, meta: m, clickCount: 0 } : null;
        })
      );
      const valid = candidateMetas.filter((m) => m !== null);
      if (valid.length > 0) {
        rankedRelated = rankRelated(valid);
      }
    }

    // 3. Store the original post's metadata (needed for future similarity lookups)
    await storePostMeta(meta);

    // 4. Cache related posts so the /api/related endpoint can serve them quickly
    if (rankedRelated.length > 0) {
      await cacheRelated(meta.id, rankedRelated.slice(0, 10)); // cache more, dedup later
    }

    // 5. Deduplicate by title (multiple seed runs create identical posts with different IDs)
    const deduped = (() => {
      const seen = new Set<string>();
      return rankedRelated.filter((p) => {
        const key = p.title.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })();

    // 6. If TF-IDF found nothing (index too small), fall back to Reddit's hot posts
    let postsToShow = deduped.slice(0, 5);
    let usingFallback = false;
    if (postsToShow.length === 0) {
      try {
        const listing = reddit.getHotPosts({ subredditName, limit: 12 });
        const hotPosts = await listing.get(12);
        const others = hotPosts
          .filter((p) =>
            p.id !== rawPostId &&                                   // not the current post
            p.body && p.body.length > 20 &&                        // has actual text content
            !p.body.includes('not supported on old Reddit') &&     // not a Devvit custom post
            !p.body.includes('content not supported') &&           // belt-and-suspenders
            !p.title.startsWith('🔍 Related:') &&                  // not an old widget post
            !p.title.startsWith('🧵 ThreadStitch')                 // not a bot post
          )
          .slice(0, 5);
        if (others.length > 0) {
          postsToShow = others.map((p) => ({
            id: p.id,
            title: p.title,
            url: `https://reddit.com${p.permalink}`,
            score: p.score,
            numComments: p.numberOfComments,
            createdAt: Math.floor(p.createdAt.getTime() / 1000),
            preview: (p.body ?? '').slice(0, 120),
            similarity: 0,
          }));
          usingFallback = postsToShow.length > 0;
        }
      } catch (hotErr) {
        console.warn('ThreadStitch: hot posts fallback failed:', hotErr);
      }
    }

    // 6. Post a sticky bot comment directly on the original post.
    //    Always post something — even a fallback — so we know the trigger is working.
    if (postsToShow.length > 0) {
      try {
        // faqCount = total deduplicated similar posts before slicing to 5.
        // If ≥ 3, the comment heading switches to "Recurring Topic" mode.
        const faqCount = usingFallback ? 0 : deduped.length;
        const commentText = formatRelatedComment(postsToShow, usingFallback, faqCount);

        const comment = await reddit.submitComment({
          id: `t3_${rawPostId}` as T3,
          text: commentText,
          runAs: 'APP',
        });

        // Distinguish as mod + sticky so it's pinned at the top of the thread
        try {
          await comment.distinguish(true);
        } catch (distinguishErr) {
          console.warn(`ThreadStitch: distinguish failed for comment ${comment.id}:`, distinguishErr);
        }

        console.log(
          `ThreadStitch: posted comment ${comment.id} on post ${meta.id} ` +
          `(${postsToShow.length} posts, fallback=${usingFallback})`
        );
      } catch (commentErr) {
        console.error(`ThreadStitch: comment failed for post ${meta.id}:`, commentErr);
      }
    } else {
      // Subreddit is completely empty — nothing to suggest yet
      console.log(`ThreadStitch: indexed post ${meta.id} — subreddit empty, skipping comment`);
    }

    return c.json<TriggerResponse>({}, 200);
  } catch (error) {
    // Never crash post creation
    console.error('ThreadStitch onPostSubmit error:', error);
    return c.json<TriggerResponse>({}, 200);
  }
});
