import { Hono } from 'hono';
import type { OnAppInstallRequest, OnPostSubmitRequest, OnPostDeleteRequest, TriggerResponse } from '@devvit/web/shared';
import { context, reddit, redis } from '@devvit/web/server';
import type { T3 } from '@devvit/shared-types/tid.js';
import { indexPost, findSimilar } from '../services/similarity.js';
import { storePostMeta, getPostMeta, cacheRelated, getPostVector } from '../services/storage.js';
import { rankRelated } from '../services/ranking.js';
import { getSettings } from '../services/settings.js';
import type { PostMeta } from '../services/storage.js';
import type { RelatedPost } from '../../shared/api.js';

export const triggers = new Hono();

// ---- flair suggestion helpers ----

// Make a TF-IDF term human-readable: short/numeric tokens (RTX, DDR5) → UPPER CASE,
// longer normal words → Title Case.
const displayFlairTerm = (term: string): string => {
  if (term.length <= 4 || /\d/.test(term)) return term.toUpperCase();
  return term.charAt(0).toUpperCase() + term.slice(1);
};

// Stemmed and raw forms that are too generic to use as a flair label
const FLAIR_BLOCKLIST = new Set([
  'post', 'like', 'get', 'know', 'think', 'use', 'want', 'help', 'make',
  'go', 'got', 'run', 'look', 'see', 'work', 'works', 'working', 'tri',
  'alreadi', 'realli', 'still', 'done', 'come', 'keep', 'check', 'find',
  'show', 'happen', 'start', 'stop', 'put', 'set', 'add', 'turn', 'switch',
  'need', 'take', 'fix', 'updat', 'reset', 'test', 'read', 'write',
  'chang', 'mov', 'remov', 'delet',
  'good', 'new', 'old', 'high', 'low', 'long', 'short', 'small', 'big',
  'one', 'two', 'three', 'time', 'back', 'way', 'thing', 'lot', 'bit',
  'gam', 'issu', 'hit', 'differ',
  'question', 'answer', 'reddit', 'subreddit', 'thread',
  'expens', 'cheap', 'cost', 'price', 'budget', 'worth',
  'pc', 'built', 'build', 'system', 'setup', 'rig', 'spec',
]);

// Pick the best flair label from a TF-IDF vector: highest-weight non-generic term.
// Returns a formatted display string, or undefined if nothing meaningful was found.
const suggestFlair = (vector: Map<string, number>): string | undefined => {
  let bestTerm: string | undefined;
  let bestWeight = 0;
  for (const [term, weight] of vector) {
    if (weight > bestWeight && term.length >= 3 && !FLAIR_BLOCKLIST.has(term)) {
      bestWeight = weight;
      bestTerm = term;
    }
  }
  return bestTerm ? displayFlairTerm(bestTerm) : undefined;
};

// On install — send a welcome mod mail explaining what ThreadStitch does
triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  const subreddit = context.subredditName ?? 'your subreddit';
  console.log(`ThreadStitch installed in ${subreddit} (${input.type})`);

  try {
    await reddit.modMail.createConversation({
      subredditName: subreddit,
      subject: '🧵 ThreadStitch is now active!',
      body: [
        `ThreadStitch has been installed in **r/${subreddit}** and is ready to go — no configuration required.`,
        '',
        '**What it does:**',
        '- Posts a sticky comment on every new submission linking to the most similar past discussions',
        '- Flags topics as "🔁 Recurring" when they come up repeatedly, so you know before they flood the queue',
        '- Suggests a flair label on each post based on TF-IDF content analysis',
        '- Auto-posts a weekly community digest every Monday with top topics and trending signals',
        '',
        '**Mod tools:**',
        '- **Mod menu → Open Mod Dashboard** — analytics: top topic clusters, trending terms, recent activity, and one-click megathread creation',
        '- **Mod menu → Flush ThreadStitch Index** — wipe the index (useful after a dev reset)',
        '- **Mod tools → App Settings** — configure the FAQ threshold, minimum similarity, max posts shown, and digest toggle',
        '',
        '^(Powered by ThreadStitch · TF-IDF content similarity)',
      ].join('\n'),
      to: null, // sends to the subreddit mod inbox
      isAuthorHidden: true,
    });
  } catch (mailErr) {
    // Never crash the install — mod mail is best-effort
    console.warn('ThreadStitch: welcome mod mail failed:', mailErr);
  }

  return c.json<TriggerResponse>({}, 200);
});

// ---- format related posts as a markdown comment ----
//
// faqCount: total number of deduplicated similar posts found (before slicing).
//   ≥ 3 → treat this as a recurring/FAQ topic and say so explicitly.

