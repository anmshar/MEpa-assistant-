import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Account, Platform, PostTags } from "./db/schema";
import { decrypt, encrypt } from "./crypto";
import { getConnector } from "./connectors";
import { demoAudience, demoPosts, demoProfile, demoSnapshots, DEMO_PLATFORMS } from "./connectors/demo";
import { PlatformError, type RemoteAudience, type RemotePost } from "./connectors/types";
import { aiConfigured } from "./ai/client";
import { tagPosts } from "./ai/tagging";

const today = () => new Date().toISOString().slice(0, 10);

async function upsertPosts(accountId: string, items: (RemotePost & { tags?: PostTags })[]) {
  if (!items.length) return;
  const db = await getDb();
  const p = schema.posts;
  for (let i = 0; i < items.length; i += 200) {
    await db
      .insert(p)
      .values(items.slice(i, i + 200).map((x) => ({ ...x, accountId })))
      .onConflictDoUpdate({
        target: [p.accountId, p.externalId],
        set: {
          caption: sql`excluded.caption`,
          format: sql`excluded.format`,
          permalink: sql`excluded.permalink`,
          thumbnailUrl: sql`excluded.thumbnail_url`,
          views: sql`excluded.views`,
          reach: sql`excluded.reach`,
          likes: sql`excluded.likes`,
          comments: sql`excluded.comments`,
          shares: sql`excluded.shares`,
          saves: sql`excluded.saves`,
          avgWatchSec: sql`excluded.avg_watch_sec`,
          durationSec: sql`excluded.duration_sec`,
          updatedAt: sql`now()`,
        },
      });
  }
}

async function upsertSnapshots(accountId: string, rows: { day: string; followers: number }[]) {
  if (!rows.length) return;
  const db = await getDb();
  const s = schema.accountSnapshots;
  await db
    .insert(s)
    .values(rows.map((r) => ({ ...r, accountId })))
    .onConflictDoUpdate({ target: [s.accountId, s.day], set: { followers: sql`excluded.followers` } });
}

async function upsertAudience(accountId: string, audience: RemoteAudience | null) {
  if (!audience) return;
  const db = await getDb();
  await db
    .insert(schema.audienceInsights)
    .values({ accountId, ...audience })
    .onConflictDoUpdate({
      target: schema.audienceInsights.accountId,
      set: { demographics: audience.demographics, activeHours: audience.activeHours, updatedAt: new Date() },
    });
}

async function syncDemo(account: Account) {
  const db = await getDb();
  const profile = demoProfile(account.platform);
  // Demo data is anchored to "now", so regenerate it rather than merging.
  await db.delete(schema.posts).where(eq(schema.posts.accountId, account.id));
  await db.delete(schema.accountSnapshots).where(eq(schema.accountSnapshots.accountId, account.id));
  await upsertPosts(account.id, demoPosts(account.platform));
  await upsertSnapshots(account.id, demoSnapshots(account.platform));
  await upsertAudience(account.id, demoAudience(account.platform));
  await db
    .update(schema.accounts)
    .set({ followers: profile.followers, lastSyncedAt: new Date(), status: "active", lastError: null })
    .where(eq(schema.accounts.id, account.id));
}

async function syncRemote(account: Account) {
  const db = await getDb();
  const connector = getConnector(account.platform);
  if (!connector) throw new Error(`No connector for ${account.platform}`);
  if (!account.accessToken) throw new PlatformError("Missing access token", 401, true);

  let accessToken = decrypt(account.accessToken);
  const refreshed = await connector.refreshIfNeeded({
    accessToken,
    refreshToken: account.refreshToken ? decrypt(account.refreshToken) : null,
    expiresAt: account.tokenExpiresAt,
  });
  if (refreshed) {
    accessToken = refreshed.accessToken;
    await db
      .update(schema.accounts)
      .set({
        accessToken: encrypt(refreshed.accessToken),
        refreshToken: refreshed.refreshToken ? encrypt(refreshed.refreshToken) : account.refreshToken,
        tokenExpiresAt: refreshed.expiresAt ?? null,
      })
      .where(eq(schema.accounts.id, account.id));
  }

  const profile = await connector.fetchProfile(accessToken);
  const remotePosts = await connector.fetchPosts(accessToken, profile);
  const audience = await connector.fetchAudience(accessToken, profile);

  await upsertPosts(account.id, remotePosts);
  await upsertSnapshots(account.id, [{ day: today(), followers: profile.followers }]);
  await upsertAudience(account.id, audience);
  await db
    .update(schema.accounts)
    .set({
      handle: profile.handle,
      avatarUrl: profile.avatarUrl ?? null,
      followers: profile.followers,
      lastSyncedAt: new Date(),
      status: "active",
      lastError: null,
    })
    .where(eq(schema.accounts.id, account.id));

  if (aiConfigured()) {
    const untagged = await db
      .select()
      .from(schema.posts)
      .where(and(eq(schema.posts.accountId, account.id), isNull(schema.posts.tags)));
    try {
      await tagPosts(untagged);
    } catch (err) {
      console.error("Post tagging failed", err);
    }
  }
}

export async function syncAccount(accountId: string): Promise<{ ok: boolean; error?: string }> {
  const db = await getDb();
  const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  if (!account) return { ok: false, error: "Account not found" };
  try {
    if (account.isDemo) await syncDemo(account);
    else await syncRemote(account);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const reauth = err instanceof PlatformError && err.reauth;
    await db
      .update(schema.accounts)
      .set({ status: reauth ? "reauth" : "error", lastError: message.slice(0, 500) })
      .where(eq(schema.accounts.id, accountId));
    return { ok: false, error: message };
  }
}

export async function syncUser(userId: string) {
  const db = await getDb();
  const rows = await db.select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.userId, userId));
  return Promise.all(rows.map((r) => syncAccount(r.id)));
}

/** Creates the demo Instagram + YouTube accounts for a user and fills them with sample data. */
export async function connectDemo(userId: string) {
  const db = await getDb();
  for (const platform of DEMO_PLATFORMS) {
    const profile = demoProfile(platform as Platform);
    const [row] = await db
      .insert(schema.accounts)
      .values({ userId, platform, externalId: profile.externalId, handle: profile.handle, isDemo: true })
      .onConflictDoUpdate({
        target: [schema.accounts.userId, schema.accounts.platform, schema.accounts.externalId],
        set: { status: "active" },
      })
      .returning();
    await syncAccount(row.id);
  }
}
