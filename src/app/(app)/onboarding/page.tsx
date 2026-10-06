import { requireUser } from "@/lib/auth";
import { getOrCreateProfile } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { ProfileForm } from "@/components/ProfileForm";

export default async function Onboarding() {
  const user = await requireUser();
  const profile = await getOrCreateProfile(user.id, user.name);
  return (
    <>
      <PageHeader
        title="Let's get to know you"
        subtitle="A good manager starts by understanding your goals. Your AI manager uses this in every piece of advice."
      />
      <ProfileForm profile={profile} onboarding />
    </>
  );
}
