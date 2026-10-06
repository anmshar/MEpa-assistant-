import type { ActiveHours, Demographics, Platform, Post } from "../db/schema";

export type TokenSet = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
};

export type RemoteProfile = {
  externalId: string;
  handle: string;
  avatarUrl?: string | null;
  followers: number;
};

export type RemotePost = Omit<Post, "id" | "accountId" | "updatedAt" | "tags">;

export type RemoteAudience = {
  demographics: Demographics;
  activeHours: ActiveHours | null;
};

export interface Connector {
  platform: Platform;
  label: string;
  /** True when the platform app credentials are present in the environment. */
  configured(): boolean;
  authUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;
  /** Returns a fresh token set, or null if the current one is still valid. */
  refreshIfNeeded(tokens: TokenSet): Promise<TokenSet | null>;
  fetchProfile(accessToken: string): Promise<RemoteProfile>;
  fetchPosts(accessToken: string, profile: RemoteProfile): Promise<RemotePost[]>;
  fetchAudience(accessToken: string, profile: RemoteProfile): Promise<RemoteAudience | null>;
}

/** An error from a platform API. `reauth` means the user must reconnect. */
export class PlatformError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reauth = false,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    const msg = JSON.stringify(body).slice(0, 500);
    throw new PlatformError(`${res.status} from ${new URL(url).host}: ${msg}`, res.status, res.status === 401);
  }
  return body as T;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Normalizes a share map so values sum to 1. */
export function normalizeShares(counts: Record<string, number>): Record<string, number> {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total <= 0) return {};
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / total]));
}
