/**
 * Instagram via the "Instagram API with Instagram Login" (graph.instagram.com).
 * Works with Business and Creator accounts without needing a linked Facebook Page.
 * Scopes: instagram_business_basic, instagram_business_manage_insights.
 */
import type { ActiveHours, PostFormat } from "../db/schema";
import {
  DAY_MS,
  type Connector,
  type RemoteAudience,
  type RemotePost,
  type RemoteProfile,
  type TokenSet,
  fetchJson,
  normalizeShares,
} from "./types";

const GRAPH = "https://graph.instagram.com/v23.0";
const SCOPES = ["instagram_business_basic", "instagram_business_manage_insights"];
const MAX_POSTS = 100;

const clientId = () => process.env.INSTAGRAM_CLIENT_ID ?? "";
const clientSecret = () => process.env.INSTAGRAM_CLIENT_SECRET ?? "";

type IgMedia = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_product_type?: "FEED" | "REELS" | "STORY" | "AD";
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
};

type InsightsResponse = {
  data: { name: string; values?: { value: number }[]; total_value?: { value: number; breakdowns?: Breakdown[] } }[];
};
type Breakdown = { results: { dimension_values: string[]; value: number }[] };

function formatOf(m: IgMedia): PostFormat {
  if (m.media_product_type === "REELS") return "reel";
  if (m.media_product_type === "STORY") return "story";
  if (m.media_type === "CAROUSEL_ALBUM") return "carousel";
  if (m.media_type === "VIDEO") return "reel";
  return "image";
}

async function mediaInsights(token: string, mediaId: string, format: PostFormat) {
  // Not every metric exists for every media type; ask for the widest set first,
  // then fall back so one unsupported metric doesn't lose the rest.
  const sets =
    format === "reel"
      ? [["views", "reach", "saved", "shares", "ig_reels_avg_watch_time"], ["reach", "saved", "shares"]]
      : [["views", "reach", "saved", "shares"], ["reach", "saved"]];
  for (const metrics of sets) {
    try {
      const res = await fetchJson<InsightsResponse>(
        `${GRAPH}/${mediaId}/insights?metric=${metrics.join(",")}&access_token=${token}`,
      );
      const out: Record<string, number> = {};
      for (const d of res.data) out[d.name] = d.values?.[0]?.value ?? d.total_value?.value ?? 0;
      return out;
    } catch {
      continue;
    }
  }
  return {};
}

async function breakdown(token: string, igId: string, dim: "age" | "gender" | "country") {
  try {
    const res = await fetchJson<InsightsResponse>(
      `${GRAPH}/${igId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=${dim}&access_token=${token}`,
    );
    const results = res.data[0]?.total_value?.breakdowns?.[0]?.results ?? [];
    return normalizeShares(Object.fromEntries(results.map((r) => [r.dimension_values[0], r.value])));
  } catch {
    return undefined; // needs 100+ followers
  }
}

export const instagram: Connector = {
  platform: "instagram",
  label: "Instagram",

  configured: () => Boolean(clientId() && clientSecret()),

  authUrl(state, redirectUri) {
    const q = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(","),
      state,
    });
    return `https://www.instagram.com/oauth/authorize?${q}`;
  },

  async exchangeCode(code, redirectUri): Promise<TokenSet> {
    const short = await fetchJson<{ access_token: string }>("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: clientId(),
        client_secret: clientSecret(),
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });
    // Swap the 1-hour token for a 60-day long-lived one.
    const long = await fetchJson<{ access_token: string; expires_in: number }>(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${clientSecret()}&access_token=${short.access_token}`,
    );
    return { accessToken: long.access_token, expiresAt: new Date(Date.now() + long.expires_in * 1000) };
  },

  async refreshIfNeeded(tokens) {
    // Long-lived tokens can be refreshed once they are 24h old; do it in the last 10 days.
    if (!tokens.expiresAt || tokens.expiresAt.getTime() - Date.now() > 10 * DAY_MS) return null;
    const res = await fetchJson<{ access_token: string; expires_in: number }>(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${tokens.accessToken}`,
    );
    return { accessToken: res.access_token, expiresAt: new Date(Date.now() + res.expires_in * 1000) };
  },

  async fetchProfile(token): Promise<RemoteProfile> {
    const me = await fetchJson<{
      user_id: string;
      username: string;
      followers_count?: number;
      profile_picture_url?: string;
    }>(`${GRAPH}/me?fields=user_id,username,followers_count,profile_picture_url&access_token=${token}`);
    return {
      externalId: String(me.user_id),
      handle: me.username,
      avatarUrl: me.profile_picture_url ?? null,
      followers: me.followers_count ?? 0,
    };
  },

  async fetchPosts(token): Promise<RemotePost[]> {
    const fields =
      "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count";
    const media: IgMedia[] = [];
    let url: string | undefined = `${GRAPH}/me/media?fields=${fields}&limit=50&access_token=${token}`;
    while (url && media.length < MAX_POSTS) {
      const page: { data: IgMedia[]; paging?: { next?: string } } = await fetchJson(url);
      media.push(...page.data);
      url = page.paging?.next;
    }

    const out: RemotePost[] = [];
    for (const m of media.slice(0, MAX_POSTS)) {
      const format = formatOf(m);
      const ins = await mediaInsights(token, m.id, format);
      out.push({
        platform: "instagram",
        externalId: m.id,
        format,
        caption: m.caption ?? "",
        permalink: m.permalink ?? null,
        thumbnailUrl: m.thumbnail_url ?? (m.media_type === "IMAGE" ? m.media_url : null) ?? null,
        publishedAt: new Date(m.timestamp),
        durationSec: null,
        views: ins.views ?? ins.reach ?? 0,
        reach: ins.reach ?? 0,
        likes: m.like_count ?? 0,
        comments: m.comments_count ?? 0,
        shares: ins.shares ?? 0,
        saves: ins.saved ?? 0,
        // ig_reels_avg_watch_time is reported in milliseconds
        avgWatchSec: ins.ig_reels_avg_watch_time ? ins.ig_reels_avg_watch_time / 1000 : null,
      });
    }
    return out;
  },

  async fetchAudience(token, profile): Promise<RemoteAudience | null> {
    const [age, gender, country] = await Promise.all([
      breakdown(token, profile.externalId, "age"),
      breakdown(token, profile.externalId, "gender"),
      breakdown(token, profile.externalId, "country"),
    ]);

    // online_followers: hourly counts (in the account's time zone) for recent days.
    let activeHours: ActiveHours | null = null;
    try {
      const res = await fetchJson<{ data: { values: { value: Record<string, number>; end_time: string }[] }[] }>(
        `${GRAPH}/${profile.externalId}/insights?metric=online_followers&period=lifetime&access_token=${token}`,
      );
      const grid = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
      for (const v of res.data[0]?.values ?? []) {
        const weekday = new Date(v.end_time).getUTCDay();
        for (const [h, n] of Object.entries(v.value ?? {})) grid[weekday][Number(h)] += n;
      }
      const max = Math.max(...grid.flat());
      if (max > 0) activeHours = grid.map((row) => row.map((n) => n / max));
    } catch {
      // not available for this account
    }

    if (!age && !gender && !country && !activeHours) return null;
    return { demographics: { age, gender, country }, activeHours };
  },
};
