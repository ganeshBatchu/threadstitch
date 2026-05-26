# 🧵 ThreadStitch

> **Automatically surface related discussions and flag recurring questions — so moderators spend less time on duplicates and users always find the answer that already exists.**

ThreadStitch installs as a zero-config Devvit bot. Every time a post is submitted, it posts a pinned sticky comment listing the most similar past discussions, ranked by TF-IDF cosine similarity, recency, and engagement. When a topic keeps recurring, it flags it automatically — giving mods an early warning before a FAQ becomes a flood.

---

## What it looks like in practice

When someone asks about GPU black screens for the sixth time:

```
🔁 ThreadStitch — Recurring Topic

This topic has come up **6 times** in this subreddit. Here are the most
relevant past discussions:

**1. [GPU causing black screen — RTX 4080 Super, already RMA'd once](…)**
🟢 Very similar · ↑ 47 · 💬 23 comments
> This is driving me insane. My RTX 4080 Super keeps causing black screens
> during heavy GPU loads...

**2. [Black screen crash only in GPU-intensive games — temps look normal](…)**
🟡 Similar · ↑ 31 · 💬 18 comments

**3. [RTX 4090 black screen after 30 minutes — is this a PSU issue?](…)**
🟠 Related · ↑ 12 · 💬 9 comments

---
^(Powered by ThreadStitch · TF-IDF content similarity)
```

On a brand-new topic with fewer than 3 matches:

```
🧵 ThreadStitch — Related Discussions

These posts cover similar topics:

**1. [Best 4K 144Hz monitor for RTX 4090 gaming under $800?](…)**
🟡 Similar · ↑ 28 · 💬 14 comments

**2. [G-Sync vs FreeSync — does it matter with an RTX 4080?](…)**
🟠 Related · ↑ 19 · 💬 7 comments

💡 Suggested flair: GPU
```

---

## Features

### Core bot
- **Sticky comment on every post** — fired by `onPostSubmit`, posted as a distinguished mod comment pinned at the top of every thread
- **FAQ detection** — when 3+ similar posts exist, the heading shifts to "🔁 Recurring Topic" with a count, giving mods instant signal before the queue fills up
- **Auto-flair suggestion** — the comment includes a `💡 Suggested flair` line based on the highest-weighted TF-IDF term, so mods can apply the right flair in one click
- **Live index cleanup** — `onPostDelete` removes deleted posts from every inverted-index bucket so bot comments never link to dead content

### Similarity engine (pure TypeScript, zero NLP deps)
- **TF-IDF vectorization** with a Porter-like stemmer and subreddit-specific IDF estimates updated incrementally on each new post
- **Inverted index** in Redis sorted sets — candidate retrieval in O(k · log n) regardless of subreddit size
- **Cosine similarity** over sparse vectors
- **Multi-signal ranking**: TF-IDF similarity (45%), click-through feedback (25%), recency (20%), engagement (10%)

### Mod dashboard
A pinnable custom post (mod menu → **"Open Mod Dashboard"**) with three tabs:

| Tab | What it shows |
|-----|---------------|
| 🔥 **Topics** | Top 10 term clusters ranked by post count, expandable to representative posts |
| 📈 **Trending** | Terms whose recent post rate exceeds the baseline by ≥ 1.3× — early warning for emerging discussions |
| 🕐 **Recent** | Last 10 indexed posts |

### Scheduled weekly digest
Every Monday morning, ThreadStitch auto-posts a community report summarising the week's top topics, trending terms, and post volume — mods get ongoing insights with zero effort.

---

## How it works

```
New post submitted
       │
       ▼
onPostSubmit trigger
       │
       ├─ tokenize(title + body) → TF-IDF vector
       ├─ inverted index lookup  → candidate post IDs
       ├─ cosine similarity      → scored candidates
       ├─ multi-signal ranking   → ordered RelatedPost[]
       │
       ├─ faqCount = # deduplicated matches
       │    ≥ 3 → "🔁 Recurring Topic" + count
       │    < 3 → "🧵 Related Discussions"
       │
       ├─ suggestedFlair = top-weighted TF-IDF term
       │
       └─ reddit.submitComment() → distinguished + stickied

Post deleted
       │
       ▼
onPostDelete trigger
       └─ removes meta, vec, related, clicks, and all inverted-index entries
```

## Architecture

```
src/
├── server/
│   ├── services/
│   │   ├── similarity.ts   # TF-IDF, stemmer, cosine similarity, index
│   │   ├── storage.ts      # Redis key abstraction + flushAllData()
│   │   ├── ranking.ts      # Multi-signal ranking
│   │   └── analytics.ts    # Dashboard topic clusters + trending signal
│   └── routes/
│       ├── triggers.ts     # onPostSubmit + onPostDelete handlers
│       ├── api.ts          # /api/related, /api/dashboard, /api/click
│       └── menu.ts         # Mod menu actions
├── client/
│   ├── splash.tsx          # Inline feed widget (compact)
│   ├── game.tsx            # Expanded related-discussions view
│   └── dashboard.tsx       # Mod analytics dashboard
└── shared/
    └── api.ts              # Shared TypeScript types
```

## Redis key layout

| Key | Type | TTL | Purpose |
|-----|------|-----|---------|
| `meta:{id}` | string JSON | 90 d | Post metadata (title, URL, score, preview) |
| `vec:{id}` | hash | 90 d | Sparse TF-IDF vector — field=term, value=weight |
| `idx:{sub}:{term}` | sorted set | — | Inverted index — member=postId, score=weight |
| `df:{sub}:{term}` | string | — | Document frequency for smooth IDF |
| `count:{sub}` | string | — | Total indexed post count |
| `posts:{sub}` | sorted set | — | Chronological post index — score=createdAt |
| `related:{id}` | string JSON | 24 h | Cached ranked results |
| `dashboard:{sub}` | string JSON | 30 m | Cached dashboard analytics |
| `clicks:{id}` | hash | — | Click-through counts for collaborative filtering |

## Commands

```bash
npm run dev               # devvit playtest (live Reddit dev environment)
npm run build             # Vite production build
npm run seed              # Post 18 test posts across 6 topic clusters
npm run seed -- --reset   # Delete all posts, prompt to flush Redis index
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| Platform | Devvit 0.12 (Reddit's developer platform) |
| Backend | Node.js 22, Hono |
| Frontend | React 19, Tailwind CSS 4, Vite |
| Storage | Devvit Redis (sorted sets, hashes, strings) |
| NLP | Custom TF-IDF + Porter stemmer — pure TypeScript, zero external deps |

---

*Built for Reddit's **Mod Tools Hackathon** (deadline May 27, 2026).*
