import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { aiConfigured } from "@/lib/ai/client";
import { generateWeeklyReport } from "@/lib/ai/insights";
import { cronAuthorized } from "../auth";

export const maxDuration = 800;

/** Generates weekly reports for every onboarded creator. Schedule weekly (e.g. Monday 07:00). */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  if (!aiConfigured()) return Response.json({ error: "AI not configured" }, { status: 503 });
  const db = await getDb();
  const creators = await db
    .select({ userId: schema.creatorProfiles.userId })
    .from(schema.creatorProfiles)
    .where(eq(schema.creatorProfiles.onboarded, true));
  const results = { generated: 0, skipped: 0 };
  for (const c of creators) {
    try {
      await generateWeeklyReport(c.userId);
      results.generated++;
    } catch {
      results.skipped++; // e.g. no connected accounts yet
    }
  }
  return Response.json(results);
}
