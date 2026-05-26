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
 *   node tools/seed.mjs threadstich_dev
 *
 * The subreddit defaults to whatever is in devvit.json "dev.subreddit".
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
// 18 posts across 6 topic clusters — shows off similarity matching within each cluster

const SEED_POSTS = [
  // --- Cluster 1: GPU / black screen issues ---
  {
    title: 'RTX 4090 black screen after 30 minutes of gaming — is this a PSU issue?',
    text: 'Just built my new PC with an RTX 4090 and a Corsair HX1000 PSU. After about 30 minutes of gaming (Cyberpunk, Control) my monitors go black and the GPU fans spin up to 100%. PC is still running but I have to hard reset. Temps look fine in HWInfo (GPU hitting 78°C max). Is 1000W not enough for the 4090?',
  },
  {
    title: 'GPU causing black screen — RTX 4080 Super, already RMA\'d once',
    text: 'This is driving me insane. My RTX 4080 Super keeps causing black screens during heavy GPU loads. I\'ve already RMA\'d the card once and the replacement does the same thing. Tried reseating the PCIe power connectors, updating drivers, even swapping to a different PCIe slot. Still happens. B650E board, 850W Seasonic Prime.',
  },
  {
    title: 'Black screen crash only in GPU-intensive games — temps and voltages look normal',
    text: 'My system crashes to a black screen (monitor loses signal) but ONLY during GPU-heavy games. CPU games run fine. GPU temps max at 81°C which seems okay. I\'ve tried DDU + clean driver install, undervolting the GPU, and disabling resizable BAR. Nothing fixes it. RTX 3080 Ti on a Z690 board.',
  },

  // --- Cluster 2: PSU / power issues ---
  {
    title: 'How much PSU do I actually need for an RTX 4080 + Ryzen 9 7950X build?',
    text: 'Planning a high-end workstation build with a 7950X and RTX 4080. Online calculators say 700W but I\'ve heard RTX 40 series has insane power spikes. Should I go with 850W or just get a 1000W PSU to be safe? Planning to run it 10 hours a day for video editing.',
  },
  {
    title: 'PSU calculator says 650W but my system keeps crashing — Ryzen 7 7700X + RX 7900 XT',
    text: 'According to PCPartPicker my system needs ~580W but I\'m running it on a 650W EVGA unit and having stability issues under load. CPU package power is hitting 170W and the GPU can peak at 350W according to HWInfo. Is 650W just cutting it too close? Or could this be a PSU quality issue?',
  },
  {
    title: 'Corsair RM850e vs Seasonic Focus GX-850 for an RX 7900 XTX build?',
    text: 'Getting conflicting advice on which PSU to pick. The Corsair RM850e is $30 cheaper but I\'ve seen complaints about coil whine. The Seasonic Focus GX-850 seems more reliable but is at the top of my budget. Building for gaming + some Blender rendering. Both are 80+ Gold. Does tier list placement actually matter for everyday use?',
  },

  // --- Cluster 3: CPU cooling / temps ---
  {
    title: 'Is 95°C safe for Ryzen 9 7900X under full load? CPU is throttling',
    text: 'Just installed a Ryzen 9 7900X with a Noctua NH-D15 and it\'s hitting 95°C during Cinebench R23. AMD says 95°C is the Tjmax but I\'m seeing thermal throttling in the logs. My NH-D15 should be more than adequate. Is this a bad paste application? I used too much and it squeezed out the sides.',
  },
  {
    title: '7700X running hot with AIO — maybe mounting pressure issue?',
    text: 'My Ryzen 7 7700X peaks at 92°C during gaming with a 240mm AIO (Corsair H100i Elite). Idle is 45°C. My friend has the same CPU and hits 75°C max with a NH-D15. Could this be mounting pressure? The backplate feels solid but maybe the cold plate isn\'t making perfect contact?',
  },
  {
    title: 'How hot is too hot for a Ryzen 9 7950X in a workstation build?',
    text: 'Building a video editing workstation with a 7950X. Planning to use a 360mm AIO. I\'ve read the 7950X can hit 95°C in Cinebench with good cooling — is this normal for this chip? Should I be worried about long-term degradation running it at 90-95°C for 8-hour renders?',
  },

  // --- Cluster 4: Monitor / display setup ---
  {
    title: 'Best 4K 144Hz monitor for RTX 4090 gaming under $800?',
    text: 'Finally getting a monitor to match my RTX 4090. Looking for 4K 144Hz, ideally with OLED or at least IPS. I play mostly single-player games (Elden Ring, Baldur\'s Gate 3, Cyberpunk) and do some photo editing. Considering the LG 27GR95QE-B but it\'s 1440p not 4K. Is 4K actually worth it at 27 inches or should I go 32"?',
  },
  {
    title: 'LG OLED vs Samsung Neo G8 for gaming — which is better for fast-paced games?',
    text: 'Deciding between the LG 27GR95QE-B (OLED 1440p 240Hz) and the Samsung Odyssey Neo G8 (4K 240Hz VA). I play a lot of competitive FPS (CS2, Valorant) but also some cinematic single player games. The OLED looks amazing but I\'m worried about burn-in since I sometimes leave the monitor on for hours.',
  },
  {
    title: 'G-Sync vs FreeSync — does it matter with an RTX 4080?',
    text: 'Upgrading to an RTX 4080 and shopping for a new monitor. Most of the monitors I like are FreeSync (AMD), not G-Sync. I know Nvidia supports FreeSync via G-Sync Compatible, but is the experience actually the same? My budget is around $600 and I can\'t find many G-Sync native monitors I like in that range.',
  },

  // --- Cluster 5: RAM / memory issues ---
  {
    title: 'DDR5 6000 CL30 vs DDR5 6400 CL32 — which is actually faster for gaming?',
    text: 'Picking RAM for a new AM5 build (7700X). Everyone says 6000MHz CL30 is the sweet spot for AM5 but I found a 6400 CL32 kit for the same price. Is the extra frequency worth the looser timings? I use the PC for gaming + some light video editing in DaVinci Resolve.',
  },
  {
    title: 'RAM not running at XMP speed — only booting at 4800MHz despite 6000MHz kit',
    text: 'Just built my first PC with a Ryzen 7 7800X3D and G.Skill Flare X5 6000MHz CL30 RAM. In BIOS I enabled EXPO/XMP but the PC won\'t POST. It boots fine at the default 4800MHz JEDEC speed but won\'t run at the rated 6000MHz. I\'ve tried enabling the profile in the BIOS multiple times. Is this a mobo/CPU compatibility issue?',
  },
  {
    title: 'Ryzen 7 7800X3D memory scaling — is there any benefit to going above 6000MHz?',
    text: 'I\'ve seen benchmarks that show the 7800X3D basically doesn\'t benefit from faster RAM because of the 3D cache. Is it worth spending extra on 6400 or 6600MHz RAM for this CPU? Or should I just get reliable 6000 CL30 and call it a day? Budget build for 1440p gaming.',
  },

  // --- Cluster 6: First-time builder questions ---
  {
    title: 'First build ever — is this $1500 gaming PC part list okay?',
    text: 'This is my very first PC build. Putting together a $1500 gaming PC for 1440p. List: Ryzen 7 7700, RX 7900 GRE, MSI B650 Tomahawk, 32GB DDR5 6000, 1TB Samsung 980 Pro, Corsair RM750e, Fractal Design Meshify C. Anything I should change? I\'m nervous about first build — any common mistakes to avoid?',
  },
  {
    title: 'Cable management tips for first-time builder in a mid-tower case',
    text: 'Just finished my first build but the cable management looks like a bird\'s nest. The case is an NZXT H510 Flow which doesn\'t have a ton of space behind the motherboard tray. Any tips for routing 24-pin ATX and CPU power cables? Should I have bought a fully modular PSU instead of semi-modular?',
  },
  {
    title: 'Forgot to remove plastic film from CPU cooler — did I damage anything?',
    text: 'Oh no. Just finished my build, posted temps, and someone in the comments pointed out the Noctua NH-U12A ships with a protective plastic film on the base. I ran the PC for about an hour running benchmarks with the plastic still on. Temps were hitting 85-90°C on a Core i5-14600K. Did I cause permanent damage? Should I re-apply thermal paste?',
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
      const url = await submitPost(token, subreddit, post.title, post.text, delay);
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
   • If similar posts are found, a sticky bot comment is posted on the
     original post listing the related discussions with similarity badges

   ⚠️  NOTE: The first few posts land in an empty index so no comment
   is posted for them. Posts become commentable once there are enough
   neighbours in the same topic cluster (~post 3–5 per cluster).

   To give every post a rich comment, run the seed a SECOND time:
     npm run seed

   The second batch finds all 18 existing posts and every new post
   gets a related-discussions comment immediately on submission.
`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
