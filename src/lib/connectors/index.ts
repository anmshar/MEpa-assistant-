import type { Platform } from "../db/schema";
import { instagram } from "./instagram";
import { tiktok } from "./tiktok";
import { youtube } from "./youtube";
import type { Connector } from "./types";

export const connectors: Record<Platform, Connector> = { instagram, youtube, tiktok };

export function getConnector(platform: string): Connector | null {
  return (connectors as Record<string, Connector>)[platform] ?? null;
}

export function redirectUri(platform: Platform): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/connect/${platform}/callback`;
}
