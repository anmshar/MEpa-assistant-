export const HOOK_LABELS: Record<string, string> = {
  question: "Question",
  bold_claim: "Bold claim",
  tutorial: "Tutorial / how-to",
  story: "Story",
  list: "List",
  trend: "Trend",
  behind_the_scenes: "Behind the scenes",
  other: "Other",
};

export const PLATFORM_LABELS: Record<string, string> = { instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok" };

/** "@handle", without doubling an @ that the platform already includes (YouTube handles start with @). */
export const at = (handle: string) => `@${handle.replace(/^@/, "")}`;

/** Saves are only reported by Instagram. */
export const hasSaves = (platform: string) => platform === "instagram";
