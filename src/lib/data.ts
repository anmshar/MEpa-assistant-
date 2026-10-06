import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Account, AudienceInsight, CreatorProfile, Platform, Post } from "./db/schema";

export type CreatorData = {
  profile: CreatorProfile | null;
  accounts: Account[];
  posts: (Post & { handle: string })[];
  snapshots: { accountId: string; platform: Platform; day: string; followers: number }[];
  audience: (AudienceInsight & { platform: Platform })[];
};

/** Everything we know about a creator's channels, loaded in one go for analytics. */
export async function loadCreatorData(userId: string): Promise<CreatorData> {
  const db = await getDb();
  const [profile] = await db.select().from(schema.creatorProfiles).where(eq(schema.creatorProfiles.userId, userId));
  const accounts = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, userId))
    .orderBy(asc(schema.accounts.createdAt));
  if (!accounts.length) return { profile: profile ?? null, accounts, posts: [], snapshots: [], audience: [] };

  const ids = accounts.map((a) => a.id);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const [posts, snapshots, audience] = await Promise.all([
    db.select().from(schema.posts).where(inArray(schema.posts.accountId, ids)).orderBy(desc(schema.posts.publishedAt)),
    db.select().from(schema.accountSnapshots).where(inArray(schema.accountSnapshots.accountId, ids)),
    db.select().from(schema.audienceInsights).where(inArray(schema.audienceInsights.accountId, ids)),
  ]);
  return {
    profile: profile ?? null,
    accounts,
    posts: posts.map((p) => ({ ...p, handle: byId.get(p.accountId)!.handle })),
    snapshots: snapshots.map((s) => ({
      accountId: s.accountId,
      platform: byId.get(s.accountId)!.platform,
      day: s.day,
      followers: s.followers,
    })),
    audience: audience.map((a) => ({ ...a, platform: byId.get(a.accountId)!.platform })),
  };
}

/** Sums follower snapshots across accounts per day (carrying forward missing days). */
export function totalFollowersByDay(snapshots: CreatorData["snapshots"]): { day: string; followers: number }[] {
  const days = [...new Set(snapshots.map((s) => s.day))].sort();
  const accounts = [...new Set(snapshots.map((s) => s.accountId))];
  const latest = new Map<string, number>();
  const byKey = new Map(snapshots.map((s) => [`${s.accountId}|${s.day}`, s.followers]));
  return days.map((day) => {
    for (const a of accounts) {
      const v = byKey.get(`${a}|${day}`);
      if (v != null) latest.set(a, v);
    }
    return { day, followers: [...latest.values()].reduce((x, y) => x + y, 0) };
  });
}

export async function getOrCreateProfile(userId: string, name: string) {
  const db = await getDb();
  const [existing] = await db.select().from(schema.creatorProfiles).where(eq(schema.creatorProfiles.userId, userId));
  if (existing) return existing;
  const [created] = await db
    .insert(schema.creatorProfiles)
    .values({ userId, displayName: name })
    .onConflictDoNothing()
    .returning();
  return created ?? (await db.select().from(schema.creatorProfiles).where(eq(schema.creatorProfiles.userId, userId)))[0];
}
