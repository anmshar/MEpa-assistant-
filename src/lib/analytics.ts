/**
 * Pure analytics over normalized posts. Everything the dashboard, reports and
 * the AI manager's tools say about performance is computed here, so numbers are
 * consistent everywhere and the model never has to invent them.
 */
import type { ActiveHours, Platform, Post, PostFormat } from "./db/schema";

export type PostLike = Pick<
  Post,
  | "platform"
  | "format"
  | "publishedAt"
  | "views"
  | "reach"
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "tags"
>;

const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const interactions = (p: PostLike) => p.likes + p.comments + p.shares + p.saves;

/** Interactions per person reached (falls back to views when reach is unavailable). */
export function engagementRate(p: PostLike): number {
  const base = p.reach > 0 ? p.reach : p.views;
  return base > 0 ? interactions(p) / base : 0;
}

export function withinDays<T extends PostLike>(posts: T[], days: number, now = new Date(), offsetDays = 0): T[] {
  const end = now.getTime() - offsetDays * DAY_MS;
  const start = end - days * DAY_MS;
  return posts.filter((p) => {
    const t = p.publishedAt.getTime();
    return t > start && t <= end;
  });
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type Summary = {
  posts: number;
  views: number;
  avgViews: number;
  medianViews: number;
  interactions: number;
  avgEngagementRate: number;
  saves: number;
  shares: number;
};

export function summarize(posts: PostLike[]): Summary {
  const views = posts.map((p) => p.views);
  return {
    posts: posts.length,
    views: views.reduce((a, b) => a + b, 0),
    avgViews: Math.round(mean(views)),
    medianViews: Math.round(median(views)),
    interactions: posts.reduce((a, p) => a + interactions(p), 0),
    avgEngagementRate: mean(posts.map(engagementRate)),
    saves: posts.reduce((a, p) => a + p.saves, 0),
    shares: posts.reduce((a, p) => a + p.shares, 0),
  };
}

const pctChange = (cur: number, prev: number) => (prev === 0 ? null : (cur - prev) / prev);

export function comparePeriods(posts: PostLike[], days: number, now = new Date()) {
  const current = summarize(withinDays(posts, days, now));
  const previous = summarize(withinDays(posts, days, now, days));
  return {
    days,
    current,
    previous,
    change: {
      posts: current.posts - previous.posts,
      views: pctChange(current.views, previous.views),
      avgViews: pctChange(current.avgViews, previous.avgViews),
      /** absolute change in percentage points (0.01 = +1pt) */
      avgEngagementRate: current.avgEngagementRate - previous.avgEngagementRate,
    },
  };
}

export type Dimension = "format" | "platform" | "weekday" | "hour" | "topic" | "hookType";

/** Calendar parts of a timestamp in the creator's time zone. */
export function localParts(date: Date, timeZone: string): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  return { weekday: Math.max(0, WEEKDAYS.indexOf(wd as (typeof WEEKDAYS)[number])), hour };
}

function dimensionKey(p: PostLike, dim: Dimension, timeZone: string): string | null {
  switch (dim) {
    case "format":
      return p.format;
    case "platform":
      return p.platform;
    case "weekday":
      return WEEKDAYS[localParts(p.publishedAt, timeZone).weekday];
    case "hour":
      return `${String(localParts(p.publishedAt, timeZone).hour).padStart(2, "0")}:00`;
    case "topic":
      return p.tags?.topic ?? null;
    case "hookType":
      return p.tags?.hookType ?? null;
  }
}

export type BreakdownRow = {
  key: string;
  posts: number;
  avgViews: number;
  avgEngagementRate: number;
  /** avg views of this group relative to the overall average (1.5 = 50% more) */
  viewsLift: number;
};

