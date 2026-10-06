"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Markdown } from "@/components/Markdown";

type Msg = { role: "user" | "assistant"; text: string };

const TOOL_LABELS: Record<string, string> = {
  get_overview: "Checking your accounts",
  get_posts: "Looking at your posts",
  get_breakdown: "Finding patterns",
  compare_periods: "Comparing periods",
  get_audience: "Checking your audience",
  get_best_posting_times: "Working out the best times",
  estimate_rates: "Benchmarking your rates",
  get_content_plan: "Reading your plan",
  add_content_ideas: "Saving ideas to your plan",
  remember: "Making a note",
  get_latest_report: "Reading your latest report",
};

const STARTERS = [
  "What's working best for me right now?",
  "Plan my posts for next week and save them",
  "Which of my posts should I remake, and how?",
  "A brand offered €300 for a reel. Is that fair?",
];

export function ChatClient({
  conversationId: initialId,
  initial,
  prompt,
  aiReady,
}: {
  conversationId?: string;
  initial: Msg[];
  prompt?: string;
  aiReady: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(initialId);
  const endRef = useRef<HTMLDivElement>(null);
  const sentPrompt = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setError(null);
    setInput("");
    setBusy(true);
    setStatus("Thinking");
    setMessages((m) => [...m, { role: "user", text: message }, { role: "assistant", text: "" }]);

    const appendText = (t: string) =>
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { ...last, text: last.text + t };
        return copy;
      });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: idRef.current, message }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const raw of events) {
          if (!raw.startsWith("data: ")) continue;
          const e = JSON.parse(raw.slice(6));
          if (e.type === "conversation" && !idRef.current) {
            idRef.current = e.id;
            window.history.replaceState(null, "", `/chat/${e.id}`);
          } else if (e.type === "text") {
            setStatus(null);
            appendText(e.text);
          } else if (e.type === "tool") {
            setStatus(TOOL_LABELS[e.name] ?? "Working");
          } else if (e.type === "error") {
            setError(e.message);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
      setStatus(null);
      setMessages((m) => (m.at(-1)?.role === "assistant" && !m.at(-1)?.text ? m.slice(0, -1) : m));
      router.refresh();
    }
  }

  useEffect(() => {
    if (prompt && !sentPrompt.current && aiReady && initial.length === 0) {
      sentPrompt.current = true;
      void send(prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-[70vh] flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="mx-auto max-w-xl pt-10 text-center">
            <h1 className="text-2xl font-bold">What can I help with?</h1>
            <p className="mt-2 text-sm text-ink-2">I can see your connected accounts. Ask me about your content, growth, audience or brand deals.</p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => send(s)} disabled={!aiReady} className="rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm text-ink-2 hover:bg-surface-2">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-accent px-4 py-2.5 text-[0.94rem] text-accent-ink">{m.text}</div>
            </div>
          ) : m.text ? (
            <div key={i} className="max-w-[92%] rounded-2xl border border-line bg-surface px-4 py-3">
              <Markdown>{m.text}</Markdown>
            </div>
          ) : null,
        )}
        {status && (
          <div className="flex items-center gap-2 text-sm text-ink-3">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
            {status}…
          </div>
        )}
        {error && <div className="rounded-lg border border-bad/40 px-4 py-2 text-sm text-bad">{error}</div>}
        <div ref={endRef} />
      </div>

      {!aiReady && (
        <p className="mb-2 rounded-lg bg-surface-2 px-4 py-2 text-sm text-ink-2">
          The AI manager isn&apos;t configured on this server yet (ANTHROPIC_API_KEY is missing).
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="sticky bottom-0 flex gap-2 bg-bg pt-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={2}
          placeholder="Ask your manager anything…"
          className="input flex-1 resize-none"
          disabled={!aiReady}
        />
        <button type="submit" className="btn btn-primary self-end" disabled={busy || !input.trim() || !aiReady}>
          Send
        </button>
      </form>
      <p className="mt-2 text-center text-xs text-ink-3">MEpa is an AI. Double-check important decisions, especially contracts and money.</p>
    </div>
  );
}
