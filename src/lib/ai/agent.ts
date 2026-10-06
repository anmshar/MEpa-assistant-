import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { loadCreatorData } from "../data";
import { FALLBACK, MODEL, anthropic } from "./client";
import { MANAGER_SYSTEM, creatorContext } from "./prompts";
import { runTool, toolDefinitions, type ToolContext } from "./tools";

export type ChatEvent =
  | { type: "conversation"; id: string }
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "error"; message: string }
  | { type: "done" };

const MAX_TURNS = 10;

type Param = Anthropic.Beta.BetaMessageParam;

async function appendMessage(conversationId: string, role: "user" | "assistant", content: Param["content"]) {
  const db = await getDb();
  // seq is per-conversation and strictly increasing so replayed history is byte-identical.
  await db.insert(schema.chatMessages).values({
    conversationId,
    role,
    content,
    seq: sql`(select coalesce(max(seq), 0) + 1 from ${schema.chatMessages} where conversation_id = ${conversationId})`,
  });
}

export async function createConversation(userId: string, firstMessage: string) {
  const db = await getDb();
  const title = firstMessage.replace(/\s+/g, " ").trim().slice(0, 60) || "New conversation";
  const [c] = await db.insert(schema.conversations).values({ userId, title }).returning();
  return c;
}

/**
 * Runs one creator message through the manager agent: a streaming tool-use loop
 * over the creator's data. Every turn (user text, assistant blocks including
 * thinking, tool results) is stored verbatim, so the history replayed next time
 * is append-only.
 */
export async function runChat(opts: {
  userId: string;
  conversationId: string;
  message: string;
  emit: (e: ChatEvent) => void;
  signal?: AbortSignal;
}) {
  const { userId, conversationId, emit } = opts;
  const db = await getDb();

  const [data, memories, stored] = await Promise.all([
    loadCreatorData(userId),
    db
      .select({ fact: schema.memoryFacts.fact })
      .from(schema.memoryFacts)
      .where(eq(schema.memoryFacts.userId, userId))
      .orderBy(desc(schema.memoryFacts.createdAt))
      .limit(50),
    db
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.conversationId, conversationId))
      .orderBy(asc(schema.chatMessages.seq)),
  ]);

  const now = new Date();
  const ctx: ToolContext = { userId, timeZone: data.profile?.timezone || "UTC", now, data };
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: MANAGER_SYSTEM, cache_control: { type: "ephemeral" } },
    { type: "text", text: creatorContext(data.profile, data, memories.map((m) => m.fact).reverse(), now) },
  ];
  const tools = toolDefinitions();

  const messages: Param[] = stored.map((m) => ({ role: m.role, content: m.content as Param["content"] }));
  const userTurn: Param = { role: "user", content: [{ type: "text", text: opts.message }] };
  messages.push(userTurn);
  await appendMessage(conversationId, "user", userTurn.content);

  let parseRetries = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = anthropic().beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 16000,
        ...FALLBACK,
        output_config: { effort: "medium" },
        system,
        tools,
        messages,
        // Caches the whole conversation prefix so each tool-loop turn only pays for new tokens.
        cache_control: { type: "ephemeral" },
      },
      { signal: opts.signal },
    );
    stream.on("text", (text) => emit({ type: "text", text }));
    stream.on("streamEvent", (event) => {
      if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        emit({ type: "tool", name: event.content_block.name });
      }
    });

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      parseRetries = 0;
    } catch (err) {
      // With eager input streaming a tool input can arrive as unparseable JSON; re-issue that turn.
      if (err instanceof Anthropic.APIError || opts.signal?.aborted || parseRetries++ >= 2) throw err;
      continue;
    }

    if (message.stop_reason === "refusal") {
      emit({ type: "text", text: "\n\nI can't help with that one, but I'm happy to help with anything else for your channels." });
      break;
    }
    if (message.content.length === 0) break;

    messages.push({ role: "assistant", content: message.content as Param["content"] });
    await appendMessage(conversationId, "assistant", message.content as Param["content"]);

    if (message.stop_reason === "pause_turn") continue;

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) break;
    if (message.stop_reason === "max_tokens") {
      emit({ type: "error", message: "The reply was cut off. Please try a narrower question." });
      break;
    }

    // Run all tool calls from this turn, then return every result in a single user message.
    const results = await Promise.all(
      toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        const r = await runTool(ctx, t.name, t.input);
        return { type: "tool_result", tool_use_id: t.id, content: r.content, ...(r.isError ? { is_error: true } : {}) };
      }),
    );
    const toolTurn: Param = { role: "user", content: results };
    messages.push(toolTurn);
    await appendMessage(conversationId, "user", toolTurn.content);
  }

  await db.update(schema.conversations).set({ updatedAt: new Date() }).where(eq(schema.conversations.id, conversationId));
}

/** Text-only view of a stored conversation for the chat UI. */
export async function conversationTranscript(conversationId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.conversationId, conversationId))
    .orderBy(asc(schema.chatMessages.seq));

  const out: { role: "user" | "assistant"; text: string }[] = [];
  for (const row of rows) {
    const blocks = Array.isArray(row.content) ? (row.content as { type: string; text?: string }[]) : [];
    const text = blocks
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join("");
    if (!text) continue; // tool calls and tool results are not shown
    const last = out.at(-1);
    if (last && last.role === row.role) last.text += `\n\n${text}`;
    else out.push({ role: row.role, text });
  }
  return out;
}
