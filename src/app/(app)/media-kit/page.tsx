import { requireUser } from "@/lib/auth";
import { getOrCreateProfile, loadCreatorData } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { MediaKitView } from "@/components/MediaKitView";
import { MediaKitForm } from "./MediaKitForm";

export default async function MediaKit() {
  const user = await requireUser();
  const profile = await getOrCreateProfile(user.id, user.name);
  const data = await loadCreatorData(user.id);
  const url = profile.mediaKitSlug ? `${process.env.APP_URL ?? ""}/kit/${profile.mediaKitSlug}` : null;
  return (
    <>
      <PageHeader title="Media kit" subtitle="A live page for brands, updated automatically from your accounts." />
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          <MediaKitForm bio={profile.bio} contactEmail={profile.contactEmail} isPublic={profile.mediaKitPublic} showRates={profile.mediaKitShowRates} />
          {profile.mediaKitPublic && url && (
            <div className="card p-4 text-sm">
              <div className="text-xs text-ink-3">Your public link</div>
              <a href={`/kit/${profile.mediaKitSlug}`} target="_blank" className="break-all text-accent underline">{url}</a>
            </div>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Preview</p>
          {data.accounts.length ? (
            <MediaKitView data={data} name={user.name} showRates={profile.mediaKitShowRates} />
          ) : (
            <div className="card p-6 text-sm text-ink-2">Connect an account to build your media kit.</div>
          )}
        </div>
      </div>
    </>
  );
}
