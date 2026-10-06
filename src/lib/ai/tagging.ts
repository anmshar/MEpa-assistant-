import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Post } from "../db/schema";
import { FALLBACK, MODEL, anthropic } from "./client";

export const HOOK_TYPES = ["question", "bold_claim", "tutorial", "story", "list", "trend", "behind_the_scenes", "other"] as const;

const TagsSchema = z.object({
  posts: z.array(
    z.object({
      index: z.number().int(),
      topic: z.string().describe("2-3 word topic, lowercase, reused consistently across posts"),
      hookType: z.enum(HOOK_TYPES),
      hasCta: z.boolean().describe("Caption asks viewers to comment, save, share, follow or click"),
    }),
  ),
});

/**
 * Classifies posts by topic, hook style and call-to-action so performance can
 * be broken down by what the content is about, not just its format.
 */
export async function tagPosts(posts: Post[]) {
  const db = await getDb();
  for (let i = 0; i < posts.length; i += 40) {
    const batch = posts.slice(i, i + 40);
    const listing = batch
      .map((p, idx) => `[${idx}] (${p.platform} ${p.format}) ${p.caption.replace(/\s+/g, " ").slice(0, 300) || "(no caption)"}`)
      .join("\n");
    const res = await anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      ...FALLBACK,
      output_config: { effort: "low", format: betaZodOutputFormat(TagsSchema) },
      messages: [
        {
          role: "user",
          content: `Tag each social media post from one creator. Use a small, consistent set of topics across the batch so posts can be grouped.\n\n${listing}`,
        },
      ],
    });
    for (const t of res.parsed_output?.posts ?? []) {
      const post = batch[t.index];
      if (!post) continue;
      await db
        .update(schema.posts)
        .set({ tags: { topic: t.topic, hookType: t.hookType, hasCta: t.hasCta } })
        .where(eq(schema.posts.id, post.id));
    }
  }
}
