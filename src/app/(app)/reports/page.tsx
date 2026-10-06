import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { generateReportAction } from "@/lib/actions";
import { ActionButton } from "@/components/ActionButton";
import { PageHeader } from "@/components/PageHeader";

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function Reports({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const user = await requireUser();
  const { id } = await searchParams;
  const db = await getDb();
  const reports = await db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.userId, user.id))
    .orderBy(desc(schema.reports.createdAt))
    .limit(26);
  const current = reports.find((r) => r.id === id) ?? reports[0];

  return (
    <>
      <PageHeader title="Weekly reports" subtitle="Your manager's honest take on the week, with three priorities.">
        <ActionButton action={generateReportAction} pendingText="Writing your report…">Generate this week&apos;s report</ActionButton>
      </PageHeader>

      {!current ? (
        <div className="card max-w-xl p-6 text-sm text-ink-2">
          No reports yet. Reports are generated every Monday, or click the button to create one now.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
          <article className="card max-w-3xl p-6">
            <p className="text-xs text-ink-3">
              {fmt(current.periodStart)} – {fmt(current.periodEnd)}
            </p>
            <h2 className="mt-1 text-xl font-bold">{current.content.headline}</h2>
            <p className="mt-3 text-ink-2">{current.content.summary}</p>

            <h3 className="mt-6 font-semibold">What went well</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{current.content.wins.map((w, i) => <li key={i}>{w}</li>)}</ul>

            <h3 className="mt-5 font-semibold">Keep an eye on</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{current.content.watchouts.map((w, i) => <li key={i}>{w}</li>)}</ul>

            <h3 className="mt-5 font-semibold">Your priorities this week</h3>
            <ol className="mt-2 space-y-3">
              {current.content.priorities.map((p, i) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-ink">{i + 1}</span>
                  <div>
                    <div className="font-medium">{p.title}</div>
                    <div className="text-sm text-ink-2">{p.why}</div>
                  </div>
                </li>
              ))}
            </ol>
          </article>
          <aside>
            <h3 className="mb-2 text-sm font-semibold text-ink-2">Past reports</h3>
            <ul className="space-y-1 text-sm">
              {reports.map((r) => (
                <li key={r.id}>
                  <a href={`/reports?id=${r.id}`} className={`block rounded-lg px-3 py-2 ${r.id === current.id ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2"}`}>
                    Week ending {fmt(r.periodEnd)}
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </>
  );
}
