import "server-only";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import { POST_FORMATS, type Platform, type ReportContent } from "../db/schema";
import {
  bestPostingTimes,
  breakdown,
  comparePeriods,
  engagementRate,
  followerGrowth,
  rankPosts,
  withinDays,
} from "../analytics";
import { loadCreatorData, type CreatorData } from "../data";
import { FALLBACK, MODEL, anthropic } from "./client";
import { MANAGER_SYSTEM, creatorContext } from "./prompts";
import { parseLocal } from "./tools";

const DAY_MS = 24 * 60 * 60 * 1000;

async function systemFor(userId: string, data: CreatorData, now: Date): Promise<Anthropic.Beta.BetaTextBlockParam[]> {
  const db = await getDb();
  const memories = await db
    .select({ fact: schema.memoryFacts.fact })
    .from(schema.memoryFacts)
    .where(eq(schema.memoryFacts.userId, userId))
    .orderBy(desc(schema.memoryFacts.createdAt))
    .limit(50);
  return [
    { type: "text", text: MANAGER_SYSTEM, cache_control: { type: "ephemeral" } },
    { type: "text", text: creatorContext(data.profile, data, memories.map((m) => m.fact).reverse(), now) },
  ];
}

const postBrief = (p: CreatorData["posts"][number], tz: string) => ({
  platform: p.platform,
  format: p.format,
  published: p.publishedAt.toLocaleString("en-GB", { timeZone: tz, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
  caption: p.caption.slice(0, 160),
  views: p.views,
  engagementRate: Math.round(engagementRate(p) * 1000) / 1000,
  saves: p.saves,
  shares: p.shares,
  comments: p.comments,
  tags: p.tags ?? undefined,
});

/** The numbers a weekly report is written from. Exported for tests and the reports page. */
export function weeklyMetrics(data: CreatorData, now = new Date()) {
  const tz = data.profile?.timezone || "UTC";
  const platforms = [...new Set(data.accounts.map((a) => a.platform))];
  const week = withinDays(data.posts, 7, now);
  return {
    periodDays: 7,
    overall: comparePeriods(data.posts, 7, now),
    perPlatform: platforms.map((platform) => ({
      platform,
      ...comparePeriods(
        data.posts.filter((p) => p.platform === platform),
        7,
        now,
      ),
      followers: followerGrowth(
        data.snapshots.filter((s) => s.platform === platform),
        7,
        now,
      ),
    })),
    topPostsThisWeek: rankPosts(week, "views", 3).map((p) => postBrief(p, tz)),
    weakestPostsThisWeek: week.length > 3 ? rankPosts(week, "views", 2, "bottom").map((p) => postBrief(p, tz)) : [],
    formats30d: breakdown(withinDays(data.posts, 30, now), "format", tz),
    hooks90d: breakdown(withinDays(data.posts, 90, now), "hookType", tz),
    topics90d: breakdown(withinDays(data.posts, 90, now), "topic", tz),
  };
}

const ReportSchema = z.object({
  headline: z.string().describe("One sentence: the most important thing about this week"),
  summary: z.string().describe("2-4 sentences in plain language with the key numbers"),
  wins: z.array(z.string()).describe("2-4 things that went well, each citing a number"),
  watchouts: z.array(z.string()).describe("1-3 things to keep an eye on or fix"),
  priorities: z
    .array(z.object({ title: z.string(), why: z.string() }))
    .describe("Exactly 3 concrete priorities for next week, most important first"),
});

export async function generateWeeklyReport(userId: string) {
  const now = new Date();
  const data = await loadCreatorData(userId);
  if (!data.posts.length) throw new Error("Connect an account (or the demo account) before generating a report.");
  const metrics = weeklyMetrics(data, now);

  const res = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "medium", format: betaZodOutputFormat(ReportSchema) },
    system: await systemFor(userId, data, now),
    messages: [
      {
        role: "user",
        content: `Write my weekly performance report from these numbers (computed from my synced data; engagement rates are fractions, viewsLift is relative to my average). Be honest; if the week was slow, say so and say what to do about it.\n\n<metrics>\n${JSON.stringify(metrics)}\n</metrics>`,
      },
    ],
  });
  const content: ReportContent | null = res.parsed_output ?? null;
  if (!content) throw new Error(res.stop_reason === "refusal" ? "The report request was declined." : "Could not generate the report.");

  const db = await getDb();
  const [row] = await db
    .insert(schema.reports)
    .values({
      userId,
      periodStart: new Date(now.getTime() - 7 * DAY_MS),
      periodEnd: now,
      content,
      metrics,
    })
    .returning();
  return row;
}

function ideaSchema(platforms: [Platform, ...Platform[]]) {
  return z.object({
    ideas: z.array(
      z.object({
        title: z.string(),
        platform: z.enum(platforms),
        format: z.enum(POST_FORMATS),
        hook: z.string().describe("The exact opening line or first 2 seconds"),
        description: z.string().describe("Shot list or slide outline, concise"),
        caption: z.string(),
        hashtags: z.array(z.string()),
        rationale: z.string().describe("Why this should work, citing the creator's numbers"),
        scheduled_for: z.string().describe("Local date-time 'YYYY-MM-DD HH:mm' within the next 7 days, on a recommended slot"),
      }),
    ),
  });
}

/** Generates and saves next week's content plan. */
export async function generateContentPlan(userId: string, count = 5) {
  const now = new Date();
  const data = await loadCreatorData(userId);
  const platforms = [...new Set(data.accounts.map((a) => a.platform))];
  if (!platforms.length || !data.posts.length) throw new Error("Connect an account (or the demo account) first.");
  const tz = data.profile?.timezone || "UTC";
  const recent = withinDays(data.posts, 90, now);
  const db = await getDb();
  const upcoming = await db
    .select({ title: schema.contentIdeas.title })
    .from(schema.contentIdeas)
    .where(and(eq(schema.contentIdeas.userId, userId), inArray(schema.contentIdeas.status, ["idea", "scheduled"])));

  const context = {
    platforms,
    today: new Intl.DateTimeFormat("en-CA", { timeZone: tz, dateStyle: "short" }).format(now),
    bestSlots: bestPostingTimes(recent, data.audience.find((a) => a.activeHours)?.activeHours, tz).map((s) => s.label),
    formats: breakdown(recent, "format", tz),
    hooks: breakdown(recent, "hookType", tz),
    topics: breakdown(recent, "topic", tz),
    topPosts: rankPosts(recent, "views", 5).map((p) => postBrief(p, tz)),
    mostSaved: rankPosts(recent, "saves", 3).map((p) => postBrief(p, tz)),
    alreadyPlanned: upcoming.map((u) => u.title),
  };

  const res = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "medium", format: betaZodOutputFormat(ideaSchema(platforms as [Platform, ...Platform[]])) },
    system: await systemFor(userId, data, now),
    messages: [
      {
        role: "user",
        content: `Plan my next 7 days: ${count} specific posts across my platforms, built on what is working in my data and fitting my available time. Don't repeat what's already planned. Spread them over the best slots.\n\n<data>\n${JSON.stringify(context)}\n</data>`,
      },
    ],
  });
  const ideas = res.parsed_output?.ideas ?? [];
  if (!ideas.length) throw new Error("Could not generate a plan right now.");

  await db.insert(schema.contentIdeas).values(
    ideas.map((x) => {
      const when = parseLocal(x.scheduled_for, tz);
      return {
        userId,
        platform: x.platform,
        format: x.format,
        title: x.title,
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
  );
  return ideas.length;
}