export function breakdown(posts: PostLike[], dim: Dimension, timeZone = "UTC"): BreakdownRow[] {
  const overall = mean(posts.map((p) => p.views)) || 1;
  const groups = new Map<string, PostLike[]>();
  for (const p of posts) {
    const k = dimensionKey(p, dim, timeZone);
    if (k == null) continue;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return [...groups.entries()]
    .map(([key, ps]) => {
      const avgViews = mean(ps.map((p) => p.views));
      return {
        key,
        posts: ps.length,
        avgViews: Math.round(avgViews),
        avgEngagementRate: mean(ps.map(engagementRate)),
        viewsLift: avgViews / overall,
      };
    })
    .sort((a, b) => b.avgViews - a.avgViews);
}

export type RankMetric = "views" | "engagement_rate" | "saves" | "shares" | "comments";

export function rankPosts<T extends PostLike>(posts: T[], by: RankMetric, limit: number, order: "top" | "bottom" = "top"): T[] {
  const score = (p: PostLike) =>
    by === "engagement_rate" ? engagementRate(p) : by === "views" ? p.views : p[by];
  const sorted = [...posts].sort((a, b) => score(b) - score(a));
  return (order === "top" ? sorted : sorted.reverse()).slice(0, limit);
}

export type PostingSlot = { weekday: number; hour: number; label: string; score: number };

/**
 * Best posting slots, blending when the audience is online (if the platform
 * provides it) with how the creator's own posts performed by hour of day.
 * Returns at most one slot per weekday so the plan spreads across the week.
 */
export function bestPostingTimes(
  posts: PostLike[],
  activeHours: ActiveHours | null | undefined,
  timeZone = "UTC",
  limit = 5,
): PostingSlot[] {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

  if (activeHours?.length === 7) {
    for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) grid[d][h] += activeHours[d]?.[h] ?? 0;
  }

  if (posts.length >= 10) {
    const byHour = breakdown(posts, "hour", timeZone);
    const maxLift = Math.max(...byHour.map((r) => r.viewsLift), 1);
    for (const row of byHour) {
      if (row.posts < 2) continue;
      const h = Number(row.key.slice(0, 2));
      for (let d = 0; d < 7; d++) grid[d][h] += row.viewsLift / maxLift;
    }
    const byDay = breakdown(posts, "weekday", timeZone);
    const maxDay = Math.max(...byDay.map((r) => r.viewsLift), 1);
    for (const row of byDay) {
      const d = WEEKDAYS.indexOf(row.key as (typeof WEEKDAYS)[number]);
      for (let h = 0; h < 24; h++) grid[d][h] *= 0.75 + (0.25 * row.viewsLift) / maxDay;
    }
  }

  const slots: PostingSlot[] = [];
  for (let d = 0; d < 7; d++) {
    let bestH = -1;
    for (let h = 0; h < 24; h++) if (bestH < 0 || grid[d][h] > grid[d][bestH]) bestH = h;
    if (grid[d][bestH] > 0) {
      slots.push({
        weekday: d,
        hour: bestH,
        label: `${WEEKDAYS[d]} ${String(bestH).padStart(2, "0")}:00`,
        score: grid[d][bestH],
      });
    }
  }
  return slots.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function followerGrowth(snapshots: { day: string; followers: number }[], days: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10);
  const sorted = [...snapshots].sort((a, b) => a.day.localeCompare(b.day));
  const inRange = sorted.filter((s) => s.day >= cutoff);
  if (inRange.length === 0) return { start: null, end: null, change: 0, pct: null as number | null };
  // Use the last snapshot before the window as the baseline when available.
  const before = sorted.filter((s) => s.day < cutoff).at(-1);
  const start = (before ?? inRange[0]).followers;
  const end = inRange.at(-1)!.followers;
  return { start, end, change: end - start, pct: start > 0 ? (end - start) / start : null };
}

/**
 * Rough sponsorship price range per deliverable, from views-based CPM benchmarks
 * adjusted for engagement quality. These are starting points for negotiation,
 * not quotes.
 */
const CPM_USD: Record<Platform, [number, number]> = {
  instagram: [15, 30],
  youtube: [20, 45],
  tiktok: [8, 20],
};
const BENCHMARK_ER: Record<Platform, number> = { instagram: 0.04, youtube: 0.04, tiktok: 0.05 };

export function estimateRate(platform: Platform, avgViews: number, avgEngagementRate: number) {
  const quality = Math.min(1.5, Math.max(0.7, avgEngagementRate / BENCHMARK_ER[platform]));
  const [lo, hi] = CPM_USD[platform];
  const round = (n: number) => Math.max(50, Math.round(n / 10) * 10);
  return {
    platform,
    currency: "USD",
    low: round((avgViews / 1000) * lo * quality),
    high: round((avgViews / 1000) * hi * quality),
    basis: `CPM $${lo}-${hi} on ${Math.round(avgViews)} avg views, engagement factor ${quality.toFixed(2)}`,
  };
}

export function formatLabel(format: PostFormat): string {
  return { reel: "Reel", image: "Photo", carousel: "Carousel", video: "Video", short: "Short", story: "Story" }[format];
}

export function pct(x: number | null | undefined, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return "–";
  return `${(x * 100).toFixed(digits)}%`;
}

export function compact(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
