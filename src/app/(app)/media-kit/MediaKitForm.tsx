"use client";

import { useActionState } from "react";
import { saveMediaKit, type FormState } from "@/lib/actions";
import { SubmitButton } from "@/components/SubmitButton";

export function MediaKitForm(props: { bio: string; contactEmail: string; isPublic: boolean; showRates: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(saveMediaKit, undefined);
  return (
    <form action={action} className="card space-y-4 p-5">
      <div>
        <label className="label" htmlFor="bio">Bio for brands</label>
        <textarea id="bio" name="bio" className="input min-h-28" defaultValue={props.bio} placeholder="Who you are, what you make, why brands should work with you." />
      </div>
      <div>
        <label className="label" htmlFor="contactEmail">Business email</label>
        <input id="contactEmail" name="contactEmail" type="email" className="input" defaultValue={props.contactEmail} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="public" defaultChecked={props.isPublic} /> Publish my media kit at a shareable link
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="showRates" defaultChecked={props.showRates} /> Show indicative rates
      </label>
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      {state?.ok && <p className="text-sm text-good">{state.ok}</p>}
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}
