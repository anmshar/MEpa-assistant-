import { requireUser } from "@/lib/auth";
import { loadCreatorData } from "@/lib/data";
import { connectors } from "@/lib/connectors";
import { PLATFORMS } from "@/lib/db/schema";
import { connectDemoAction, disconnectAccount, syncAllAction } from "@/lib/actions";
import { PageHeader } from "@/components/PageHeader";
import { at } from "@/lib/labels";
import { SubmitButton } from "@/components/SubmitButton";

const NOTES: Record<string, string> = {
  instagram: "Requires a Business or Creator account. Read-only: profile, posts, insights and audience.",
  youtube: "Read-only: channel, videos, YouTube Analytics (watch time, shares, audience).",
  tiktok: "Read-only: profile and public video stats. TikTok does not share audience data with apps.",
};

const ERRORS: Record<string, string> = {
  not_configured: "This platform isn't set up on the server yet (missing app credentials).",
  denied: "Connection was cancelled.",
  invalid_state: "The connection expired or was tampered with. Please try again.",
  connect_failed: "We couldn't connect that account. Please try again.",
  sync_failed: "Connected, but the first sync failed. Try “Sync now”.",
  unknown_platform: "Unknown platform.",
};

export default async function Connections({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const q = await searchParams;
  const { accounts } = await loadCreatorData(user.id);
  const hasDemo = accounts.some((a) => a.isDemo);

  return (
    <>
      <PageHeader title="Connected accounts" subtitle="Connect your platforms so your manager can see your real numbers.">
        {accounts.length > 0 && (
          <form action={syncAllAction}>
            <SubmitButton variant="ghost" pendingText="Syncing…">Sync now</SubmitButton>
          </form>
        )}
      </PageHeader>

      {q.error && <div className="card mb-4 border-bad/40 p-4 text-sm text-bad">{ERRORS[q.error] ?? "Something went wrong."}</div>}
      {q.connected && <div className="card mb-4 p-4 text-sm text-good">Connected {q.connected}. Your data is synced.</div>}

      <div className="grid max-w-3xl gap-4">
        {PLATFORMS.map((platform) => {
          const c = connectors[platform];
          const connected = accounts.filter((a) => a.platform === platform && !a.isDemo);
          return (
            <div key={platform} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{c.label}</h2>
                  <p className="mt-1 text-sm text-ink-2">{NOTES[platform]}</p>
                </div>
                {c.configured() ? (
                  <a href={`/api/connect/${platform}`} className="btn btn-primary">
                    {connected.length ? "Connect another" : "Connect"}
                  </a>
                ) : (
                  <span className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-3">Awaiting app approval</span>
                )}
              </div>
              {connected.map((a) => (
                <div key={a.id} className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-4 py-3 text-sm">
                  <div>
                    <span className="font-medium">{at(a.handle)}</span>
                    <span className="ml-2 text-ink-3">{a.followers.toLocaleString("en")} followers</span>
                    <div className="text-xs text-ink-3">
                      {a.status === "active"
                        ? `Last synced ${a.lastSyncedAt ? a.lastSyncedAt.toLocaleString("en-GB") : "never"}`
                        : a.status === "reauth"
                          ? "Access expired, please reconnect"
                          : `Sync error: ${a.lastError ?? "unknown"}`}
                    </div>
                  </div>
                  <form action={disconnectAccount}>
                    <input type="hidden" name="id" value={a.id} />
                    <SubmitButton variant="ghost" pendingText="Removing…">Disconnect</SubmitButton>
                  </form>
                </div>
              ))}
            </div>
          );
        })}

        <div className="card border-dashed p-5">
          <h2 className="font-semibold">Try the demo account</h2>
          <p className="mt-1 text-sm text-ink-2">
            Explore MEpa with 4 months of realistic sample data from a fictional fitness creator (Instagram + YouTube).
          </p>
          {hasDemo ? (
            <div className="mt-4 space-y-2">
              {accounts
                .filter((a) => a.isDemo)
                .map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3 text-sm">
                    <span>
                      Demo {a.platform}: <span className="font-medium">{at(a.handle)}</span>
                    </span>
                    <form action={disconnectAccount}>
                      <input type="hidden" name="id" value={a.id} />
                      <SubmitButton variant="ghost" pendingText="Removing…">Remove</SubmitButton>
                    </form>
                  </div>
                ))}
            </div>
          ) : (
            <form action={connectDemoAction} className="mt-4">
              <SubmitButton pendingText="Loading demo data…">Use demo account</SubmitButton>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
