import { context, reddit } from '@devvit/web/server';

export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: 'threadstitch',
  });
};

export const createDashboardPost = async () => {
  const subreddit = context.subredditName ?? 'unknown';
  return await reddit.submitCustomPost({
    subredditName: subreddit,
    title: `📊 ThreadStitch — Community Analytics (r/${subreddit})`,
    entry: 'dashboard',
    runAs: 'APP',
  });
};
