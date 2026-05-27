import './index.css';

import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { context, navigateTo } from '@devvit/web/client';
import type { DashboardData, MegathreadResponse, TopicCluster, TrendingTopic } from '../shared/api.js';

// ---- helpers ----

const timeAgo = (ts: number): string => {
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / 2592000)}mo ago`;
};

// Make a stemmed/abbreviated term readable: "rtx" → "RTX", "ddr5" → "DDR5",
// short uppercase-ish tokens stay uppercase, normal words are title-cased.
const displayTerm = (term: string): string => {
  if (term.length <= 4 || /\d/.test(term)) return term.toUpperCase();
  return term.charAt(0).toUpperCase() + term.slice(1);
};

const multiplierColor = (m: number) => {
  if (m >= 3) return 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300';
  if (m >= 2) return 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300';
  return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300';
};

// ---- stat pill ----

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="flex flex-col items-center px-4 py-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm min-w-0">
    <span className="text-lg font-bold text-gray-900 dark:text-white">{value}</span>
    <span className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">{label}</span>
  </div>
);

// ---- topic card ----

type TopicCardProps = {
  topic: TopicCluster;
  rank: number;
  isOpen: boolean;
  onToggle: () => void;
  onCreateMegathread: (topic: TopicCluster) => void;
  isCreating: boolean;
  megathreadUrl?: string;
};

const heatColor = (rank: number): string => {
  if (rank === 0) return 'bg-red-500';
  if (rank === 1) return 'bg-orange-500';
  if (rank === 2) return 'bg-amber-500';
  if (rank <= 4) return 'bg-yellow-500';
  return 'bg-gray-400';
};

const TopicCard = ({ topic, rank, isOpen, onToggle, onCreateMegathread, isCreating, megathreadUrl }: TopicCardProps) => (
  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
    >
      {/* heat indicator */}
      <div className={`w-2 h-8 rounded-full flex-shrink-0 ${heatColor(rank)}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-900 dark:text-white text-sm">
            {displayTerm(topic.term)}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {topic.postCount} post{topic.postCount !== 1 ? 's' : ''}
          </span>
        </div>
        {/* mini preview of first post title */}
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
          {topic.posts[0]?.title ?? ''}
        </p>
      </div>

      {/* chevron */}
      <svg
        className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    {isOpen && (
      <div className="border-t border-gray-100 dark:border-gray-700">
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {topic.posts.map((p) => (
            <button
              key={p.id}
              onClick={() => navigateTo(p.url)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
            >
              <p className="text-sm text-gray-800 dark:text-gray-200 group-hover:text-[#d93900] dark:group-hover:text-orange-400 leading-snug line-clamp-2">
                {p.title}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{timeAgo(p.createdAt)}</p>
            </button>
          ))}
        </div>
        {/* Megathread action */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-t border-gray-100 dark:border-gray-700">
          {megathreadUrl ? (
            <button
              onClick={() => navigateTo(megathreadUrl)}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-semibold"
            >
              ✅ Megathread created — view it
            </button>
          ) : (
            <button
              onClick={() => onCreateMegathread(topic)}
              disabled={isCreating}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#d93900] hover:bg-[#c23200] disabled:opacity-60 text-white text-xs font-semibold transition-colors"
            >
              {isCreating ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating…
                </>
              ) : (
                <>📌 Create Megathread</>
              )}
            </button>
          )}
        </div>
      </div>
    )}
  </div>
);

// ---- trending chip ----

