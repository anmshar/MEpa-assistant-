import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { aiConfigured } from "@/lib/ai/client";
import { conversationTranscript } from "@/lib/ai/agent";
import { deleteConversation } from "@/lib/actions";
import { ChatClient } from "../ChatClient";

export default async function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const [c] = await db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, user.id)));
  if (!c) notFound();
  const transcript = await conversationTranscript(id);
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h1 className="truncate font-semibold">{c.title}</h1>
        <form action={deleteConversation}>
          <input type="hidden" name="id" value={id} />
          <button className="text-sm text-ink-3 hover:text-bad">Delete</button>
        </form>
      </div>
      <ChatClient key={id} conversationId={id} initial={transcript} aiReady={aiConfigured()} />
    </>
  );
}
