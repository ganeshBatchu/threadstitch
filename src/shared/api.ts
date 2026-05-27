// --- ThreadStitch types ---

export type RelatedPost = {
  id: string;
  title: string;
  url: string;
  score: number;
  numComments: number;
  createdAt: number;
  preview: string;
  similarity: number;
};

export type RelatedPostsResponse = {
  type: 'related';
  posts: RelatedPost[];
  postId: string;
  source: 'cache' | 'computed' | 'fallback';
};

export type RecordClickRequest = {
  fromPostId: string;
  toPostId: string;
};

export type RecordClickResponse = {
  type: 'click_recorded';
};

export type ErrorResponse = {
  status: 'error';
  message: string;
};

// --- Mod Dashboard types ---

export type TopicCluster = {
  term: string;
  postCount: number;
  posts: Array<{ id: string; title: string; url: string; createdAt: number }>;
};

export type TrendingTopic = {
  term: string;
  allTimeCount: number;
  recentCount: number;
  growthMultiplier: number; // e.g. 2.5 = 2.5× the baseline rate
};

export type DashboardData = {
  totalPosts: number;
  postsThisWeek: number;
  topTopics: TopicCluster[];
  trending: TrendingTopic[];
  recentPosts: Array<{ id: string; title: string; url: string; createdAt: number }>;
  computedAt: number;
};

export type MegathreadResponse = {
  status: 'ok';
  url: string;
  postId: string;
} | {
  status: 'error';
  message: string;
};
