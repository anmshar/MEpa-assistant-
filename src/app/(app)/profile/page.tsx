import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getOrCreateProfile } from "@/lib/data";
import { getDb, schema } from "@/lib/db";
import { deleteMyAccount, logout } from "@/lib/actions";
import { PageHeader } from "@/components/PageHeader";
import { ProfileForm } from "@/components/ProfileForm";
import { SubmitButton } from "@/components/SubmitButton";

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getOrCreateProfile(user.id, user.name);
  const db = await getDb();
  const memories = await db
    .select()
    .from(schema.memoryFacts)
    .where(eq(schema.memoryFacts.userId, user.id))
    .orderBy(desc(schema.memoryFacts.createdAt));
  return (
    <>
      <PageHeader title="Your profile" subtitle="What your AI manager knows about you.">
        <form action={logout}>
          <button className="btn btn-ghost">Log out</button>
        </form>
      </PageHeader>
      <ProfileForm profile={profile} />

      <section className="card mt-6 max-w-2xl p-6">
        <h2 className="font-semibold">What your manager remembers</h2>
        <p className="mt-1 text-sm text-ink-2">Facts saved from your conversations.</p>
        {memories.length ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {memories.map((m) => <li key={m.id}>{m.fact}</li>)}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-3">Nothing yet.</p>
        )}
      </section>

      <section className="card mt-6 max-w-2xl border-bad/40 p-6">
        <h2 className="font-semibold text-bad">Delete account</h2>
        <p className="mt-1 text-sm text-ink-2">
          Permanently deletes your account, connected accounts, synced data, conversations, plans and reports.
        </p>
        <form action={deleteMyAccount} className="mt-3 flex flex-wrap gap-2">
          <input className="input max-w-48" name="confirm" placeholder="Type DELETE" required pattern="DELETE" />
          <SubmitButton variant="ghost" pendingText="Deleting…">Delete everything</SubmitButton>
        </form>
      </section>
    </>
  );
}
