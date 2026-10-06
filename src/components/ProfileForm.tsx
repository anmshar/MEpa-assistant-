"use client";

import { useActionState } from "react";
import { saveProfile, type FormState } from "@/lib/actions";
import { SubmitButton } from "./SubmitButton";
import type { CreatorProfile } from "@/lib/db/schema";

const FIELDS: { name: keyof CreatorProfile; label: string; hint: string; long?: boolean }[] = [
  { name: "displayName", label: "Creator name", hint: "How you want to be addressed" },
  { name: "niche", label: "Your niche", hint: "e.g. home fitness for busy women, budget travel, indie game reviews" },
  { name: "goals", label: "Goals for the next 6 months", hint: "e.g. reach 100K on Instagram, land 2 brand deals a month, launch a course", long: true },
  { name: "audience", label: "Who you make content for", hint: "Your ideal viewer in a sentence", long: true },
  { name: "voice", label: "Your voice and style", hint: "e.g. funny and direct, calm and educational, no swearing", long: true },
  { name: "boundaries", label: "Boundaries", hint: "Topics or brands you won't do (alcohol, gambling, crypto…)", long: true },
];

export function ProfileForm({ profile, onboarding }: { profile: CreatorProfile; onboarding?: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(saveProfile, undefined);
  const guessedTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  return (
    <form action={action} className="card max-w-2xl space-y-4 p-6">
      {FIELDS.map((f) => (
        <div key={f.name}>
          <label className="label" htmlFor={f.name}>{f.label}</label>
          {f.long ? (
            <textarea className="input min-h-20" id={f.name} name={f.name} placeholder={f.hint} defaultValue={String(profile[f.name] ?? "")} />
          ) : (
            <input className="input" id={f.name} name={f.name} placeholder={f.hint} defaultValue={String(profile[f.name] ?? "")} />
          )}
        </div>
      ))}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="hoursPerWeek">Hours per week for content</label>
          <input className="input" id="hoursPerWeek" name="hoursPerWeek" type="number" min={0} max={80} defaultValue={profile.hoursPerWeek ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="timezone">Time zone</label>
          <input className="input" id="timezone" name="timezone" defaultValue={profile.onboarded ? profile.timezone : guessedTz || profile.timezone} />
        </div>
      </div>
      {onboarding && <input type="hidden" name="next" value="connections" />}
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      {state?.ok && <p className="text-sm text-good">{state.ok}</p>}
      <SubmitButton>{onboarding ? "Continue: connect accounts" : "Save profile"}</SubmitButton>
    </form>
  );
}
