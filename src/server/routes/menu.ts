import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createPost, createDashboardPost } from '../core/post';
import { flushAllData } from '../services/storage';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const post = await createPost();

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create post',
      },
      400
    );
  }
});

// Moderator action: create (or recreate) the pinnable Analytics dashboard post.
menu.post('/create-dashboard', async (c) => {
  try {
    const post = await createDashboardPost();
    return c.json<UiResponse>(
      { navigateTo: `https://reddit.com${post.permalink}` },
      200
    );
  } catch (error) {
    console.error('ThreadStitch: create dashboard post failed:', error);
    return c.json<UiResponse>({ showToast: '❌ Failed to create dashboard post' }, 400);
  }
});

// Moderator action: wipe all ThreadStitch Redis data for this subreddit.
// Use after `npm run seed -- --reset` to remove stale index entries that
// point to deleted Reddit posts.
menu.post('/flush-index', async (c) => {
  const subreddit = context.subredditName;
  if (!subreddit) {
    return c.json<UiResponse>({ showToast: '❌ Could not determine subreddit' }, 400);
  }
  try {
    const { posts, terms } = await flushAllData(subreddit);
    console.log(`ThreadStitch flush: cleared ${posts} posts, ${terms} terms for r/${subreddit}`);
    return c.json<UiResponse>({
      showToast: `✅ Index cleared — ${posts} posts, ${terms} terms removed`,
    });
  } catch (err) {
    console.error('ThreadStitch flush error:', err);
    return c.json<UiResponse>({ showToast: '❌ Flush failed — check playtest logs' }, 500);
  }
});
