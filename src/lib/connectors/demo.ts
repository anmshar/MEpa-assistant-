/**
 * Realistic sample data for a fictional fitness creator, so the product can be
 * tried end to end before any platform app review is approved. The data has
 * deliberate patterns (tutorial reels and evening posts outperform, carousels
 * get saved) so the AI manager has real signals to find.
 */
import type { ActiveHours, Platform, PostFormat, PostTags } from "../db/schema";
import { DAY_MS, type RemoteAudience, type RemotePost, type RemoteProfile } from "./types";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];

const TOPICS = ["home workouts", "meal prep", "mobility", "motivation", "gym myths"] as const;
const HOOKS = ["question", "bold_claim", "tutorial", "story", "list"] as const;

const CAPTIONS: Record<(typeof TOPICS)[number], string[]> = {
  "home workouts": [
    "20-minute full body workout, no equipment needed 💪",
    "The only 3 moves you need for stronger legs at home",
    "Can you do this core finisher without stopping?",
  ],
  "meal prep": [
    "Meal prep Sunday: 5 high-protein lunches under €4 each",
    "What I eat in a day to fuel 4 training sessions a week",
    "Stop skipping breakfast — try this 5-minute oat bowl instead",
  ],
  mobility: [
    "Sitting all day? Do this 8-minute hip routine",
    "Why your squat feels stuck (it's your ankles)",
    "Morning mobility flow I do before coffee ☕",
  ],
  motivation: [
    "One year ago I couldn't do a single push-up. Here's what changed",
    "You don't need motivation, you need a system",
    "Hard truth: consistency beats intensity",
  ],
  "gym myths": [
    "Myth: lifting weights makes women bulky ❌",
    "Do you really need to stretch before training?",
    "Cardio isn't the best way to lose fat — here's why",
  ],
};

const HOOK_PREFIX: Record<(typeof HOOKS)[number], string> = {
  question: "Did you know? ",
  bold_claim: "Unpopular opinion: ",
  tutorial: "Save this ➜ ",
  story: "Story time: ",
  list: "3 things: ",
};

type DemoAccount = {
  platform: Platform;
  handle: string;
  startFollowers: number;
  endFollowers: number;
  postsPerWeek: number;
  formats: [PostFormat, number][]; // format, probability weight
  baseViews: number;
};

const ACCOUNTS: DemoAccount[] = [
  {
    platform: "instagram",
    handle: "mia.moves.demo",
    startFollowers: 38200,
    endFollowers: 42650,
    postsPerWeek: 4,
    formats: [
      ["reel", 0.6],
      ["carousel", 0.25],
      ["image", 0.15],
    ],
    baseViews: 9000,
  },
  {
    platform: "youtube",
    handle: "@MiaMovesDemo",
    startFollowers: 12050,
    endFollowers: 13180,
    postsPerWeek: 3,
    formats: [
      ["video", 0.35],
      ["short", 0.65],
    ],
    baseViews: 5200,
  },
];

const HISTORY_DAYS = 120;

function weightedFormat(r: () => number, formats: [PostFormat, number][]): PostFormat {
  let x = r();
  for (const [f, w] of formats) {
    if ((x -= w) <= 0) return f;
  }
  return formats[0][0];
}

export function demoProfile(platform: Platform): RemoteProfile {
  const a = ACCOUNTS.find((x) => x.platform === platform)!;
  return { externalId: `demo-${platform}`, handle: a.handle, avatarUrl: null, followers: a.endFollowers };
}

export const DEMO_PLATFORMS: Platform[] = ACCOUNTS.map((a) => a.platform);

