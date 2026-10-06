/**
 * TikTok via Login Kit + Display API. The Display API exposes public video
 * stats (views, likes, comments, shares) but no reach, saves, watch time or
 * audience data, so TikTok insights are thinner than the other platforms.
 */
import {
  type Connector,
  type RemotePost,
  type RemoteProfile,
  type TokenSet,
  fetchJson,
} from "./types";

const API = "https://open.tiktokapis.com/v2";
const SCOPES = ["user.info.basic", "user.info.profile", "user.info.stats", "video.list"];
const MAX_VIDEOS = 100;

const clientKey = () => process.env.TIKTOK_CLIENT_KEY ?? "";
const clientSecret = () => process.env.TIKTOK_CLIENT_SECRET ?? "";

type TikTokToken = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  open_id: string;
};

async function token(params: Record<string, string>): Promise<TokenSet> {
  const t = await fetchJson<TikTokToken>(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: clientKey(), client_secret: clientSecret(), ...params }),
  });
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
  };
}

export const tiktok: Connector = {
  platform: "tiktok",
  label: "TikTok",

  configured: () => Boolean(clientKey() && clientSecret()),

  authUrl(state, redirectUri) {
    const q = new URLSearchParams({
      client_key: clientKey(),
      scope: SCOPES.join(","),
      response_type: "code",
      redirect_uri: redirectUri,
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
  },

  exchangeCode: (code, redirectUri) =>
    token({ code, grant_type: "authorization_code", redirect_uri: redirectUri }),

  async refreshIfNeeded(tokens) {
    if (tokens.expiresAt && tokens.expiresAt.getTime() - Date.now() > 5 * 60 * 1000) return null;
    if (!tokens.refreshToken) return null;
    return token({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
  },

  async fetchProfile(accessToken): Promise<RemoteProfile> {
    const res = await fetchJson<{
      data: { user: { open_id: string; username?: string; display_name: string; avatar_url?: string; follower_count?: number } };
    }>(`${API}/user/info/?fields=open_id,username,display_name,avatar_url,follower_count`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const u = res.data.user;
    return {
      externalId: u.open_id,
      handle: u.username ?? u.display_name,
      avatarUrl: u.avatar_url ?? null,
      followers: u.follower_count ?? 0,
    };
  },

  async fetchPosts(accessToken): Promise<RemotePost[]> {
    type Video = {
      id: string;
      title?: string;
      video_description?: string;
      create_time: number;
      cover_image_url?: string;
      share_url?: string;
      duration?: number;
      view_count?: number;
      like_count?: number;
      comment_count?: number;
      share_count?: number;
    };
    const fields =
      "id,title,video_description,create_time,cover_image_url,share_url,duration,view_count,like_count,comment_count,share_count";
    const videos: Video[] = [];
    let cursor: number | undefined;
    for (;;) {
      const res: { data: { videos: Video[]; cursor: number; has_more: boolean } } = await fetchJson(
        `${API}/video/list/?fields=${fields}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }),
        },
      );
      videos.push(...res.data.videos);
      if (!res.data.has_more || videos.length >= MAX_VIDEOS) break;
      cursor = res.data.cursor;
    }
    return videos.slice(0, MAX_VIDEOS).map((v) => ({
      platform: "tiktok" as const,
      externalId: v.id,
      format: "short" as const,
      caption: v.video_description ?? v.title ?? "",
      permalink: v.share_url ?? null,
      thumbnailUrl: v.cover_image_url ?? null,
      publishedAt: new Date(v.create_time * 1000),
      durationSec: v.duration ?? null,
      views: v.view_count ?? 0,
      reach: 0,
      likes: v.like_count ?? 0,
      comments: v.comment_count ?? 0,
      shares: v.share_count ?? 0,
      saves: 0,
      avgWatchSec: null,
    }));
  },

  // The Display API offers no audience or analytics endpoints.
  fetchAudience: async () => null,
};
