/**
 * YouTube via Google OAuth: YouTube Data API v3 for the channel and videos,
 * YouTube Analytics API for per-video watch time, shares and audience data.
 */
import type { PostFormat } from "../db/schema";
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

const DATA = "https://www.googleapis.com/youtube/v3";
const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];
const MAX_VIDEOS = 100;

const clientId = () => process.env.GOOGLE_CLIENT_ID ?? "";
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET ?? "";
const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

type GoogleToken = { access_token: string; refresh_token?: string; expires_in: number };

/** ISO 8601 duration (PT1H2M3S) -> seconds */
export function parseIsoDuration(iso: string): number {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

type AnalyticsReport = { columnHeaders: { name: string }[]; rows?: (string | number)[][] };

async function report(token: string, params: Record<string, string>): Promise<AnalyticsReport | null> {
  const q = new URLSearchParams({ ids: "channel==MINE", ...params });
  try {
    return await fetchJson<AnalyticsReport>(`${ANALYTICS}?${q}`, auth(token));
  } catch {
    return null;
  }
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export const youtube: Connector = {
  platform: "youtube",
  label: "YouTube",

  configured: () => Boolean(clientId() && clientSecret()),

  authUrl(state, redirectUri) {
    const q = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  },

  async exchangeCode(code, redirectUri): Promise<TokenSet> {
    const t = await fetchJson<GoogleToken>("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        code,
        client_id: clientId(),
        client_secret: clientSecret(),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? null,
      expiresAt: new Date(Date.now() + t.expires_in * 1000),
    };
  },

  async refreshIfNeeded(tokens) {
    if (tokens.expiresAt && tokens.expiresAt.getTime() - Date.now() > 5 * 60 * 1000) return null;
    if (!tokens.refreshToken) return null;
    const t = await fetchJson<GoogleToken>("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: clientId(),
        client_secret: clientSecret(),
        refresh_token: tokens.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? tokens.refreshToken,
      expiresAt: new Date(Date.now() + t.expires_in * 1000),
    };
  },

  async fetchProfile(token): Promise<RemoteProfile> {
    const res = await fetchJson<{
      items?: {
        id: string;
        snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } };
        statistics: { subscriberCount?: string };
      }[];
    }>(`${DATA}/channels?part=snippet,statistics&mine=true`, auth(token));
    const ch = res.items?.[0];
    if (!ch) throw new Error("This Google account has no YouTube channel.");
    return {
      externalId: ch.id,
      handle: ch.snippet.customUrl ?? ch.snippet.title,
      avatarUrl: ch.snippet.thumbnails?.default?.url ?? null,
      followers: Number(ch.statistics.subscriberCount ?? 0),
    };
  },

  async fetchPosts(token, profile): Promise<RemotePost[]> {
    // Every channel's uploads playlist is its id with "UC" replaced by "UU".
    const uploads = profile.externalId.replace(/^UC/, "UU");
    const ids: string[] = [];
    let pageToken = "";
    do {
      const page = await fetchJson<{
        items: { contentDetails: { videoId: string } }[];
        nextPageToken?: string;
      }>(
        `${DATA}/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}${pageToken ? `&pageToken=${pageToken}` : ""}`,
        auth(token),
      );
      ids.push(...page.items.map((i) => i.contentDetails.videoId));
      pageToken = page.nextPageToken ?? "";
    } while (pageToken && ids.length < MAX_VIDEOS);

    type Video = {
      id: string;
      snippet: { title: string; description: string; publishedAt: string; thumbnails?: { medium?: { url: string } } };
      statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails: { duration: string };
    };
    const videos: Video[] = [];
    for (let i = 0; i < Math.min(ids.length, MAX_VIDEOS); i += 50) {
      const batch = ids.slice(i, i + 50).join(",");
      const res = await fetchJson<{ items: Video[] }>(
        `${DATA}/videos?part=snippet,statistics,contentDetails&id=${batch}`,
        auth(token),
      );
      videos.push(...res.items);
    }

    // Per-video shares and average view duration over the channel lifetime window we care about.
    const perVideo = new Map<string, { shares: number; avgDuration: number }>();
    const oldest = videos.reduce((min, v) => Math.min(min, Date.parse(v.snippet.publishedAt)), Date.now());
    const rep = await report(token, {
      startDate: isoDay(new Date(oldest - DAY_MS)),
      endDate: isoDay(new Date()),
      metrics: "views,shares,averageViewDuration",
      dimensions: "video",
      sort: "-views",
      maxResults: "200",
    });
    if (rep?.rows) {
      const col = (n: string) => rep.columnHeaders.findIndex((h) => h.name === n);
      for (const row of rep.rows) {
        perVideo.set(String(row[col("video")]), {
          shares: Number(row[col("shares")] ?? 0),
          avgDuration: Number(row[col("averageViewDuration")] ?? 0),
        });
      }
    }

    return videos.map((v) => {
      const duration = parseIsoDuration(v.contentDetails.duration);
      // Shorts are vertical videos up to 3 minutes; duration is the best signal the API gives.
      const format: PostFormat = duration > 0 && duration <= 180 ? "short" : "video";
      const a = perVideo.get(v.id);
      return {
        platform: "youtube" as const,
        externalId: v.id,
        format,
        caption: `${v.snippet.title}\n\n${v.snippet.description}`.slice(0, 2000),
        permalink: format === "short" ? `https://youtube.com/shorts/${v.id}` : `https://youtu.be/${v.id}`,
        thumbnailUrl: v.snippet.thumbnails?.medium?.url ?? null,
        publishedAt: new Date(v.snippet.publishedAt),
        durationSec: duration,
        views: Number(v.statistics.viewCount ?? 0),
        reach: 0,
        likes: Number(v.statistics.likeCount ?? 0),
        comments: Number(v.statistics.commentCount ?? 0),
        shares: a?.shares ?? 0,
        saves: 0,
        avgWatchSec: a?.avgDuration ?? null,
      };
    });
  },

  async fetchAudience(token): Promise<RemoteAudience | null> {
    const window = { startDate: isoDay(new Date(Date.now() - 90 * DAY_MS)), endDate: isoDay(new Date()) };
    const [ageGender, countries] = await Promise.all([
      report(token, { ...window, metrics: "viewerPercentage", dimensions: "ageGroup,gender" }),
      report(token, { ...window, metrics: "views", dimensions: "country", sort: "-views", maxResults: "15" }),
    ]);
    const age: Record<string, number> = {};
    const gender: Record<string, number> = {};
    for (const [ageGroup, g, share] of ageGender?.rows ?? []) {
      const a = String(ageGroup).replace("age", "");
      age[a] = (age[a] ?? 0) + Number(share);
      gender[String(g)] = (gender[String(g)] ?? 0) + Number(share);
    }
    const country = Object.fromEntries((countries?.rows ?? []).map(([c, v]) => [String(c), Number(v)]));
    if (!Object.keys(age).length && !Object.keys(country).length) return null;
    return {
      demographics: { age: normalizeShares(age), gender: normalizeShares(gender), country: normalizeShares(country) },
      activeHours: null, // YouTube Analytics does not expose when viewers are online
    };
  },
};
