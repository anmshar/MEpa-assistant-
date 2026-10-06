import { requireUser } from "@/lib/auth";
import { aiConfigured } from "@/lib/ai/client";
import { ChatClient } from "./ChatClient";

export default async function NewChat({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q } = await searchParams;
  return <ChatClient key="new" initial={[]} prompt={q} aiReady={aiConfigured()} />;
}
