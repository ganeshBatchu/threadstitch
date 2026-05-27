import { settings } from '@devvit/web/server';

// ---- per-subreddit app settings ----
// All values are configured by moderators via mod tools → App Settings.
// This helper reads them with safe defaults so the app works out-of-the-box
// even when mods haven't explicitly configured anything.

export type AppSettings = {
  /** Number of similar posts before a topic is flagged as Recurring (default: 3) */
  faqThreshold: number;
  /** Whether to auto-post the Monday community digest (default: true) */
  digestEnabled: boolean;
  /** Minimum similarity % to include a post in the related list (default: 40) */
  minSimilarityPct: number;
  /** Max related posts to show per sticky comment (default: 5) */
  maxRelatedPosts: number;
};

export const getSettings = async (): Promise<AppSettings> => {
  const [faqThreshold, digestEnabled, minSimilarityPct, maxRelatedPosts] = await Promise.all([
    settings.get<number>('faq_threshold'),
    settings.get<boolean>('digest_enabled'),
    settings.get<number>('min_similarity_pct'),
    settings.get<number>('max_related_posts'),
  ]);

  return {
    faqThreshold:     faqThreshold     ?? 3,
    digestEnabled:    digestEnabled    ?? true,
    minSimilarityPct: minSimilarityPct ?? 40,
    maxRelatedPosts:  maxRelatedPosts  ?? 5,
  };
};
