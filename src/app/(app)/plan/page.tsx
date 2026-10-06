import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getOrCreateProfile } from "@/lib/data";
import type { ContentIdea } from "@/lib/db/schema";
import { generatePlanAction, setIdeaStatus } from "@/lib/actions";
import { formatLabel } from "@/lib/analytics";
import { PLATFORM_LABELS } from "@/lib/labels";
import { ActionButton } from "@/components/ActionButton";
import { PageHeader } from "@/components/PageHeader";

function IdeaCard({ idea, tz }: { idea: ContentIdea; tz: string }) {
  const statusButton = (status: string, label: string) => (
    <form action={setIdeaStatus}>
      <input type="hidden" name="id" value={idea.id} />
      <input type="hidden" name="status" value={status} />
      <button className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 hover:bg-surface-2">{label}</button>
    </form>
  );
  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">
          {PLATFORM_LABELS[idea.platform]} · {formatLabel(idea.format)}
        </span>
        {idea.scheduledFor && (
          <span className="text-ink-3">
            {idea.scheduledFor.toLocaleString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      <h3 className="mt-2 font-semibold">{idea.title}</h3>
      {idea.hook && <p className="mt-2 text-sm"><span className="font-medium text-ink-2">Hook: </span>“{idea.hook}”</p>}
      {idea.description && <p className="mt-2 whitespace-pre-line text-sm text-ink-2">{idea.description}</p>}
      {idea.caption && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-ink-3">Caption & hashtags</summary>
          <p className="mt-2 whitespace-pre-line">{idea.caption}</p>
          <p className="mt-1 text-accent">{idea.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
        </details>
      )}
      {idea.rationale && <p className="mt-3 border-l-2 border-accent pl-3 text-xs text-ink-2">Why: {idea.rationale}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {statusButton("posted", "✓ Posted")}
        {statusButton("dismissed", "Dismiss")}
      </div>
    </article>
  );
}

export default async function Plan() {
  const user = await requireUser();
  const profile = await getOrCreateProfile(user.id, user.name);
  const db = await getDb();
  const ideas = await db
    .select()
    .from(schema.contentIdeas)
    .where(and(eq(schema.contentIdeas.userId, user.id), inArray(schema.contentIdeas.status, ["idea", "scheduled"])))
    .orderBy(asc(schema.contentIdeas.scheduledFor), desc(schema.contentIdeas.createdAt));
  const scheduled = ideas.filter((i) => i.scheduledFor);
  const loose = ideas.filter((i) => !i.scheduledFor);

  return (
    <>
      <PageHeader title="Content plan" subtitle="Your upcoming posts, built from what's working in your data.">
        <ActionButton action={generatePlanAction} pendingText="Planning your week…">Plan my next 7 days</ActionButton>
      </PageHeader>

      {ideas.length === 0 ? (
        <div className="card max-w-xl p-6 text-sm text-ink-2">
          Nothing planned yet. Click <strong>Plan my next 7 days</strong>, or{" "}
          <Link href="/chat?q=Give%20me%20content%20ideas%20for%20this%20week%20and%20save%20them%20to%20my%20plan" className="text-accent underline">
            brainstorm with your manager
          </Link>
          .
        </div>
      ) : (
        <div className="space-y-8">
          {scheduled.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-ink-2">Scheduled</h2>
              <div className="grid gap-4 lg:grid-cols-2">{scheduled.map((i) => <IdeaCard key={i.id} idea={i} tz={profile.timezone} />)}</div>
            </section>
          )}
          {loose.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-ink-2">Idea backlog</h2>
              <div className="grid gap-4 lg:grid-cols-2">{loose.map((i) => <IdeaCard key={i.id} idea={i} tz={profile.timezone} />)}</div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
