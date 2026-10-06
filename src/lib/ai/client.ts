import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.MEPA_MODEL || "claude-opus-5-5";

/**
 * Server-side refusal fallback: if the model declines, the API re-runs the
 * request on Anthropic's recommended fallback model within the same call.
 */
export const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | undefined;

export function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}
