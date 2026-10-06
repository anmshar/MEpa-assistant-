/**
 * Tools the AI manager can call. Every number it quotes comes from one of these,
 * computed by lib/analytics over the creator's synced data.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import { PLATFORMS, POST_FORMATS, type Platform } from "../db/schema";
import {
  bestPostingTimes,
  breakdown,
  comparePeriods,
  engagementRate,
  estimateRate,
  followerGrowth,
  rankPosts,
  summarize,
  withinDays,
} from "../analytics";
import type { CreatorData } from "../data";

export type ToolContext = {
  userId: string;
  timeZone: string;
  now: Date;
  data: CreatorData;
};

type ToolDef<S extends z.ZodType> = {
  name: string;
  description: string;
  schema: S;
  run: (ctx: ToolContext, input: z.infer<S>) => Promise<unknown> | unknown;
};

const defineTool = <S extends z.ZodType>(t: ToolDef<S>) => t;

const platformFilter = z
  .enum(PLATFORMS)
  .optional()
  .describe("Limit to one platform. Omit to include all connected platforms.");

const r3 = (x: number) => Math.round(x * 1000) / 1000;

function postsFor(ctx: ToolContext, platform?: Platform) {
  return platform ? ctx.data.posts.filter((p) => p.platform === platform) : ctx.data.posts;
}

function localTime(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function summaryOut(s: ReturnType<typeof summarize>) {
  return { ...s, avgEngagementRate: r3(s.avgEngagementRate) };
}

export const TOOLS = [
  defineTool({
    name: "get_overview",
    description:
      "Connected accounts with follower counts and growth, plus last-30-day performance versus the previous 30 days. Call this first when you need the big picture.",
    schema: z.object({}),
    run: (ctx) => {
      const now = ctx.now;
      return {
        today: localTime(now, ctx.timeZone),
        accounts: ctx.data.accounts.map((a) => {
          const snaps = ctx.data.snapshots.filter((s) => s.accountId === a.id);
          const posts = ctx.data.posts.filter((p) => p.accountId === a.id);
          return {
            platform: a.platform,
            handle: a.handle,
            isDemoData: a.isDemo,
            followers: a.followers,
            growth30d: followerGrowth(snaps, 30, now),
            growth90d: followerGrowth(snaps, 90, now),
            postsSynced: posts.length,
            last30d: summaryOut(summarize(withinDays(posts, 30, now))),
            lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
            status: a.status,
          };
        }),
        allPlatforms: (() => {
          const c = comparePeriods(ctx.data.posts, 30, now);
          return { current30d: summaryOut(c.current), previous30d: summaryOut(c.previous), change: c.change };
        })(),
      };
    },
  }),

  defineTool({
    name: "get_posts",
    description:
      "List individual posts ranked by a metric, with caption, format, publish time (creator's local time), metrics and content tags. Use order=bottom to find underperformers.",
    schema: z.object({
      platform: platformFilter,
      days: z.number().int().min(1).max(365).default(30).describe("Look-back window in days"),
      sort_by: z.enum(["views", "engagement_rate", "saves", "shares", "comments"]).default("views"),
      order: z.enum(["top", "bottom"]).default("top"),
      limit: z.number().int().min(1).max(20).default(5),
    }),
    run: (ctx, i) => {
      const posts = withinDays(postsFor(ctx, i.platform), i.days, ctx.now);
      return {
        postsInWindow: posts.length,
        posts: rankPosts(posts, i.sort_by, i.limit, i.order).map((p) => ({
          platform: p.platform,
          handle: p.handle,
          format: p.format,
          published: localTime(p.publishedAt, ctx.timeZone),
          caption: p.caption.slice(0, 220),
          views: p.views,
          reach: p.reach || undefined,
          likes: p.likes,
          comments: p.comments,
          shares: p.shares,
          saves: p.saves,
          engagementRate: r3(engagementRate(p)),
          durationSec: p.durationSec ?? undefined,
          avgWatchSec: p.avgWatchSec ?? undefined,
          tags: p.tags ?? undefined,
          url: p.permalink ?? undefined,
        })),
      };
    },
  }),

  defineTool({
    name: "get_breakdown",
    description:
      "Average performance grouped by a dimension: format, platform, weekday, hour (local time), topic or hookType (AI content tags). viewsLift is relative to the overall average (1.4 = 40% above). Use it to find what works.",
    schema: z.object({
      platform: platformFilter,
      dimension: z.enum(["format", "platform", "weekday", "hour", "topic", "hookType"]),
      days: z.number().int().min(7).max(365).default(90),
    }),
    run: (ctx, i) => {
      const posts = withinDays(postsFor(ctx, i.platform), i.days, ctx.now);
      return {
        postsAnalyzed: posts.length,
        rows: breakdown(posts, i.dimension, ctx.timeZone).map((r) => ({
          ...r,
          avgEngagementRate: r3(r.avgEngagementRate),
          viewsLift: Math.round(r.viewsLift * 100) / 100,
        })),
        note: posts.length < 15 ? "Small sample; treat differences as directional." : undefined,
      };
    },
  }),

  defineTool({
    name: "compare_periods",
    description: "Compare the last N days with the N days before (posts, views, average views, engagement rate).",
    schema: z.object({ platform: platformFilter, days: z.number().int().min(1).max(180).default(7) }),
    run: (ctx, i) => {
      const c = comparePeriods(postsFor(ctx, i.platform), i.days, ctx.now);
      return { ...c, current: summaryOut(c.current), previous: summaryOut(c.previous) };
    },
  }),

  defineTool({
    name: "get_audience",
    description: "Audience demographics (age, gender, country shares) per platform, where the platform provides them.",
    schema: z.object({ platform: platformFilter }),
    run: (ctx, i) =>
      ctx.data.audience
        .filter((a) => !i.platform || a.platform === i.platform)
        .map((a) => ({ platform: a.platform, ...a.demographics, updatedAt: a.updatedAt.toISOString() })),
  }),

  defineTool({
    name: "get_best_posting_times",
    description:
      "Best posting slots in the creator's local time, blending when their audience is online with how their own posts performed by hour and weekday.",
    schema: z.object({ platform: platformFilter }),
    run: (ctx, i) => {
      const audience = ctx.data.audience.find((a) => (i.platform ? a.platform === i.platform : a.activeHours));
      const posts = withinDays(postsFor(ctx, i.platform), 120, ctx.now);
      return {
        timeZone: ctx.timeZone,
        basis: audience?.activeHours ? "audience online activity + post performance" : "post performance only",
        slots: bestPostingTimes(posts, audience?.activeHours, ctx.timeZone).map(({ label, score }) => ({
          slot: label,
          score: Math.round(score * 100) / 100,
        })),
      };
    },
  }),

  defineTool({
    name: "estimate_rates",
    description:
      "Suggested price range per sponsored deliverable on each platform, from CPM benchmarks on the creator's last-90-day average views, adjusted for engagement. Starting points for negotiation, not quotes.",
    schema: z.object({}),
    run: (ctx) =>
      [...new Set(ctx.data.accounts.map((a) => a.platform))].map((platform) => {
        const s = summarize(withinDays(postsFor(ctx, platform), 90, ctx.now));
        return estimateRate(platform, s.avgViews, s.avgEngagementRate);
      }),
  }),

  defineTool({
    name: "get_content_plan",
    description: "The creator's saved content ideas and scheduled posts (not yet posted or dismissed).",
    schema: z.object({}),
    run: async (ctx) => {
      const db = await getDb();
      const ideas = await db
        .select()
        .from(schema.contentIdeas)
        .where(and(eq(schema.contentIdeas.userId, ctx.userId), inArray(schema.contentIdeas.status, ["idea", "scheduled"])))
        .orderBy(desc(schema.contentIdeas.createdAt))
        .limit(30);
      return ideas.map((x) => ({
        title: x.title,
        platform: x.platform,
        format: x.format,
        hook: x.hook,
        status: x.status,
        scheduledFor: x.scheduledFor ? localTime(x.scheduledFor, ctx.timeZone) : null,
      }));
    },
  }),

  defineTool({
    name: "add_content_ideas",
    description:
      "Save content ideas to the creator's plan so they appear on their Content Plan page. Only call this when the creator wants ideas saved or asked for a plan. scheduled_for is optional local date-time 'YYYY-MM-DD HH:mm'.",
    schema: z.object({
      ideas: z
        .array(
          z.object({
            title: z.string(),
            platform: z.enum(PLATFORMS),
            format: z.enum(POST_FORMATS),
            hook: z.string().describe("The first line / first 2 seconds"),
            description: z.string().describe("What happens in the post, shot list or slide outline"),
            caption: z.string(),
            hashtags: z.array(z.string()),
            rationale: z.string().describe("Why this should work, citing the data"),
            scheduled_for: z.string().optional(),
          }),
        )
        .min(1)
        .max(10),
    }),
    run: async (ctx, i) => {
      const db = await getDb();
      const rows = await db
        .insert(schema.contentIdeas)
        .values(
          i.ideas.map((x) => {
            const when = x.scheduled_for ? parseLocal(x.scheduled_for, ctx.timeZone) : null;
            return {
              userId: ctx.userId,
              title: x.title,
              platform: x.platform,
              format: x.format,
              hook: x.hook,
              description: x.description,
              caption: x.caption,
              hashtags: x.hashtags,
              rationale: x.rationale,
              scheduledFor: when,
              status: when ? ("scheduled" as const) : ("idea" as const),
              source: "ai" as const,
            };
          }),
        )
        .returning({ id: schema.contentIdeas.id });
      return { saved: rows.length };
    },
  }),

  defineTool({
    name: "remember",
    description:
      "Save a durable fact about the creator (a goal, preference, boundary, upcoming event, deal) so you remember it in future conversations. Don't save things already in the creator profile.",
    schema: z.object({ fact: z.string().max(500) }),
    run: async (ctx, i) => {
      const db = await getDb();
      await db.insert(schema.memoryFacts).values({ userId: ctx.userId, fact: i.fact });
      return { saved: true };
    },
  }),

  defineTool({
    name: "get_latest_report",
    description: "The most recent weekly performance report generated for the creator.",
    schema: z.object({}),
    run: async (ctx) => {
      const db = await getDb();
      const [r] = await db
        .select()
        .from(schema.reports)
        .where(eq(schema.reports.userId, ctx.userId))
        .orderBy(desc(schema.reports.createdAt))
        .limit(1);
      return r ? { period: `${r.periodStart.toISOString().slice(0, 10)} – ${r.periodEnd.toISOString().slice(0, 10)}`, ...r.content } : null;
    },
  }),
];

/**
 * Converts "YYYY-MM-DD HH:mm" in the given IANA time zone to a Date.
 * Uses the zone's offset at that instant (correct except within a DST switch hour).
 */
export function parseLocal(value: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(asUtc));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const zoned = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(asUtc - (zoned - asUtc));
}

export function toolDefinitions(): Anthropic.Beta.BetaTool[] {
  return TOOLS.map((t) => {
    const { $schema: _ignored, ...inputSchema } = z.toJSONSchema(t.schema, { io: "input" }) as Record<string, unknown>;
    return {
      name: t.name,
      description: t.description,
      input_schema: inputSchema as Anthropic.Beta.BetaTool.InputSchema,
      eager_input_streaming: true,
    };
  });
}

/** Validates the model's input against the tool schema, then runs it. */
export async function runTool(ctx: ToolContext, name: string, input: unknown): Promise<{ content: string; isError: boolean }> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { content: `Unknown tool: ${name}`, isError: true };
  const parsed = (tool.schema as z.ZodType).safeParse(input ?? {});
  if (!parsed.success) {
    return { content: `Invalid input: ${z.prettifyError(parsed.error)}`, isError: true };
  }
  try {
    const result = await (tool.run as (c: ToolContext, i: unknown) => unknown)(ctx, parsed.data);
    return { content: JSON.stringify(result ?? null), isError: false };
  } catch (err) {
    return { content: `Tool failed: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}
