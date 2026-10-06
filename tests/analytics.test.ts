import { describe, expect, it } from "vitest";
import {
  bestPostingTimes,
  breakdown,
  comparePeriods,
  engagementRate,
  estimateRate,
  followerGrowth,
  localParts,
  rankPosts,
  summarize,
  withinDays,
  type PostLike,
} from "@/lib/analytics";

const now = new Date("2026-10-06T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

function post(daysAgo: number, over: Partial<PostLike> = {}): PostLike {
  return {
    platform: "instagram",
    format: "reel",
    publishedAt: new Date(now.getTime() - daysAgo * day),
    views: 1000,
    reach: 800,
    likes: 40,
    comments: 5,
    shares: 3,
    saves: 2,
    tags: null,
    ...over,
  };
}

describe("engagementRate", () => {
  it("divides interactions by reach", () => {
    expect(engagementRate(post(1))).toBeCloseTo(50 / 800);
  });
  it("falls back to views without reach, and to 0 with neither", () => {
    expect(engagementRate(post(1, { reach: 0 }))).toBeCloseTo(50 / 1000);
    expect(engagementRate(post(1, { reach: 0, views: 0 }))).toBe(0);
  });
});

describe("periods", () => {
  const posts = [post(1, { views: 3000 }), post(5, { views: 1000 }), post(9, { views: 500 }), post(40)];
  it("filters by window", () => {
    expect(withinDays(posts, 7, now)).toHaveLength(2);
    expect(withinDays(posts, 7, now, 7)).toHaveLength(1);
  });
  it("summarizes and compares", () => {
    const s = summarize(withinDays(posts, 7, now));
    expect(s.posts).toBe(2);
    expect(s.views).toBe(4000);
    expect(s.avgViews).toBe(2000);
    const c = comparePeriods(posts, 7, now);
    expect(c.previous.avgViews).toBe(500);
    expect(c.change.avgViews).toBeCloseTo(3);
    expect(c.change.posts).toBe(1);
  });
  it("reports null change when the previous period is empty", () => {
    expect(comparePeriods([post(1)], 7, now).change.views).toBeNull();
  });
});

describe("breakdown", () => {
  it("groups by format with lift vs the overall average", () => {
    const rows = breakdown([post(1, { views: 3000 }), post(2, { format: "image", views: 1000 })], "format");
    expect(rows[0]).toMatchObject({ key: "reel", posts: 1, avgViews: 3000 });
    expect(rows[0].viewsLift).toBeCloseTo(1.5);
    expect(rows[1].viewsLift).toBeCloseTo(0.5);
  });
  it("skips posts without the tag", () => {
    const rows = breakdown([post(1, { tags: { hookType: "question" } }), post(2)], "hookType");
    expect(rows.map((r) => r.key)).toEqual(["question"]);
  });
  it("uses the creator's time zone for hours", () => {
    expect(localParts(new Date("2026-07-01T17:30:00Z"), "Europe/Berlin")).toEqual({ weekday: 3, hour: 19 });
    const rows = breakdown([post(0, { publishedAt: new Date("2026-07-01T17:30:00Z") })], "hour", "Europe/Berlin");
    expect(rows[0].key).toBe("19:00");
  });
});

describe("rankPosts", () => {
  it("ranks top and bottom", () => {
    const posts = [post(1, { views: 10 }), post(2, { views: 30 }), post(3, { views: 20 })];
    expect(rankPosts(posts, "views", 2).map((p) => p.views)).toEqual([30, 20]);
    expect(rankPosts(posts, "views", 1, "bottom")[0].views).toBe(10);
  });
});

describe("bestPostingTimes", () => {
  it("uses audience activity and returns one slot per weekday", () => {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0.1));
    grid[2][19] = 1;
    grid[4][8] = 0.8;
    const slots = bestPostingTimes([], grid, "UTC", 3);
    expect(slots[0]).toMatchObject({ weekday: 2, hour: 19, label: "Tue 19:00" });
    expect(slots[1]).toMatchObject({ weekday: 4, hour: 8 });
    expect(new Set(slots.map((s) => s.weekday)).size).toBe(slots.length);
  });
  it("returns nothing without any signal", () => {
    expect(bestPostingTimes([], null)).toEqual([]);
  });
});

describe("followerGrowth", () => {
  it("measures change across the window using the last earlier snapshot as baseline", () => {
    const snaps = [
      { day: "2026-08-01", followers: 900 },
      { day: "2026-09-10", followers: 1000 },
      { day: "2026-10-06", followers: 1100 },
    ];
    expect(followerGrowth(snaps, 30, now)).toMatchObject({ start: 900, end: 1100, change: 200 });
  });
});

describe("estimateRate", () => {
  it("scales with views and clamps the engagement factor", () => {
    const r = estimateRate("instagram", 10000, 0.04);
    expect(r.low).toBe(150);
    expect(r.high).toBe(300);
    const viral = estimateRate("instagram", 10000, 0.5);
    expect(viral.high).toBe(450); // factor capped at 1.5
    expect(estimateRate("youtube", 0, 0).low).toBe(50); // floor
  });
});
