import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";

const FEATURES = [
  {
    title: "Knows your numbers",
    body: "Connect Instagram, YouTube and TikTok. MEpa reads your real performance and finds what works for you, not generic advice.",
  },
  {
    title: "Tells you what to post",
    body: "A weekly content plan with hooks, captions and the best slots, built on your top-performing formats and topics.",
  },
  {
    title: "Always reachable",
    body: "Ask anything, any time: \"Why did this reel flop?\", \"What should I charge this brand?\", \"Plan my week.\"",
  },
  {
    title: "Weekly manager report",
    body: "Every Monday: what went well, what to watch, and your three priorities for the week.",
  },
  {
    title: "Media kit that updates itself",
    body: "A shareable page with your live stats, audience and suggested rates for brand pitches.",
  },
  {
    title: "Yours, privately",
    body: "Read-only access by default, EU data hosting, and one click to disconnect or delete everything.",
  },
];

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <Logo />
        <div className="flex gap-2">
          {user ? (
            <Link href="/dashboard" className="btn btn-primary">Open dashboard</Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost">Log in</Link>
              <Link href="/signup" className="btn btn-primary">Start free</Link>
            </>
          )}
        </div>
      </header>

      <section className="py-16 text-center sm:py-24">
        <p className="mb-4 text-sm font-semibold text-accent">The AI manager for creators</p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          The manager who knows your numbers.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-2">
          MEpa connects to your accounts and works for you around the clock: what to post, when to post it, what is
          working, and what to charge. No 20% commission.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href={user ? "/dashboard" : "/signup"} className="btn btn-primary px-6 py-3 text-base">
            {user ? "Go to dashboard" : "Get started, it's free"}
          </Link>
        </div>
        <p className="mt-3 text-sm text-ink-3">Try it instantly with a demo account, no connection needed.</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="card p-5">
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-ink-2">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-16 flex justify-between border-t border-line py-6 text-sm text-ink-3">
        <span>© {new Date().getFullYear()} MEpa</span>
        <Link href="/privacy" className="hover:text-ink">Privacy</Link>
      </footer>
    </div>
  );
}
