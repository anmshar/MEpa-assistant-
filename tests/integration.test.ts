import { beforeAll, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";

// A scripted stand-in for the Claude API: first turn calls a tool, second turn answers.
const requests: { messages: unknown[]; tools: { name: string }[] }[] = [];
const script = [
  {
    stop_reason: "tool_use",
    content: [
      { type: "text", text: "Let me check." },
      { type: "tool_use", id: "toolu_1", name: "get_breakdown", input: { dimension: "hookType" } },
    ],
  },
  { stop_reason: "end_turn", content: [{ type: "text", text: "Tutorial hooks are your best performers." }] },
];

vi.mock("@/lib/ai/client", () => ({
  MODEL: "test-model",
  FALLBACK: { betas: [], fallbacks: "default" },
  aiConfigured: () => true,
  anthropic: () => ({
    beta: {
      messages: {
        stream: (params: { messages: unknown[]; tools: { name: string }[] }) => {
          requests.push(structuredClone(params));
          const msg = script[requests.length - 1];
          const handlers: Record<string, ((x: unknown) => void)[]> = {};
          return {
            on(event: string, cb: (x: unknown) => void) {
              (handlers[event] ??= []).push(cb);
              return this;
            },
            async finalMessage() {
              for (const b of msg.content) {
                if (b.type === "text") handlers.text?.forEach((cb) => cb(b.text));
                if (b.type === "tool_use") handlers.streamEvent?.forEach((cb) => cb({ type: "content_block_start", content_block: b }));
              }
              return msg;
            },
          };
        },
      },
    },
  }),
}));

const { getDb, schema } = await import("@/lib/db");
const { connectDemo } = await import("@/lib/sync");
const { loadCreatorData } = await import("@/lib/data");
const { runTool, toolDefinitions } = await import("@/lib/ai/tools");
const { runChat, createConversation, conversationTranscript } = await import("@/lib/ai/agent");

let userId: string;

beforeAll(async () => {
  const db = await getDb();
  const [u] = await db.insert(schema.users).values({ email: "mia@example.com", name: "Mia", passwordHash: "x" }).returning();
  userId = u.id;
  await db.insert(schema.creatorProfiles).values({ userId, displayName: "Mia", niche: "home fitness", onboarded: true });
  await connectDemo(userId);
});

describe("demo account sync", () => {
  it("creates accounts with posts, snapshots and audience", async () => {
    const data = await loadCreatorData(userId);
    expect(data.accounts.map((a) => a.platform).sort()).toEqual(["instagram", "youtube"]);
    expect(data.posts.length).toBeGreaterThan(60);
    expect(data.snapshots.length).toBeGreaterThan(200);
    expect(data.audience).toHaveLength(2);
    expect(data.accounts.every((a) => a.status === "active" && a.lastSyncedAt)).toBe(true);
  });

  it("is idempotent", async () => {
    const before = (await loadCreatorData(userId)).posts.length;
    await connectDemo(userId);
    const after = await loadCreatorData(userId);
    expect(after.accounts).toHaveLength(2);
    expect(after.posts.length).toBe(before);
  });
});

describe("AI manager tools", () => {
  const ctx = async () => ({ userId, timeZone: "Europe/Berlin", now: new Date(), data: await loadCreatorData(userId) });

  it("exposes valid tool definitions", () => {
    const defs = toolDefinitions();
    expect(defs.length).toBeGreaterThan(8);
    for (const d of defs) {
      expect(d.input_schema.type).toBe("object");
      expect(d.input_schema).not.toHaveProperty("$schema");
    }
    // Defaulted fields must stay optional for the model.
    const getPosts = defs.find((d) => d.name === "get_posts")!;
    expect(getPosts.input_schema.required ?? []).not.toContain("days");
  });

  it("returns real numbers from the overview and breakdown tools", async () => {
    const overview = JSON.parse((await runTool(await ctx(), "get_overview", {})).content);
    expect(overview.accounts).toHaveLength(2);
    expect(overview.accounts[0].followers).toBeGreaterThan(1000);
    const res = await runTool(await ctx(), "get_breakdown", { dimension: "format", platform: "instagram" });
    expect(res.isError).toBe(false);
    expect(JSON.parse(res.content).rows.length).toBeGreaterThan(1);
  });

  it("rejects invalid input instead of running the tool", async () => {
    const res = await runTool(await ctx(), "get_breakdown", { dimension: "vibes" });
    expect(res.isError).toBe(true);
    expect((await runTool(await ctx(), "nope", {})).isError).toBe(true);
  });

  it("saves content ideas and memories", async () => {
    const c = await ctx();
    const saved = await runTool(c, "add_content_ideas", {
      ideas: [
        {
          title: "Hip mobility in 8 minutes",
          platform: "instagram",
          format: "reel",
          hook: "Sitting all day? Save this.",
          description: "Follow-along routine",
          caption: "Try it tonight",
          hashtags: ["mobility"],
          rationale: "Mobility posts get 1.3x views",
          scheduled_for: "2026-10-08 19:00",
        },
      ],
    });
    expect(JSON.parse(saved.content)).toEqual({ saved: 1 });
    const plan = JSON.parse((await runTool(c, "get_content_plan", {})).content);
    expect(plan[0]).toMatchObject({ title: "Hip mobility in 8 minutes", status: "scheduled" });
    await runTool(c, "remember", { fact: "Launching a course in December" });
    const db = await getDb();
    const facts = await db.select().from(schema.memoryFacts).where(eq(schema.memoryFacts.userId, userId));
    expect(facts.map((f) => f.fact)).toContain("Launching a course in December");
  });
});

describe("chat loop", () => {
  it("runs tools, streams text and stores an append-only history", async () => {
    const conv = await createConversation(userId, "What's working?");
    const events: { type: string }[] = [];
    await runChat({ userId, conversationId: conv.id, message: "What's working?", emit: (e) => events.push(e) });

    expect(events).toContainEqual({ type: "tool", name: "get_breakdown" });
    expect(events.filter((e) => e.type === "text").length).toBe(2);

    // Second request = first request + assistant turn + tool results (append-only).
    expect(requests).toHaveLength(2);
    const [first, second] = requests;
    expect(second.messages.slice(0, first.messages.length)).toEqual(first.messages);
    const toolResult = second.messages.at(-1) as { content: { type: string; is_error?: boolean; content: string }[] };
    expect(toolResult.content[0].type).toBe("tool_result");
    expect(toolResult.content[0].is_error).toBeUndefined();
    expect(JSON.parse(toolResult.content[0].content).rows.length).toBeGreaterThan(0);

    const db = await getDb();
    const stored = await db
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.conversationId, conv.id))
      .orderBy(asc(schema.chatMessages.seq));
    expect(stored.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(stored.map((m) => m.seq)).toEqual([1, 2, 3, 4]);

    const transcript = await conversationTranscript(conv.id);
    expect(transcript).toEqual([
      { role: "user", text: "What's working?" },
      { role: "assistant", text: "Let me check.\n\nTutorial hooks are your best performers." },
    ]);
  });
});