function formatRelatedComment(
  related: RelatedPost[],
  fallback = false,
  faqCount = 0,
  suggestedFlair?: string,
  isRecurring = false
): string {
  // isRecurring is pre-computed by the caller using the mod-configured threshold

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

  if (!fallback && suggestedFlair) {
    lines.push(`💡 Suggested flair: **${suggestedFlair}**`);
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

    // 1. Load mod-configured settings (with safe defaults)
    const appSettings = await getSettings();

    // 2. Index the new post (TF-IDF vectorization + update inverted index)
    const queryVector = await indexPost(meta);

    // 3. Find similar posts using the inverted index
    const candidates = await findSimilar(meta, queryVector, 8);
    let rankedRelated: ReturnType<typeof rankRelated> = [];

    if (candidates.length > 0) {
      const candidateMetas = await Promise.all(
        candidates.map(async (cand) => {
          const m = await getPostMeta(cand.postId);
          return m ? { ...cand, meta: m, clickCount: 0 } : null;
        })
      );
      // Apply mod-configured minimum similarity threshold
      const minSim = appSettings.minSimilarityPct / 100;
      const valid = candidateMetas.filter((m) => m !== null && m.similarity >= minSim);
      if (valid.length > 0) {
        rankedRelated = rankRelated(valid);
      }
    }

    // 4. Store the original post's metadata (needed for future similarity lookups)
    await storePostMeta(meta);

    // 5. Cache related posts so the /api/related endpoint can serve them quickly
    if (rankedRelated.length > 0) {
      await cacheRelated(meta.id, rankedRelated.slice(0, 10)); // cache more, dedup later
    }

    // 6. Deduplicate by title (multiple seed runs create identical posts with different IDs)
    const deduped = (() => {
      const seen = new Set<string>();
      return rankedRelated.filter((p) => {
        const key = p.title.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })();

    // 7. If TF-IDF found nothing (index too small), fall back to Reddit's hot posts
    let postsToShow = deduped.slice(0, appSettings.maxRelatedPosts);
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
          .slice(0, appSettings.maxRelatedPosts);
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
        // faqCount = total deduplicated similar posts before slicing to maxRelatedPosts.
        // If ≥ faqThreshold (mod-configurable, default 3), comment switches to "Recurring Topic".
        const faqCount = usingFallback ? 0 : deduped.length;
        const isRecurringTopic = !usingFallback && faqCount >= appSettings.faqThreshold;

        // Top-weighted non-generic TF-IDF term → flair label suggestion for mods
        const suggestedFlair = usingFallback ? undefined : suggestFlair(queryVector);

        const commentText = formatRelatedComment(postsToShow, usingFallback, faqCount, suggestedFlair, isRecurringTopic);

        console.log(
          `ThreadStitch: faqCount=${faqCount} threshold=${appSettings.faqThreshold} ` +
          `isRecurring=${isRecurringTopic} flair="${suggestedFlair ?? 'none'}"`
        );

        // Alert the mod team the FIRST time a topic crosses the recurring threshold.
        // Use a Redis flag (faq_alerted:{sub}:{term}) so the alert fires once per topic.
        // NOTE: alert fires on isRecurringTopic alone — suggestedFlair is not required.
        if (isRecurringTopic) {
          // Use the flair term as the dedup key; fall back to 'topic' if none was found
          const alertTerm = (suggestedFlair ?? 'topic').toLowerCase();
          const alertKey = `faq_alerted:${subredditName}:${alertTerm}`;
          const alreadyAlerted = await redis.get(alertKey);
          console.log(`ThreadStitch: recurring alert check — key=${alertKey} alreadyAlerted=${alreadyAlerted ?? 'no'}`);
          if (!alreadyAlerted) {
            await redis.set(alertKey, '1');
            const flairLabel = suggestedFlair ?? `${faqCount} similar posts`;
            try {
              await reddit.modMail.createConversation({
                subredditName,
                subject: `⚠️ Recurring topic detected: ${flairLabel}`,
                body: [
                  `ThreadStitch has detected a **recurring topic** in r/${subredditName}.`,
                  '',
                  `**Topic:** ${flairLabel}`,
                  `**Similar posts found:** ${faqCount}`,
                  '',
                  'Recent posts in this cluster:',
                  ...postsToShow.slice(0, 4).map((p, i) => `${i + 1}. [${p.title}](${p.url})`),
                  '',
                  'Consider pinning a megathread or adding a FAQ entry.',
                  'Open the **Mod Dashboard** to create a megathread in one click.',
                  '',
                  '^(ThreadStitch recurring topic alert · threshold configurable in App Settings)',
                ].join('\n'),
                to: null,
                isAuthorHidden: true,
              });
              console.log(`ThreadStitch: recurring topic mod mail sent for "${flairLabel}" in r/${subredditName}`);
            } catch (mailErr) {
              // Roll back the flag so the alert can be retried next time
              await redis.del(alertKey);
              console.error('ThreadStitch: FAQ alert mail failed:', mailErr);
            }
          }
        }

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

// Fires when a post is deleted — removes it from the TF-IDF index so
// future similarity searches never surface links to deleted content.
triggers.post('/on-post-delete', async (c) => {
  try {
    const input = await c.req.json<OnPostDeleteRequest>();
    const post = input.post;
    const subreddit = input.subreddit;

    if (!post || !subreddit) return c.json<TriggerResponse>({}, 200);

    const subredditName = subreddit.name ?? context.subredditName ?? 'unknown';
    const rawPostId = post.id.startsWith('t3_') ? post.id.slice(3) : post.id;

    // Read the stored vector to know which inverted-index entries to remove
    const vector = await getPostVector(rawPostId);
    const terms = Array.from(vector.keys());

    const keysToDelete = [
      `meta:${rawPostId}`,
      `vec:${rawPostId}`,
      `related:${rawPostId}`,
      `clicks:${rawPostId}`,
    ];

    await Promise.all([
      // Bulk-delete all per-post Redis keys
      redis.del(...keysToDelete),
      // Remove post from the chronological posts ZSET
      redis.zRem(`posts:${subredditName}`, [rawPostId]),
      // Remove post from every inverted-index bucket it appears in
      ...terms.map((term) => redis.zRem(`idx:${subredditName}:${term}`, [rawPostId])),
    ]);

    console.log(
      `ThreadStitch: cleaned up deleted post ${rawPostId} ` +
      `(${terms.length} index terms removed)`
    );
    return c.json<TriggerResponse>({}, 200);
  } catch (error) {
    console.error('ThreadStitch onPostDelete error:', error);
    return c.json<TriggerResponse>({}, 200);
  }
});
