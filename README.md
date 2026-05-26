# ThreadStitch

A Reddit Devvit bot that adds Wikipedia-style **"Related Discussions"** panels to every post. When someone submits a post, ThreadStitch instantly surfaces 3–5 semantically similar past posts from the same subreddit — helping users discover existing content and naturally reducing duplicate posts without heavy-handed moderation.

## How It Works

1. **New post submitted** → `onPostSubmit` trigger fires
2. **TF-IDF vectorization** — title + body tokenized, stemmed, weighted against the subreddit's IDF model
3. **Inverted index lookup** — candidate posts sharing terms are retrieved from Redis in O(k·log n)
4. **Cosine similarity** — full vector comparison against top-100 candidates
5. **Multi-signal ranking** — TF-IDF similarity (45%), click-through patterns (25%), recency (20%), engagement (10%)
6. **Cached** in Redis for 24h — zero-latency UI on subsequent views

## Features

- **Day 1 ready** — works immediately on install; falls back to hot posts on brand-new subreddits
- **Self-improving** — click tracking builds collaborative-filtering data over time
- **Fast** — inverted index + capped candidate list keeps similarity search under 500ms
- **Sparse vectors** — only non-zero TF-IDF weights stored; handles 100k+ post subreddits efficiently
- **Zero config** — install and forget; no moderator setup required

## Architecture

```
src/
├── server/
│   ├── services/
│   │   ├── similarity.ts   # TF-IDF vectorization + cosine similarity
│   │   ├── storage.ts      # Redis key abstraction layer
│   │   └── ranking.ts      # Multi-signal ranking
│   └── routes/
│       ├── triggers.ts     # onPostSubmit handler (main bot logic)
│       └── api.ts          # /api/related, /api/click endpoints
├── client/
│   ├── splash.tsx          # Inline feed view (compact panel)
│   ├── game.tsx            # Expanded view (full related discussions)
│   └── hooks/useRelated.ts # Data fetching hook
└── shared/
    └── api.ts              # Shared TypeScript types
```

## Redis Key Layout

| Key | Type | Purpose |
|-----|------|---------|
| `meta:{postId}` | string (JSON) | Post metadata (title, URL, score, etc.) |
| `vec:{postId}` | hash | Sparse TF-IDF vector — field=term, value=weight |
| `idx:{sub}:{term}` | sorted set | Inverted index — members=postId, score=TF-IDF weight |
| `df:{sub}:{term}` | string | Document frequency count for IDF calculation |
| `count:{sub}` | string | Total indexed post count per subreddit |
| `posts:{sub}` | sorted set | Post chronological index — score=createdAt timestamp |
| `related:{postId}` | string (JSON) | Cached ranked results (TTL: 24h) |
| `clicks:{postId}` | hash | Click-through counts — field=toPostId, value=count |

## Commands

```bash
npm run dev          # Devvit playtest (live Reddit dev environment)
npm run build        # Vite build
npm run type-check   # TypeScript type check
npm run lint         # ESLint
npm run deploy       # Upload to Reddit
npm run launch       # Publish for review
```

## Tech Stack

- **Platform**: Devvit 0.12 (Reddit's developer platform)
- **Backend**: Node.js 22, Hono
- **Frontend**: React 19, Tailwind CSS 4, Vite
- **Storage**: Devvit Redis (sorted sets, hashes, strings)
- **NLP**: Custom TF-IDF + Porter stemmer (pure TypeScript, zero external NLP deps)

## Submission

Built for Reddit's **Mod Tools Hackathon** (deadline: May 27, 2026). ThreadStitch helps moderators by surfacing duplicate content organically — users find their answer in the related panel and self-delete, reducing mod queue volume.
