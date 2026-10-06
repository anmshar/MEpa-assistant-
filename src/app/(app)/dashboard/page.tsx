import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadCreatorData, totalFollowersByDay } from "@/lib/data";
import {
  bestPostingTimes,
  breakdown,
  comparePeriods,
  compact,
  engagementRate,
  followerGrowth,
  formatLabel,
  pct,
  rankPosts,
  withinDays,
} from "@/lib/analytics";
import { HOOK_LABELS, at, hasSaves } from "@/lib/labels";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { GrowthChart } from "@/components/charts/GrowthChart";
import { BarList } from "@/components/charts/BarList";
import { Heatmap } from "@/components/charts/Heatmap";

function Delta({ value, kind }: { value: number | null; kind: "pct" | "pts" | "abs" }) {
  if (value == null || !Number.isFinite(value) || value === 0) return <span className="text-xs text-ink-3">no change</span>;
  const up = value > 0;
  const text = kind === "pct" ? pct(Math.abs(value)) : kind === "pts" ? `${(Math.abs(value) * 100).toFixed(1)} pts` : compact(Math.abs(value));
  return (
    <span className={`text-xs font-medium ${up ? "text-good" : "text-bad"}`}>
      {up ? "▲" : "▼"} {text} <span className="font-normal text-ink-3">vs prev. 30d</span>
    </span>
  );
}

function Stat({ label, value, delta }: { label: string; value: string; delta: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-ink-3">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-1">{delta}</div>
    </div>
  );
}

const PROMPTS = [
  "What's working best for me right now?",
  "Plan my posts for next week",
  "Why did my last few posts underperform?",
  "What should I charge for a sponsored reel?",
];

export default async function Dashboard() {
  const user = await requireUser();
  const data = await loadCreatorData(user.id);
  if (!data.profile?.onboarded) redirect("/onboarding");

  if (!data.accounts.length) {
    return (
      <>
        <PageHeader title={`Hi ${data.profile.displayName || user.name}`} />
        <EmptyState
          title="Connect your first account"
          body="Your manager needs your numbers. Connect Instagram, YouTube or TikTok, or try the demo account to look around."
        >
          <Link href="/connections" className="btn btn-primary">Connect accounts</Link>
        </EmptyState>
      </>
    );
  }

  const now = new Date();
  const tz = data.profile.timezone;
  const followers = data.accounts.reduce((a, b) => a + b.followers, 0);
  const daily = totalFollowersByDay(data.snapshots);
  const growth = followerGrowth(daily, 30, now);
  const cmp = comparePeriods(data.posts, 30, now);
  const recent90 = withinDays(data.posts, 90, now);
  const formats = breakdown(recent90, "format", tz);
  const hooks = breakdown(recent90, "hookType", tz);
  const activeHours = data.audience.find((a) => a.activeHours)?.activeHours ?? null;
  const best = bestPostingTimes(withinDays(data.posts, 120, now), activeHours, tz);
  const top = rankPosts(withinDays(data.posts, 30, now), "views", 5);
  const demo = data.accounts.some((a) => a.isDemo);

  return (
    <>
      <PageHeader
        title={`Hi ${data.profile.displayName || user.name}`}
        subtitle={`${data.accounts.map((a) => at(a.handle)).join(" · ")}${demo ? " · demo data" : ""}`}
      >
        <Link href="/chat" className="btn btn-primary">Ask your manager</Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Followers (all platforms)" value={compact(followers)} delta={<Delta value={growth.pct} kind="pct" />} />
        <Stat label="Avg. views per post, 30d" value={compact(cmp.current.avgViews)} delta={<Delta value={cmp.change.avgViews} kind="pct" />} />
        <Stat label="Engagement rate, 30d" value={pct(cmp.current.avgEngagementRate)} delta={<Delta value={cmp.change.avgEngagementRate} kind="pts" />} />
        <Stat label="Posts, 30d" value={String(cmp.current.posts)} delta={<Delta value={cmp.change.posts} kind="abs" />} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2">
          <h2 className="font-semibold">Follower growth, all platforms</h2>
          <p className="mb-3 text-xs text-ink-3">Last 90 days</p>
          <GrowthChart data={daily.slice(-90)} />
        </section>
        <section className="card p-5">
          <h2 className="font-semibold">Ask your manager</h2>
          <div className="mt-3 flex flex-col gap-2">
            {PROMPTS.map((p) => (
              <Link key={p} href={`/chat?q=${encodeURIComponent(p)}`} className="rounded-lg border border-line px-3 py-2 text-sm text-ink-2 hover:bg-surface-2">
                {p}
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold">Average views by format</h2>
          <p className="mb-4 text-xs text-ink-3">Last 90 days</p>
          <BarList
            unit="Average views by format"
            rows={formats.map((r) => ({
              label: formatLabel(r.key as Parameters<typeof formatLabel>[0]),
              value: r.avgViews,
              display: compact(r.avgViews),
              detail: `${r.posts} posts · ${pct(r.avgEngagementRate)} engagement · ${r.viewsLift.toFixed(2)}× your average`,
            }))}
          />
        </section>
        <section className="card p-5">
          <h2 className="font-semibold">Average views by hook style</h2>
          <p className="mb-4 text-xs text-ink-3">Last 90 days, from AI content tags</p>
          <BarList
            unit="Average views by hook style"
            rows={hooks.map((r) => ({
              label: HOOK_LABELS[r.key] ?? r.key,
              value: r.avgViews,
              display: compact(r.avgViews),
              detail: `${r.posts} posts · ${pct(r.avgEngagementRate)} engagement · ${r.viewsLift.toFixed(2)}× your average`,
            }))}
          />
        </section>
      </div>

      <section className="card mt-4 p-5">
        <h2 className="font-semibold">When to post</h2>
        <p className="mb-4 text-xs text-ink-3">
          {activeHours ? "When your audience is online, in your time zone" : "Based on how your posts performed by time of day"} ({tz})
        </p>
        {activeHours ? (
          <Heatmap values={activeHours} best={best} />
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {best.map((s) => (
            <span key={s.label} className="rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent">{s.label}</span>
          ))}
        </div>
      </section>

      <section className="card mt-4 overflow-x-auto p-5">
        <h2 className="mb-3 font-semibold">Top posts, last 30 days</h2>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-3">
              <th className="py-2 font-medium">Post</th>
              <th className="py-2 font-medium">Format</th>
              <th className="py-2 text-right font-medium">Views</th>
              <th className="py-2 text-right font-medium">Engagement</th>
              <th className="py-2 text-right font-medium">Saves</th>
              <th className="py-2 text-right font-medium">Shares</th>
            </tr>
          </thead>
          <tbody>
            {top.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="max-w-xs truncate py-2 pr-3">
                  {p.permalink ? (
                    <a href={p.permalink} target="_blank" rel="noreferrer" className="hover:underline">{p.caption.split("\n")[0]}</a>
                  ) : (
                    p.caption.split("\n")[0]
                  )}
                  <div className="text-xs text-ink-3">
                    {p.platform} · {p.publishedAt.toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short" })}
                  </div>
                </td>
                <td className="py-2">{formatLabel(p.format)}</td>
                <td className="py-2 text-right tabular-nums">{compact(p.views)}</td>
                <td className="py-2 text-right tabular-nums">{pct(engagementRate(p))}</td>
                <td className="py-2 text-right tabular-nums">{hasSaves(p.platform) ? compact(p.saves) : "–"}</td>
                <td className="py-2 text-right tabular-nums">{compact(p.shares)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!top.length && <p className="text-sm text-ink-3">No posts in the last 30 days.</p>}
      </section>
    </>
  );
}
