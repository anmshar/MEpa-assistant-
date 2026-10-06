import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { loadCreatorData } from "@/lib/data";
import { MediaKitView } from "@/components/MediaKitView";

export const dynamic = "force-dynamic";

export default async function PublicKit({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getDb();
  const [profile] = await db.select().from(schema.creatorProfiles).where(eq(schema.creatorProfiles.mediaKitSlug, slug));
  if (!profile?.mediaKitPublic) notFound();
  const [user] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, profile.userId));
  const data = await loadCreatorData(profile.userId);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <MediaKitView data={data} name={user?.name ?? ""} showRates={profile.mediaKitShowRates} />
      <p className="mt-10 text-center text-xs text-ink-3">Stats update automatically · Made with MEpa</p>
    </div>
  );
}
