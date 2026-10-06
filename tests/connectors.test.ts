import { describe, expect, it } from "vitest";
import { parseIsoDuration } from "@/lib/connectors/youtube";
import { normalizeShares } from "@/lib/connectors/types";
import { demoAudience, demoPosts, demoSnapshots } from "@/lib/connectors/demo";
import { breakdown } from "@/lib/analytics";
import { decrypt, encrypt } from "@/lib/crypto";
import { parseLocal } from "@/lib/ai/tools";

describe("helpers", () => {
  it("parses ISO 8601 durations", () => {
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("P1DT1M")).toBe(86460);
  });
  it("normalizes shares", () => {
    expect(normalizeShares({ a: 1, b: 3 })).toEqual({ a: 0.25, b: 0.75 });
    expect(normalizeShares({})).toEqual({});
  });
  it("round-trips encrypted tokens", () => {
    const enc = encrypt("secret-token");
    expect(enc).not.toContain("secret");
    expect(decrypt(enc)).toBe("secret-token");
  });
  it("converts local times to UTC", () => {
    expect(parseLocal("2026-07-01 19:00", "Europe/Berlin")?.toISOString()).toBe("2026-07-01T17:00:00.000Z");
    expect(parseLocal("2026-12-01 19:00", "Europe/Berlin")?.toISOString()).toBe("2026-12-01T18:00:00.000Z");
    expect(parseLocal("next tuesday", "UTC")).toBeNull();
  });
});

describe("demo data", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  const posts = demoPosts("instagram", now);

  it("is deterministic and recent", () => {
    expect(demoPosts("instagram", now)).toEqual(posts);
    expect(posts.length).toBeGreaterThan(40);
    expect(posts.every((p) => p.publishedAt < now)).toBe(true);
  });

  it("contains the patterns the AI manager should discover", () => {
    const hooks = breakdown(posts, "hookType");
    const tutorial = hooks.find((h) => h.key === "tutorial")!;
    const story = hooks.find((h) => h.key === "story")!;
    expect(tutorial.avgViews).toBeGreaterThan(story.avgViews);
    const formats = breakdown(posts, "format");
    expect(formats.find((f) => f.key === "reel")!.avgViews).toBeGreaterThan(formats.find((f) => f.key === "image")!.avgViews);
  });

  it("has growing followers and audience data", () => {
    const snaps = demoSnapshots("youtube", now);
    expect(snaps.at(-1)!.followers).toBeGreaterThan(snaps[0].followers);
    const a = demoAudience("instagram");
    expect(a.activeHours).toHaveLength(7);
    expect(a.activeHours![2]).toHaveLength(24);
  });
});
