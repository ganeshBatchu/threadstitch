import {
  storePostVector,
  addToInvertedIndex,
  incrementDF,
  incrementPostCount,
  addPostToIndex,
  getTermPostIds,
  getPostVector,
  getDF,
  getPostCount,
} from './storage.js';
import type { PostMeta } from './storage.js';

// ---- stopwords ----

const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','up','about','into','through','after','is','are','was','were',
  'be','been','being','have','has','had','do','does','did','will','would',
  'could','should','may','might','shall','can','need','dare','ought','used',
  'i','me','my','we','our','you','your','he','him','his','she','her','they',
  'them','their','it','its','this','that','these','those','what','which','who',
  'not','no','so','if','as','just','only','also','than','more','some','any',
  'all','each','both','few','other','such','same','how','when','where','why',
  'very','too','well','now','then','here','there','re','s','t','d','m','ll',
  've','ain','aren','couldn','didn','doesn','hadn','hasn','haven','isn','wasn',
  'weren','won','wouldn','gt','amp','quot','lt','http','https','www','com',
]);

// ---- tokenization + light stemming ----

const stem = (word: string): string => {
  // Simplified Porter-like stemmer — handles the most common English suffixes
  if (word.length <= 3) return word;
  if (word.endsWith('ational')) return word.slice(0, -7) + 'ate';
  if (word.endsWith('tional'))  return word.slice(0, -6) + 'tion';
  if (word.endsWith('ization')) return word.slice(0, -7) + 'ize';
  if (word.endsWith('ising'))   return word.slice(0, -5) + 'ize';
  if (word.endsWith('izing'))   return word.slice(0, -5) + 'ize';
  if (word.endsWith('ness'))    return word.slice(0, -4);
  if (word.endsWith('ment'))    return word.slice(0, -4);
  if (word.endsWith('ful'))     return word.slice(0, -3);
  if (word.endsWith('less'))    return word.slice(0, -4);
  if (word.endsWith('ible'))    return word.slice(0, -4);
  if (word.endsWith('able'))    return word.slice(0, -4);
  if (word.endsWith('tion'))    return word.slice(0, -3);
  if (word.endsWith('ings'))    return word.slice(0, -4);
  if (word.endsWith('ing'))     return word.slice(0, -3);
  if (word.endsWith('tion'))    return word.slice(0, -3);
  if (word.endsWith('ely'))     return word.slice(0, -3);
  if (word.endsWith('ies'))     return word.slice(0, -3) + 'y';
  if (word.endsWith('ness'))    return word.slice(0, -4);
  if (word.endsWith('ers'))     return word.slice(0, -2);
  if (word.endsWith('er'))      return word.slice(0, -2);
  if (word.endsWith('ed'))      return word.slice(0, -2);
  if (word.endsWith('ly'))      return word.slice(0, -2);
  if (word.endsWith('es'))      return word.slice(0, -2);
  if (word.endsWith('s') && word.length > 4) return word.slice(0, -1);
  return word;
};

export const tokenize = (text: string): string[] => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
    .map(stem)
    .filter((w) => w.length >= 2);
};

// ---- TF computation ----

const computeTF = (tokens: string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const tf = new Map<string, number>();
  const total = tokens.length || 1;
  for (const [term, count] of counts) {
    tf.set(term, count / total);
  }
  return tf;
};

// ---- IDF: log((N+1)/(df+1)) + 1 (smooth IDF) ----

const computeIDF = (N: number, df: number): number => {
  return Math.log((N + 1) / (df + 1)) + 1;
};

// ---- cosine similarity between two sparse vectors ----

export const cosineSimilarity = (
  a: Map<string, number>,
  b: Map<string, number>
): number => {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, wa] of a) {
    normA += wa * wa;
    const wb = b.get(term);
    if (wb !== undefined) dot += wa * wb;
  }
  for (const [, wb] of b) {
    normB += wb * wb;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
};

// ---- index a new post ----
// Computes TF-IDF using current IDF estimates (df already in Redis),
// stores the vector, updates the inverted index, and increments counts.

export const indexPost = async (meta: PostMeta): Promise<Map<string, number>> => {
  const text = `${meta.title} ${meta.title} ${meta.preview}`;
  const tokens = tokenize(text);

  if (tokens.length === 0) return new Map();

  const tf = computeTF(tokens);
  const uniqueTerms = Array.from(tf.keys());

  // Read current counts in parallel
  const [N, dfs] = await Promise.all([
    getPostCount(meta.subreddit),
    Promise.all(uniqueTerms.map((t) => getDF(meta.subreddit, t))),
  ]);

  // Compute TF-IDF weights
  const vector = new Map<string, number>();
  for (let i = 0; i < uniqueTerms.length; i++) {
    const term = uniqueTerms[i];
    if (!term) continue;
    const idf = computeIDF(N || 1, dfs[i] ?? 0);
    const weight = (tf.get(term) ?? 0) * idf;
    if (weight > 0) vector.set(term, weight);
  }

  // Persist in parallel: vector, inverted index entries, DF increments, post index
  await Promise.all([
    storePostVector(meta.id, vector),
    addPostToIndex(meta.subreddit, meta.id, meta.createdAt),
    incrementPostCount(meta.subreddit),
    ...uniqueTerms.map((t) => incrementDF(meta.subreddit, t)),
    ...uniqueTerms.map((t) =>
      addToInvertedIndex(meta.subreddit, t, meta.id, vector.get(t) ?? 0)
    ),
  ]);

  return vector;
};

// ---- find similar posts using the inverted index ----
// Strategy: gather candidate posts that share at least one term with the query,
// then rank by full cosine similarity. This avoids scanning all posts.

export const findSimilar = async (
  meta: PostMeta,
  queryVector: Map<string, number>,
  k = 5
): Promise<Array<{ postId: string; similarity: number }>> => {
  if (queryVector.size === 0) return [];

  // Collect candidate post IDs via inverted index (union over query terms)
  const candidateSet = new Set<string>();
  const topTerms = Array.from(queryVector.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20) // only top-20 weighted terms to bound Redis calls
    .map(([t]) => t);

  const candidateLists = await Promise.all(
    topTerms.map((t) => getTermPostIds(meta.subreddit, t, 100))
  );

  for (const list of candidateLists) {
    for (const id of list) {
      if (id !== meta.id) candidateSet.add(id);
    }
  }

  console.log(`ThreadStitch findSimilar: post=${meta.id} candidates=${candidateSet.size} topTerms=${topTerms.slice(0, 5).join(',')}`);

  if (candidateSet.size === 0) return [];

  // Fetch vectors for all candidates in parallel (cap at 100 for latency)
  const candidateIds = Array.from(candidateSet).slice(0, 100);
  const vectors = await Promise.all(candidateIds.map((id) => getPostVector(id)));

  // Score each candidate — threshold 0.01 to catch even weak overlap
  const scored: Array<{ postId: string; similarity: number }> = [];
  for (let i = 0; i < candidateIds.length; i++) {
    const vec = vectors[i];
    const id = candidateIds[i];
    if (!vec || !id || vec.size === 0) {
      console.log(`ThreadStitch findSimilar: skip candidate ${id} — empty vector`);
      continue;
    }
    const sim = cosineSimilarity(queryVector, vec);
    if (sim > 0.01) scored.push({ postId: id, similarity: sim });
  }

  console.log(`ThreadStitch findSimilar: ${scored.length} scored above threshold (best=${scored[0]?.similarity.toFixed(3) ?? 'n/a'})`);
  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, k * 3);
};
