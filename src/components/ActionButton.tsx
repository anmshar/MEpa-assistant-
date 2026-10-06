"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/actions";
import { SubmitButton } from "./SubmitButton";

/** A button bound to a server action that reports success/error inline. */
export function ActionButton({
  action,
  children,
  pendingText,
}: {
  action: (state: FormState) => Promise<FormState>;
  children: React.ReactNode;
  pendingText: string;
}) {
  const [state, run] = useActionState<FormState>(action, undefined);
  return (
    <form action={run} className="flex flex-wrap items-center gap-3">
      <SubmitButton pendingText={pendingText}>{children}</SubmitButton>
      {state?.error && <span className="text-sm text-bad">{state.error}</span>}
      {state?.ok && <span className="text-sm text-good">{state.ok}</span>}
    </form>
  );
}
