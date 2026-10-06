import { and, eq } from "drizzle-orm";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { aiConfigured } from "@/lib/ai/client";
import { createConversation, runChat, type ChatEvent } from "@/lib/ai/agent";

export const maxDuration = 300;

const Body = z.object({
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(8000),
});

/** Streams the AI manager's reply as server-sent events. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!aiConfigured()) return Response.json({ error: "AI is not configured (ANTHROPIC_API_KEY)." }, { status: 503 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { message } = parsed.data;

  const db = await getDb();
  let conversationId = parsed.data.conversationId;
  if (conversationId) {
    const [c] = await db
      .select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, user.id)));
    if (!c) return Response.json({ error: "Conversation not found" }, { status: 404 });
  } else {
    conversationId = (await createConversation(user.id, message)).id;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ChatEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      emit({ type: "conversation", id: conversationId });
      try {
        await runChat({ userId: user.id, conversationId, message, emit, signal: req.signal });
        emit({ type: "done" });
      } catch (err) {
        console.error("chat failed", err);
        const msg =
          err instanceof Anthropic.RateLimitError
            ? "I'm getting a lot of requests right now. Please try again in a minute."
            : err instanceof Anthropic.APIError
              ? `The AI service returned an error (${err.status ?? "network"}). Please try again.`
              : "Something went wrong. Please try again.";
        emit({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
