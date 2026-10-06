import { getDb, schema } from "@/lib/db";
import { syncAccount } from "@/lib/sync";
import { cronAuthorized } from "../auth";

export const maxDuration = 800;

/** Re-syncs every connected account. Schedule daily (Authorization: Bearer CRON_SECRET). */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  const db = await getDb();
  const accounts = await db.select({ id: schema.accounts.id }).from(schema.accounts);
  let ok = 0;
  for (const a of accounts) if ((await syncAccount(a.id)).ok) ok++;
  return Response.json({ accounts: accounts.length, ok });
}