const TrendingChip = ({ topic, onClick }: { topic: TrendingTopic; onClick?: () => void }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${multiplierColor(topic.growthMultiplier)}`}
  >
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
    <span>{displayTerm(topic.term)}</span>
    <span className="opacity-70">{topic.growthMultiplier}×</span>
  </button>
);

// ---- empty / loading states ----

const Skeleton = () => (
  <div className="space-y-3 animate-pulse">
    {[1, 2, 3].map((i) => (
      <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded-xl" />
    ))}
  </div>
);

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
    <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
      <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    </div>
    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">No data yet</p>
    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
      Analytics appear once posts have been submitted and indexed by ThreadStitch.
    </p>
  </div>
);

// ---- section header ----

const SectionHeader = ({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) => (
  <div className="mb-3">
    <div className="flex items-center gap-2">
      <span className="text-base">{icon}</span>
      <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
    </div>
    {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 ml-6">{subtitle}</p>}
  </div>
);

// ---- main dashboard ----

const Dashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'topics' | 'trending' | 'recent'>('topics');
  const [creatingMegathread, setCreatingMegathread] = useState<string | null>(null);
  const [megathreadUrls, setMegathreadUrls] = useState<Record<string, string>>({});

  const handleCreateMegathread = async (topic: TopicCluster) => {
    if (creatingMegathread) return;
    setCreatingMegathread(topic.term);
    try {
      const subreddit = context.subredditName;
      const res = await fetch('/api/megathread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: topic.term, posts: topic.posts, subreddit }),
      });
      const json = await res.json() as MegathreadResponse;
      if (json.status === 'ok') {
        setMegathreadUrls((prev) => ({ ...prev, [topic.term]: json.url }));
        navigateTo(json.url);
      }
    } catch (e) {
      console.error('Failed to create megathread:', e);
    } finally {
      setCreatingMegathread(null);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const subreddit = context.subredditName;
        const url = subreddit
          ? `/api/dashboard?subreddit=${encodeURIComponent(subreddit)}`
          : '/api/dashboard';
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as DashboardData;
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const tabs = [
    { id: 'topics' as const, label: '🔥 Topics' },
    { id: 'trending' as const, label: '📈 Trending' },
    { id: 'recent' as const, label: '🕐 Recent' },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#d93900] flex items-center justify-center flex-shrink-0 shadow">
              <span className="text-white text-base">📊</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
                Community Analytics
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {context.subredditName ? `r/${context.subredditName} · ` : ''}
                {loading ? 'Loading…' : data ? `updated ${timeAgo(data.computedAt)}` : 'Moderator view'}
              </p>
            </div>
          </div>

          {/* stats row */}
          {data && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              <Stat label="total posts" value={data.totalPosts} />
              <Stat label="this week" value={data.postsThisWeek} />
              <Stat label="topic clusters" value={data.topTopics.length} />
              <Stat label="trending" value={data.trending.length} />
            </div>
          )}
        </div>

        {/* tab bar */}
        <div className="flex border-t border-gray-100 dark:border-gray-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'text-[#d93900] border-b-2 border-[#d93900]'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && <Skeleton />}

        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
            ⚠️ {error}
          </div>
        )}

        {!loading && !error && !data && <EmptyState />}

        {data && activeTab === 'topics' && (
          <div>
            <SectionHeader
              icon="🔥"
              title="Frequently Discussed Topics"
              subtitle="Terms appearing in the most posts — these are your community's common questions"
            />
            {data.topTopics.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-2">
                {data.topTopics.map((topic, i) => (
                  <TopicCard
                    key={topic.term}
                    topic={topic}
                    rank={i}
                    isOpen={openTopic === topic.term}
                    onToggle={() => setOpenTopic(openTopic === topic.term ? null : topic.term)}
                    onCreateMegathread={handleCreateMegathread}
                    isCreating={creatingMegathread === topic.term}
                    megathreadUrl={megathreadUrls[topic.term]}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {data && activeTab === 'trending' && (
          <div>
            <SectionHeader
              icon="📈"
              title="Growing Topics This Week"
              subtitle="Topics getting more posts than usual — emerging discussions to watch"
            />
            {data.trending.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {data.postsThisWeek < 2
                    ? 'Not enough recent posts to detect trends yet.'
                    : 'No topics are growing significantly faster than baseline this week.'}
                </p>
              </div>
            ) : (
              <>
                {/* chip cloud — clicking scrolls to the detail row */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {data.trending.map((t) => (
                    <TrendingChip
                      key={t.term}
                      topic={t}
                      onClick={() => document.getElementById(`trending-${t.term}`)?.scrollIntoView({ behavior: 'smooth' })}
                    />
                  ))}
                </div>

                {/* detail list */}
                <div className="space-y-2">
                  {data.trending.map((t) => (
                    <div
                      key={t.term}
                      id={`trending-${t.term}`}
                      className="flex items-center justify-between rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 shadow-sm"
                    >
                      <div>
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">
                          {displayTerm(t.term)}
                        </span>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {t.recentCount} of {t.allTimeCount} posts are from this week
                        </p>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${multiplierColor(t.growthMultiplier)}`}>
                        {t.growthMultiplier}×
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {data && activeTab === 'recent' && (
          <div>
            <SectionHeader
              icon="🕐"
              title="Recent Activity"
              subtitle="Latest posts indexed by ThreadStitch"
            />
            {data.recentPosts.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-2">
                {data.recentPosts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigateTo(p.url)}
                    className="w-full text-left rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 hover:border-[#d93900] dark:hover:border-orange-500 transition-colors group shadow-sm"
                  >
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 group-hover:text-[#d93900] dark:group-hover:text-orange-400 line-clamp-2 leading-snug">
                      {p.title}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{timeAgo(p.createdAt)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-2.5 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <p className="text-[10px] text-center text-gray-400 dark:text-gray-600">
          ThreadStitch Analytics · TF-IDF content analysis · Cached 30 min
        </p>
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Dashboard />
  </StrictMode>
);
