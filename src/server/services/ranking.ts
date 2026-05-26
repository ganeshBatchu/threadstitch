import type { RelatedPost } from '../../shared/api.js';
import type { PostMeta } from './storage.js';

type Candidate = {
  postId: string;
  similarity: number;
  meta: PostMeta;
  clickCount: number;
};

// Weights for each signal (must sum to 1.0)
const W_SIMILARITY = 0.45;
const W_CLICKS     = 0.25;
const W_RECENCY    = 0.20;
const W_ENGAGEMENT = 0.10;

const AGE_HALF_LIFE_DAYS = 30;

const recencyScore = (createdAt: number, nowMs: number): number => {
  const ageMs = nowMs - createdAt * 1000;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.exp(-ageDays / AGE_HALF_LIFE_DAYS);
};

const engagementScore = (score: number, numComments: number): number => {
  // log-scale so viral posts don't dominate
  return Math.log1p(score + numComments * 2) / 10;
};

const clamp = (val: number): number => Math.max(0, Math.min(1, val));

export const rankRelated = (candidates: Candidate[], now = Date.now()): RelatedPost[] => {
  if (candidates.length === 0) return [];

  // Normalize click counts to [0,1]
  const maxClicks = Math.max(...candidates.map((c) => c.clickCount), 1);
  const maxEngagement = Math.max(
    ...candidates.map((c) => engagementScore(c.meta.score, c.meta.numComments)),
    1
  );

  const scored = candidates.map((c) => {
    const simScore    = clamp(c.similarity);
    const clickScore  = clamp(c.clickCount / maxClicks);
    const recency     = clamp(recencyScore(c.meta.createdAt, now));
    const engagement  = clamp(
      engagementScore(c.meta.score, c.meta.numComments) / maxEngagement
    );

    const finalScore =
      W_SIMILARITY * simScore +
      W_CLICKS     * clickScore +
      W_RECENCY    * recency +
      W_ENGAGEMENT * engagement;

    return { c, finalScore };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);

  return scored.map(({ c, finalScore }) => ({
    id: c.meta.id,
    title: c.meta.title,
    url: c.meta.url,
    score: c.meta.score,
    numComments: c.meta.numComments,
    createdAt: c.meta.createdAt,
    preview: c.meta.preview,
    similarity: Math.round(finalScore * 100),
  }));
};
