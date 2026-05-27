#!/usr/bin/env node
/**
 * ThreadStitch seed script
 *
 * Creates real Reddit posts in your dev subreddit so ThreadStitch has
 * data to work with. Posts trigger the onPostSubmit trigger naturally,
 * which indexes them via the real Devvit context.
 *
 * Usage:
 *   node tools/seed.mjs [subreddit]
 *   node tools/seed.mjs threadstitch_dev
 *
 * The subreddit defaults to whatever is in devvit.json "dev.subreddit".
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * DEMO VIDEO GUIDE — submit these two posts MANUALLY on camera after seeding
 * (run `npm run seed` first to populate the 17 background posts)
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * ── SCENE 2 ─ Submit this post live → bot shows "Related Discussions" ─────────
 *
 *   TITLE:  GPU black screen — monitor loses signal while gaming, need help
 *   TEXT:   Having a GPU issue: during gaming my monitor goes completely black and
 *           loses the display signal. GPU fans ramp to 100% right before the crash
 *           and I have to hard reset. Temps are ~72°C so overheating is not the
 *           problem. Already reinstalled GPU drivers with DDU. RTX 4070 Ti,
 *           750W Corsair RM, Z790 board. PSU issue or faulty GPU?
 *
 *   WHAT HAPPENS: The 2 seeded GPU posts are already indexed → faqCount = 2,
 *   which is below the default faqThreshold of 3 → bot comment says
 *   "## 🧵 ThreadStitch — Related Discussions" with 2 matches + flair suggestion.
 *
 * ── SCENE 3 ─ Submit this post live → "🔁 Recurring Topic" + mod mail fires ───
 *
 *   TITLE:  Monitor signal lost during gaming — GPU black screen crash, any fixes?
 *   TEXT:   Getting a recurring GPU issue: monitor loses signal and goes black
 *           during gaming. GPU fans spike right before the display dies and I need
 *           to force restart. Tried DDU driver reinstall, undervolting the GPU,
 *           and swapping the HDMI cable. Still crashing. RTX 4080, B650E board,
 *           850W PSU. Anyone solved this GPU black screen signal loss issue?
 *
 *   WHAT HAPPENS: The index now has 3 GPU posts (2 seeded + Scene 2) → faqCount = 3,
 *   which equals faqThreshold (3) → bot comment says
 *   "## 🔁 ThreadStitch — Recurring Topic" AND a mod mail alert fires.
 *
 * !! IMPORTANT: Do NOT run `npm run seed` again between Scene 2 and Scene 3.
 *    Scene 2's post must remain indexed so faqCount reaches 3 for Scene 3.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- read token ----

function getRedditToken() {
  const tokenPath = resolve(homedir(), '.devvit', 'token');
  try {
    const raw = readFileSync(tokenPath, 'utf8');
    const { token } = JSON.parse(raw);
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    if (decoded.expiresAt < Date.now()) {
      console.error('⚠️  Devvit token is expired. Run `devvit login` to refresh it.');
      process.exit(1);
    }
    return decoded.accessToken;
  } catch {
    console.error('❌  Could not read ~/.devvit/token. Make sure you are logged in: devvit login');
    process.exit(1);
  }
}

// ---- read subreddit from devvit.json ----

function getDefaultSubreddit() {
  try {
    const config = JSON.parse(readFileSync(resolve(__dirname, '..', 'devvit.json'), 'utf8'));
    return config?.dev?.subreddit ?? null;
  } catch {
    return null;
  }
}

// ---- seed data ----
//
// 17 posts across 6 topic clusters, carefully tuned for the demo:
//
// • Cluster 1 (GPU/black screen) has exactly 2 posts by design — see DEMO GUIDE above.
// • Clusters 2–6 each have 3 posts, giving the mod dashboard a rich Topics tab.
// • Key TF-IDF terms are consistent within each cluster so similarity scores are
//   comfortably above the 40 % default minimum threshold.
//
const SEED_POSTS = [
  // ─── Cluster 1: GPU / black screen (EXACTLY 2 — critical for demo) ─────────
  {
    title: 'RTX 4090 black screen — GPU causes monitor signal loss during gaming',
    text: 'My RTX 4090 is giving me black screen crashes where the monitor completely loses the display signal during gaming. GPU fans spin to 100 percent right before the crash. I have done a DDU driver reinstall, reseated the GPU PCIe power connectors, and tried undervolting the GPU. Still getting black screen crashes during heavy gaming. Corsair HX1000 PSU, Z790 board. GPU temps are 76 degrees — not overheating. Faulty GPU or a power delivery problem?',
  },
  {
    title: 'GPU black screen crash — monitor loses signal during gaming, already tried drivers',
    text: 'My GPU is causing black screen crashes during gaming where the monitor loses the display signal completely. Did a clean DDU driver reinstall and the crashes still happen. Swapped HDMI cables, reseated the GPU, tried a different PCIe slot. When the GPU hits heavy load the fans spike to 100 percent then black screen. RTX 4080 Super, Seasonic 850W PSU, B650E board. Could this be a failing GPU or an underpowered PSU?',
  },

  // ─── Cluster 2: PSU / power selection (3 posts) ─────────────────────────────
  {
    title: 'How many watts PSU do I need for RTX 4080 + Ryzen 9 7950X workstation?',
    text: 'Planning a high-end workstation with a Ryzen 9 7950X and RTX 4080. PCPartPicker says 680W but RTX 40 series cards have massive power spikes well above rated TDP. Should I get an 850W or 1000W PSU for safe headroom? Planning to run it 10 hours daily for video rendering and 3D work. Corsair and Seasonic both have 1000W Platinum units in my budget.',
  },
  {
    title: 'PSU calculator says 650W is enough but system crashes under load — 7700X + RX 7900 XT',
    text: 'PCPartPicker estimates my system needs around 570W so I bought a 650W EVGA Gold PSU. Under sustained CPU and GPU load I get random crashes and reboots. HWInfo shows CPU package power at 170W and GPU drawing 350W peak — that is 520W for CPU and GPU alone. Is 650W cutting it too close or could this be a PSU quality issue rather than raw wattage?',
  },
  {
    title: 'Corsair RM850e vs Seasonic Focus GX-850 for RX 7900 XTX — which PSU is more reliable?',
    text: 'Choosing between the Corsair RM850e and the Seasonic Focus GX-850 for my RX 7900 XTX gaming build. The Corsair RM850e is $35 cheaper but I have seen reports of coil whine and voltage regulation issues under GPU transient loads. The Seasonic Focus GX-850 consistently ranks higher on PSU tier lists. Both are 80 Plus Gold rated. Does PSU tier list ranking actually matter for day-to-day gaming?',
  },

  // ─── Cluster 3: CPU temps / cooling (3 posts) ───────────────────────────────
  {
    title: 'Ryzen 9 7900X hitting 95°C under full load — is this normal or a mounting problem?',
    text: 'Just installed a Ryzen 9 7900X with a Noctua NH-D15 cooler and it hits 95 degrees under full load in Cinebench R23 with thermal throttling visible in the clock logs. AMD lists 95 degrees as the Tjmax for this chip. Applied Arctic MX-6 thermal paste. Is 95 degrees acceptable for long-term workstation use or should I re-seat the cooler with fresh paste and check mounting pressure?',
  },
  {
    title: 'Ryzen 7 7700X running hot with 240mm AIO — peaks 92°C gaming, suspected mounting issue',
    text: 'My Ryzen 7 7700X peaks at 92 degrees while gaming with a Corsair H100i Elite 240mm AIO cooler. Idle temps are 48 degrees which also seems elevated. My friend uses the same 7700X with a Noctua NH-D15 air cooler and only hits 74 degrees max. I suspect the AIO cold plate is not making full contact with the CPU IHS. How do I diagnose a mounting pressure or thermal paste coverage problem?',
  },
  {
    title: 'Ryzen 9 7950X throttling at 90°C during long renders — 360mm AIO not keeping up',
    text: 'My workstation with a Ryzen 9 7950X and a 360mm AIO cooler hits 90 degrees during extended DaVinci Resolve exports and thermal throttling reduces clock speeds noticeably. At 90 degrees the chip is within AMD spec but the throttling hurts render throughput significantly. Is this a thermal paste coverage issue, a chassis airflow problem, or is the 7950X simply generating more heat than a 360mm AIO can handle in a sustained workload?',
  },

  // ─── Cluster 4: Gaming monitor / display setup (3 posts) ────────────────────
  {
    title: 'Best 4K 144Hz gaming monitor for RTX 4090 under $800 — IPS or OLED?',
    text: 'I finally have an RTX 4090 and need a display that can keep up with it. Looking for 4K 144Hz or higher, ideally OLED or a high-quality IPS panel. I play single-player titles like Elden Ring, Cyberpunk 2077, and Baldur\'s Gate 3 and do photo editing on the side. Considering the LG 32GR93U IPS 144Hz but wondering if OLED is worth the burn-in risk for 4K gaming at this resolution.',
  },
  {
    title: 'LG OLED 240Hz vs Samsung Neo G8 4K — which display for mixed FPS and single player?',
    text: 'Deciding between the LG 27GR95QE-B OLED 1440p 240Hz display and the Samsung Odyssey Neo G8 4K 240Hz VA panel. I play competitive FPS like CS2 and Valorant but also cinematic single-player games. The OLED display has incredible contrast and pixel response but the Neo G8 has native 4K resolution. Which display suits a mixed gaming use case and is OLED burn-in a real concern for gaming at normal brightness?',
  },
  {
    title: 'G-Sync vs FreeSync on RTX 4080 — is adaptive sync experience actually different?',
    text: 'Upgrading to an RTX 4080 and shopping for a 1440p 165Hz gaming display. Most panels in my $600 budget are FreeSync certified, not G-Sync. I know Nvidia supports G-Sync Compatible FreeSync displays but is the adaptive sync experience truly the same as native G-Sync? Has anyone directly compared FreeSync Premium Pro vs G-Sync on Nvidia hardware during actual gaming sessions?',
  },

  // ─── Cluster 5: RAM / DDR5 memory (3 posts) ─────────────────────────────────
  {
    title: 'DDR5 6000 CL30 vs DDR5 6400 CL32 for Ryzen AM5 gaming — which kit is faster?',
    text: 'Picking RAM for a Ryzen 7 7700X AM5 build. Conventional wisdom says DDR5 6000 CL30 is the sweet spot for Ryzen AM5 because it syncs to the memory controller\'s native 1:1 ratio. But I found a DDR5 6400 CL32 kit at the same price point. Is the extra 400MHz bandwidth worth the looser CL32 timings? Primary use is 1440p gaming and some DaVinci Resolve editing.',
  },
  {
    title: 'DDR5 6000 XMP not posting — drops to 4800MHz JEDEC on Ryzen 7 7800X3D build',
    text: 'Built my first PC with a Ryzen 7 7800X3D and G.Skill Flare X5 DDR5 6000 CL30 RAM. Enabled EXPO in BIOS but the system refuses to POST at XMP speed and defaults back to 4800MHz JEDEC. Tried enabling the profile multiple times and clearing CMOS. Is this a motherboard compatibility issue with DDR5 6000 on this platform? Should I flash a newer BIOS before attempting XMP memory training?',
  },
  {
    title: 'Does Ryzen 7 7800X3D benefit from DDR5 above 6000MHz? Benchmarks say minimal gains',
    text: 'I read that the Ryzen 7 7800X3D\'s large 3D V-Cache makes it mostly immune to DDR5 bandwidth improvements beyond 6000MHz since the cache absorbs most memory latency. Benchmarks I found show less than 2 percent difference between DDR5 6000 and DDR5 6400 on this CPU. Is it worth spending an extra $40 on a DDR5 6400 kit for the 7800X3D or should I save the money and get reliable DDR5 6000 CL30?',
  },

  // ─── Cluster 6: First-time PC builders (3 posts) ────────────────────────────
  {
    title: 'First time builder — is this $1500 gaming PC part list any good?',
    text: 'This is my very first PC build and I want to catch any rookie mistakes before buying. Target: $1500 for 1440p 144Hz gaming. Parts list: Ryzen 7 7700, RX 7900 GRE, MSI B650 Tomahawk WiFi, 32GB G.Skill DDR5 6000, 1TB Samsung 990 Pro NVMe, Corsair RM750e PSU, Fractal Design Meshify 2 Compact. Any red flags? Should I worry about the PSU wattage with the RX 7900 GRE under full gaming load?',
  },
  {
    title: 'Cable management tips for first time builder in NZXT H510 Flow — 24-pin routing help',
    text: 'Finished my first ever PC build in an NZXT H510 Flow but the cable management looks terrible. The 24-pin ATX power cable is stiff and short making it hard to route behind the motherboard tray. The CPU EPS power cable barely reaches the top of the board even with the cable fully extended. I bought a semi-modular PSU and now wish I had gone fully modular. Any cable management tips for first time builders in a mid-tower case?',
  },
  {
    title: 'Did I damage my CPU running Noctua cooler with plastic base film still on?',
    text: 'Serious mistake — after running Cinebench for an hour and seeing 88 degrees on my Core i5-14600K someone pointed out that Noctua coolers ship with a protective plastic film on the copper base plate. I ran the cooler with that film on for an entire hour of load testing. Did the plastic film cause permanent CPU damage from overheating? Do I need to replace the thermal paste and re-seat the cooler now? Temps look normal after removing the film.',
  },
];

// ---- flush ThreadStitch Redis index via the local playtest server ----
// The Devvit Web server listens on localhost:3000 by default (WEBBIT_PORT env var).
// Run `devvit playtest` before using --reset so the server is up and can clear Redis.

function printFlushReminder(subreddit) {
  console.log(`
   ⚠️  IMPORTANT — clear the Redis index after posts are deleted:
   ──────────────────────────────────────────────────────────────
   Devvit's Redis is only reachable from inside the app. To flush it:

   1. Open r/${subreddit} in Reddit
   2. Click the  ⋯  subreddit menu (top-right, mod tools area)
   3. Select  "Flush ThreadStitch Index"
   4. Wait for the ✅ toast confirming the index was cleared

   Then run:  npm run seed
   to repopulate with fresh posts and a clean index.
`);
}

// ---- delete all posts in a subreddit (for resetting dev data) ----

async function deletePost(token, id) {
  const res = await fetch('https://oauth.reddit.com/api/del', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'ThreadStitch/seed-script (dev)',
    },
    body: new URLSearchParams({ id: `t3_${id}` }).toString(),
  });
  return res.ok;
}

async function deleteAllPosts(token, subreddit) {
  console.log(`\n🗑️   Collecting posts from r/${subreddit}...`);

  // 1. Collect ALL post IDs first (paginate through the whole listing)
  const allIds = [];
  let after = null;
  do {
    const url = `https://oauth.reddit.com/r/${subreddit}/new.json?limit=100${after ? `&after=${after}` : ''}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'ThreadStitch/seed-script (dev)' },
    });
    const data = await res.json();
    const posts = data?.data?.children ?? [];
    after = data?.data?.after ?? null;
    for (const { data: p } of posts) allIds.push(p.id);
  } while (after);

  if (allIds.length === 0) {
    console.log('   Nothing to delete.\n');
    return;
  }

  console.log(`   Found ${allIds.length} posts. Deleting in parallel (20 at a time)...`);

  // 2. Delete in batches of 20 concurrently
  const BATCH = 20;
  let deleted = 0;
  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch = allIds.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((id) => deletePost(token, id)));
    deleted += results.filter(Boolean).length;
    process.stdout.write(`\r   Deleted ${deleted}/${allIds.length}...`);
  }

  console.log(`\n   ✓ Deleted ${deleted} posts.\n`);
}

// ---- submit a single post ----

async function submitPost(token, subreddit, title, text, delay) {
  if (delay > 0) {
    await new Promise((res) => setTimeout(res, delay));
  }

  const params = new URLSearchParams({
    kind: 'self',
    sr: subreddit,
    title,
    text,
    resubmit: 'true',
    nsfw: 'false',
    spoiler: 'false',
  });

  const res = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'ThreadStitch/seed-script (dev)',
    },
    body: params.toString(),
  });

  const json = await res.json();

  if (json.success === false || json.error) {
    const errMsg = json.message ?? json.error ?? JSON.stringify(json).slice(0, 120);
    throw new Error(`Reddit API error: ${errMsg}`);
  }

  // The URL is in json.jquery or json.data depending on response format
  const url =
    json?.data?.url ??
    json?.jquery?.find?.(([, , , v]) => typeof v === 'string' && v.includes('/comments/'))?.[3] ??
    '(url unknown)';

  return url;
}

// ---- main ----

async function main() {
  const args = process.argv.slice(2);
  const resetFlag = args.includes('--reset');
  const subredditArg = args.find((a) => !a.startsWith('--'));
  const subreddit = subredditArg ?? getDefaultSubreddit();

  if (!subreddit) {
    console.error(
      '❌  No subreddit specified. Usage: node tools/seed.mjs [subreddit] [--reset]\n' +
      '   --reset   Delete all existing posts, then prompt you to flush the Redis index\n' +
      '   Or set "dev.subreddit" in devvit.json'
    );
    process.exit(1);
  }

  const token = getRedditToken();

  if (resetFlag) {
    await deleteAllPosts(token, subreddit);
    printFlushReminder(subreddit);
    // Exit after reset — user must flush the index from the mod menu, then re-run seed.
    process.exit(0);
  }

  console.log(`\n🌱  Seeding ${SEED_POSTS.length} posts into r/${subreddit}...\n`);
  console.log('   (Reddit rate-limits submissions — posts will be spaced 2s apart)\n');

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < SEED_POSTS.length; i++) {
    const post = SEED_POSTS[i];
    const delay = i === 0 ? 0 : 2000; // 2s gap between posts to respect Reddit rate limit
    process.stdout.write(`   [${i + 1}/${SEED_POSTS.length}] ${post.title.slice(0, 60)}…`);
    try {
      await submitPost(token, subreddit, post.title, post.text, delay);
      process.stdout.write(` ✓\n`);
      ok++;
    } catch (err) {
      process.stdout.write(` ✗ ${err.message}\n`);
      fail++;
    }
  }

  console.log(`\n✅  Done! ${ok} posts created, ${fail} failed.`);

  if (ok > 0) {
    console.log(`
   What happens next (requires devvit playtest to be running):
   ─────────────────────────────────────────────────────────────
   • Each post triggers onPostSubmit in Devvit
   • ThreadStitch indexes the post and searches for similar ones
   • Similar posts get a sticky bot comment listing related discussions

   ⚠️  NOTE: The first few posts land in an empty index so no comment
   is posted for them. Posts become commentable once there are enough
   neighbours in the same topic cluster (~post 2–3 per cluster).

   ─────────────────────────────────────────────────────────────
   DEMO RECORDING CHECKLIST (read the top of this file for details)
   ─────────────────────────────────────────────────────────────
   1. Seeds are done — the subreddit now has 17 background posts.
   2. Open the subreddit feed for Scene 1 (the hook shot).
   3. Submit the Scene 2 post manually on camera.
      → Expect: "🧵 ThreadStitch — Related Discussions" (2 matches)
   4. Submit the Scene 3 post manually on camera.
      → Expect: "🔁 ThreadStitch — Recurring Topic" (3 matches) + mod mail
   5. For Scene 4, open the Mod Dashboard post to show Topics + Trending tabs.
   6. For Scene 5, navigate to Mod Tools → App Settings to show config options.
`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
