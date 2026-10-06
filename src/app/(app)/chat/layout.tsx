import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const db = await getDb();
  const conversations = await db
    .select({ id: schema.conversations.id, title: schema.conversations.title })
    .from(schema.conversations)
    .where(eq(schema.conversations.userId, user.id))
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(40);
  return (
    <div className="flex gap-6 lg:h-[calc(100vh-3rem)]">
      <aside className="hidden w-56 shrink-0 overflow-y-auto lg:block">
        <Link href="/chat" className="btn btn-ghost mb-3 w-full">+ New conversation</Link>
        <ul className="space-y-1">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link href={`/chat/${c.id}`} className="block truncate rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-2">
                {c.title}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