export function demoPosts(platform: Platform, now = new Date()): (RemotePost & { tags: PostTags })[] {
  const a = ACCOUNTS.find((x) => x.platform === platform)!;
  const r = rng(platform === "instagram" ? 42 : 7);
  const out: (RemotePost & { tags: PostTags })[] = [];
  const perDay = a.postsPerWeek / 7;

  for (let d = HISTORY_DAYS; d >= 1; d--) {
    if (r() > perDay) continue;
    const format = weightedFormat(r, a.formats);
    const topic = pick(r, TOPICS);
    const hookType = pick(r, HOOKS);
    // Evening slots (local 18-20h) are the creator's best; mornings are decent.
    const localHour = pick(r, [7, 8, 12, 13, 17, 18, 19, 19, 20, 21]);
    const day = new Date(now.getTime() - d * DAY_MS);
    day.setUTCHours(localHour - 2, Math.floor(r() * 60), 0, 0); // ~Europe/Berlin summer time

    let mult = 0.6 + r() * 0.8;
    if (format === "reel" || format === "short") mult *= 1.45;
    if (format === "image") mult *= 0.6;
    if (hookType === "tutorial") mult *= 1.5;
    if (hookType === "question") mult *= 1.2;
    if (hookType === "story") mult *= 0.85;
    if (topic === "mobility") mult *= 1.3;
    if (topic === "motivation") mult *= 0.75;
    if (localHour >= 18 && localHour <= 20) mult *= 1.4;
    if (localHour >= 12 && localHour <= 13) mult *= 0.8;
    // Growth trend: the last few weeks perform better than the older history.
    mult *= 0.8 + 0.45 * (1 - d / HISTORY_DAYS);
    if (r() < 0.04) mult *= 4; // the occasional viral hit

    const views = Math.round(a.baseViews * mult);
    const reach = platform === "instagram" ? Math.round(views * (0.72 + r() * 0.1)) : 0;
    const likeRate = 0.035 + r() * 0.03;
    const saveRate =
      platform === "instagram"
        ? (format === "carousel" ? 0.03 : 0.008) + (topic === "meal prep" ? 0.015 : 0) + (hookType === "tutorial" ? 0.01 : 0)
        : 0;
    const isLong = format === "video";
    const durationSec = isLong ? 480 + Math.floor(r() * 600) : format === "image" || format === "carousel" ? null : 20 + Math.floor(r() * 40);

    const caption = HOOK_PREFIX[hookType] + pick(r, CAPTIONS[topic]);
    const idx = HISTORY_DAYS - d;
    out.push({
      platform,
      externalId: `demo-${platform}-${idx}`,
      format,
      caption: `${caption}\n\n#fitness #${topic.replace(/ /g, "")} #homeworkout`,
      permalink: null,
      thumbnailUrl: null,
      publishedAt: day,
      durationSec,
      views,
      reach,
      likes: Math.round(views * likeRate),
      comments: Math.round(views * (0.002 + r() * 0.004) * (hookType === "question" ? 2.2 : 1)),
      shares: Math.round(views * (0.003 + r() * 0.006)),
      saves: Math.round((reach || views) * saveRate),
      avgWatchSec: durationSec ? Math.round(durationSec * (isLong ? 0.38 + r() * 0.15 : 0.55 + r() * 0.3)) : null,
      tags: { topic, hookType, hasCta: r() < 0.5 },
    });
  }
  return out;
}

export function demoSnapshots(platform: Platform, now = new Date()): { day: string; followers: number }[] {
  const a = ACCOUNTS.find((x) => x.platform === platform)!;
  const r = rng(99);
  const out: { day: string; followers: number }[] = [];
  for (let d = HISTORY_DAYS; d >= 0; d--) {
    const t = 1 - d / HISTORY_DAYS;
    // Slightly accelerating growth with daily noise.
    const f = a.startFollowers + (a.endFollowers - a.startFollowers) * (0.6 * t + 0.4 * t * t);
    out.push({
      day: new Date(now.getTime() - d * DAY_MS).toISOString().slice(0, 10),
      followers: Math.round(f + (d === 0 ? 0 : (r() - 0.5) * 40)),
    });
  }
  return out;
}

export function demoAudience(platform: Platform): RemoteAudience {
  const activeHours: ActiveHours = Array.from({ length: 7 }, (_, wd) =>
    Array.from({ length: 24 }, (_, h) => {
      const weekend = wd === 0 || wd === 6;
      const morning = Math.exp(-((h - (weekend ? 10 : 7)) ** 2) / 4) * 0.6;
      const evening = Math.exp(-((h - (weekend ? 18 : 19)) ** 2) / 5);
      const night = h < 6 ? 0.02 : 0.1;
      return Math.round(Math.min(1, morning + evening + night) * 100) / 100;
    }),
  );
  return {
    demographics: {
      age: { "13-17": 0.04, "18-24": 0.31, "25-34": 0.4, "35-44": 0.17, "45+": 0.08 },
      gender: platform === "instagram" ? { female: 0.71, male: 0.27, other: 0.02 } : { female: 0.58, male: 0.41, other: 0.01 },
      country: { DE: 0.46, AT: 0.12, CH: 0.09, US: 0.08, NL: 0.05, other: 0.2 },
    },
    activeHours: platform === "instagram" ? activeHours : null,
  };
}
