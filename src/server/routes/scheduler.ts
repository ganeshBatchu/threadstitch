import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type { TaskRequest, TaskResponse } from '@devvit/web/server';
import { computeDashboard } from '../services/analytics.js';
import { getSettings } from '../services/settings.js';

export const schedulerRoutes = new Hono();

// ---- helpers ----

// Same display logic used by the dashboard and flair suggestion
const displayTerm = (term: string): string => {
  if (term.length <= 4 || /\d/.test(term)) return term.toUpperCase();
  return term.charAt(0).toUpperCase() + term.slice(1);
};

// Format the weekly digest as a Reddit markdown self-post body
function formatDigest(
  subreddit: string,
  totalPosts: number,
  postsThisWeek: number,
  topTopics: Array<{ term: string; postCount: number }>,
  trending: Array<{ term: string; growthMultiplier: number; recentCount: number }>,
): string {
  const lines: string[] = [];

  lines.push(`## 🧵 ThreadStitch Weekly Digest — r/${subreddit}`);
  lines.push('');
  lines.push("Here's what your community talked about most this week.");
  lines.push('');

  // ── stats bar ──
  lines.push(`📊 **${postsThisWeek} post${postsThisWeek !== 1 ? 's' : ''}** indexed this week · **${totalPosts} total** in the index`);
  lines.push('');

  // ── top topics ──
  if (topTopics.length > 0) {
    lines.push('### 🔥 Top Topics');
    lines.push('');
    topTopics.slice(0, 10).forEach((t, i) => {
      lines.push(
        `${i + 1}. **${displayTerm(t.term)}** — ${t.postCount} post${t.postCount !== 1 ? 's' : ''}`
      );
    });
    lines.push('');
  }

  // ── trending ──
  if (trending.length > 0) {
    lines.push('### 📈 Trending This Week');
    lines.push('');
    trending.slice(0, 5).forEach((t) => {
      lines.push(
        `- **${displayTerm(t.term)}** — ${t.growthMultiplier}× above normal · ${t.recentCount} recent post${t.recentCount !== 1 ? 's' : ''}`
      );
    });
    lines.push('');
  }

  if (topTopics.length === 0 && trending.length === 0) {
    lines.push('_Not enough activity this week to surface topics. Keep posting!_');
    lines.push('');
  }

  lines.push('---');
  lines.push('^(Powered by ThreadStitch · TF-IDF content analysis · Runs every Monday)');

  return lines.join('\n');
}

// ---- scheduled task handler ----
//
// Registered in devvit.json under scheduler.tasks.weekly-digest
// Runs every Monday at 09:00 UTC via cron: "0 9 * * 1"

schedulerRoutes.post('/weekly-digest', async (c) => {
  const body = await c.req.json<TaskRequest<undefined>>();
  const subreddit = context.subredditName;

  console.log(`ThreadStitch weekly-digest: task=${body.name} subreddit=${subreddit ?? 'unknown'}`);

  if (!subreddit) {
    console.warn('ThreadStitch weekly-digest: no subreddit in context — skipping');
    return c.json<TaskResponse>({});
  }

  try {
    // Respect the mod-configured digest toggle
    const appSettings = await getSettings();
    if (!appSettings.digestEnabled) {
      console.log(`ThreadStitch weekly-digest: digest disabled for r/${subreddit} — skipping`);
      return c.json<TaskResponse>({});
    }

    const data = await computeDashboard(subreddit);

    // Nothing to report yet
    if (data.totalPosts === 0) {
      console.log(`ThreadStitch weekly-digest: no indexed posts for r/${subreddit} — skipping`);
      return c.json<TaskResponse>({});
    }

    const title = `🧵 ThreadStitch Weekly Digest — ${new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })}`;

    const body_text = formatDigest(
      subreddit,
      data.totalPosts,
      data.postsThisWeek,
      data.topTopics,
      data.trending,
    );

    const post = await reddit.submitPost({
      subredditName: subreddit,
      title,
      text: body_text,
      runAs: 'APP',
    });

    console.log(
      `ThreadStitch weekly-digest: posted digest ${post.id} ` +
      `(${data.postsThisWeek} this week, ${data.topTopics.length} topics)`
    );
  } catch (err) {
    console.error('ThreadStitch weekly-digest error:', err);
  }

  return c.json<TaskResponse>({});
});
