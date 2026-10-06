import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  date,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const PLATFORMS = ["instagram", "youtube", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const POST_FORMATS = ["reel", "image", "carousel", "video", "short", "story"] as const;
export type PostFormat = (typeof POST_FORMATS)[number];

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** What the AI manager knows about the creator, collected during onboarding. */
export const creatorProfiles = pgTable("creator_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull().default(""),
  niche: text("niche").notNull().default(""),
  goals: text("goals").notNull().default(""),
  audience: text("audience").notNull().default(""),
  voice: text("voice").notNull().default(""),
  boundaries: text("boundaries").notNull().default(""),
  hoursPerWeek: integer("hours_per_week"),
  timezone: text("timezone").notNull().default("Europe/Berlin"),
  bio: text("bio").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  onboarded: boolean("onboarded").notNull().default(false),
  mediaKitSlug: text("media_kit_slug").unique(),
  mediaKitPublic: boolean("media_kit_public").notNull().default(false),
  mediaKitShowRates: boolean("media_kit_show_rates").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A connected social account. Tokens are encrypted at rest (see lib/crypto). */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").$type<Platform>().notNull(),
    externalId: text("external_id").notNull(),
    handle: text("handle").notNull(),
    avatarUrl: text("avatar_url"),
    isDemo: boolean("is_demo").notNull().default(false),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    followers: integer("followers").notNull().default(0),
    status: text("status").$type<"active" | "error" | "reauth">().notNull().default("active"),
    lastError: text("last_error"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_user_platform_ext").on(t.userId, t.platform, t.externalId)],
);

/** Daily follower counts, used for growth charts. */
export const accountSnapshots = pgTable(
  "account_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    followers: integer("followers").notNull(),
  },
  (t) => [uniqueIndex("snapshots_account_day").on(t.accountId, t.day)],
);

export type PostTags = {
  topic?: string;
  hookType?: string;
  hasCta?: boolean;
};

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    platform: text("platform").$type<Platform>().notNull(),
    externalId: text("external_id").notNull(),
    format: text("format").$type<PostFormat>().notNull(),
    caption: text("caption").notNull().default(""),
    permalink: text("permalink"),
    thumbnailUrl: text("thumbnail_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    durationSec: integer("duration_sec"),
    views: integer("views").notNull().default(0),
    reach: integer("reach").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    saves: integer("saves").notNull().default(0),
    avgWatchSec: real("avg_watch_sec"),
    tags: jsonb("tags").$type<PostTags>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("posts_account_ext").on(t.accountId, t.externalId),
    index("posts_account_published").on(t.accountId, t.publishedAt),
  ],
);

export type Demographics = {
  /** e.g. { "18-24": 0.31, "25-34": 0.42 } — shares summing to ~1 */
  age?: Record<string, number>;
  gender?: Record<string, number>;
  /** ISO country code -> share */
  country?: Record<string, number>;
};

/** activeHours[weekday 0=Sun..6][hour 0..23] = relative audience activity (0..1) */
export type ActiveHours = number[][];

export const audienceInsights = pgTable("audience_insights", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  demographics: jsonb("demographics").$type<Demographics>().notNull(),
  activeHours: jsonb("active_hours").$type<ActiveHours>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New conversation"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Raw API message turns, stored exactly as sent/received so the history replayed
 * to the model is append-only (required for preserved thinking and prompt caching).
 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: jsonb("content").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("chat_messages_conv_seq").on(t.conversationId, t.seq)],
);

/** Durable facts the AI manager chose to remember about the creator. */
export const memoryFacts = pgTable("memory_facts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  fact: text("fact").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const IDEA_STATUSES = ["idea", "scheduled", "posted", "dismissed"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const contentIdeas = pgTable("content_ideas", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").$type<Platform>().notNull(),
  format: text("format").$type<PostFormat>().notNull(),
  title: text("title").notNull(),
  hook: text("hook").notNull().default(""),
  description: text("description").notNull().default(""),
  caption: text("caption").notNull().default(""),
  hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
  rationale: text("rationale").notNull().default(""),
  status: text("status").$type<IdeaStatus>().notNull().default("idea"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  source: text("source").$type<"ai" | "user">().notNull().default("ai"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ReportContent = {
  headline: string;
  summary: string;
  wins: string[];
  watchouts: string[];
  priorities: { title: string; why: string }[];
};

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  content: jsonb("content").$type<ReportContent>().notNull(),
  metrics: jsonb("metrics").$type<unknown>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type CreatorProfile = typeof creatorProfiles.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type AudienceInsight = typeof audienceInsights.$inferSelect;
export type ContentIdea = typeof contentIdeas.$inferSelect;
export type Report = typeof reports.$inferSelect;
