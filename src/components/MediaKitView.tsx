import type { CreatorData } from "@/lib/data";
import { compact, engagementRate, estimateRate, pct, rankPosts, summarize, withinDays } from "@/lib/analytics";
import { PLATFORM_LABELS, at } from "@/lib/labels";

const top = (m: Record<string, number> | undefined, n: number) =>
  Object.entries(m ?? {})
    .filter(([k]) => k !== "other")
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);

const COUNTRY = new Intl.DisplayNames(["en"], { type: "region" });
const countryName = (code: string) => {
  try {
    return COUNTRY.of(code) ?? code;
  } catch {
    return code;
  }
};

/** Brand-facing summary of a creator, built from live synced data. */
export function MediaKitView({ data, name, showRates }: { data: CreatorData; name: string; showRates: boolean }) {
  const now = new Date();
  const p = data.profile;
  const platforms = [...new Set(data.accounts.map((a) => a.platform))];
  const total = data.accounts.reduce((a, b) => a + b.followers, 0);
  const recent = withinDays(data.posts, 90, now);
  const all = summarize(recent);
  const audience = data.audience[0]?.demographics;
  const best = rankPosts(recent, "views", 3);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{p?.displayName || name}</h1>
        {p?.niche && <p className="mt-1 text-ink-2">{p.niche}</p>}
        {p?.bio && <p className="mt-4 max-w-2xl whitespace-pre-line">{p.bio}</p>}
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Total audience", compact(total)],
          ["Avg. views / post", compact(all.avgViews)],
          ["Engagement rate", pct(all.avgEngagementRate)],
          ["Posts (90 days)", String(all.posts)],
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <div className="text-xs text-ink-3">{label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-semibold">Platforms</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-3">
                <th className="py-1 font-medium">Platform</th>
                <th className="py-1 pl-3 text-right font-medium whitespace-nowrap">Followers</th>
                <th className="py-1 pl-3 text-right font-medium whitespace-nowrap">Avg. views</th>
                <th className="py-1 pl-3 text-right font-medium whitespace-nowrap">Engagement</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => {
                const s = summarize(recent.filter((x) => x.accountId === a.id));
                return (
                  <tr key={a.id} className="border-t border-line">
                    <td className="py-2">
                      {PLATFORM_LABELS[a.platform]} <span className="block text-xs text-ink-3">{at(a.handle)}</span>
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums">{compact(a.followers)}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">{compact(s.avgViews)}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">{pct(s.avgEngagementRate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold">Audience</h2>
          {audience ? (
            <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
              {[
                ["Age", top(audience.age, 3).map(([k, v]) => `${k}: ${pct(v, 0)}`)],
                ["Gender", top(audience.gender, 2).map(([k, v]) => `${k}: ${pct(v, 0)}`)],
                ["Top countries", top(audience.country, 3).map(([k, v]) => `${countryName(k)}: ${pct(v, 0)}`)],
              ].map(([label, rows]) => (
                <div key={label as string}>
                  <div className="text-xs text-ink-3">{label}</div>
                  {(rows as string[]).map((r) => <div key={r} className="capitalize">{r}</div>)}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-3">Audience data not available.</p>
          )}
        </div>
      </section>

      {best.length > 0 && (
        <section className="card p-5">
          <h2 className="font-semibold">Top content (last 90 days)</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {best.map((b) => (
              <li key={b.id} className="flex justify-between gap-4 py-2">
                <span className="truncate">{b.caption.split("\n")[0]}</span>
                <span className="shrink-0 tabular-nums text-ink-2">
                  {compact(b.views)} views · {pct(engagementRate(b))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showRates && (
        <section className="card p-5">
          <h2 className="font-semibold">Indicative rates</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {platforms.map((platform) => {
              const s = summarize(recent.filter((x) => x.platform === platform));
              const r = estimateRate(platform, s.avgViews, s.avgEngagementRate);
              return (
                <div key={platform} className="rounded-lg bg-surface-2 p-4">
                  <div className="text-xs text-ink-3">{PLATFORM_LABELS[platform]}, per post</div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    ${r.low.toLocaleString("en")}–${r.high.toLocaleString("en")}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-3">Final pricing depends on deliverables, usage rights and exclusivity.</p>
        </section>
      )}

      {p?.contactEmail && (
        <section className="card p-5">
          <h2 className="font-semibold">Work with me</h2>
          <a href={`mailto:${p.contactEmail}`} className="mt-2 inline-block text-accent underline">{p.contactEmail}</a>
        </section>
      )}
    </div>
  );
}
