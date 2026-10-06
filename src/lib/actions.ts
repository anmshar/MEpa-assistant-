"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "./db";
import { IDEA_STATUSES } from "./db/schema";
import { createSession, destroySession, hashPassword, requireUser, verifyPassword } from "./auth";
import { connectDemo, syncUser } from "./sync";
import { getOrCreateProfile } from "./data";
import { aiConfigured } from "./ai/client";
import { generateContentPlan, generateWeeklyReport } from "./ai/insights";
import { randomToken } from "./crypto";

export type FormState = { error?: string; ok?: string } | undefined;

const Credentials = z.object({
  email: z.email("Enter a valid email").transform((e) => e.toLowerCase().trim()),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Credentials.extend({ name: z.string().trim().min(1, "Enter your name") }).safeParse(
    Object.fromEntries(form),
  );
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (form.get("consent") !== "on") return { error: "Please accept the privacy policy to continue." };
  const db = await getDb();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, parsed.data.email));
  if (existing) return { error: "An account with this email already exists." };
  const [user] = await db
    .insert(schema.users)
    .values({ email: parsed.data.email, name: parsed.data.name, passwordHash: await hashPassword(parsed.data.password) })
    .returning();
  await getOrCreateProfile(user.id, user.name);
  await createSession(user.id);
  redirect("/onboarding");
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Credentials.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Invalid email or password." };
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, parsed.data.email));
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "Invalid email or password." };
  }
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/");
}

const Profile = z.object({
  displayName: z.string().trim().max(80),
  niche: z.string().trim().max(200),
  goals: z.string().trim().max(1000),
  audience: z.string().trim().max(500),
  voice: z.string().trim().max(500),
  boundaries: z.string().trim().max(1000),
  hoursPerWeek: z.coerce.number().int().min(0).max(80).optional().or(z.literal("").transform(() => undefined)),
  timezone: z.string().trim().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
});

export async function saveProfile(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = Profile.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await getOrCreateProfile(user.id, user.name);
  const db = await getDb();
  await db
    .update(schema.creatorProfiles)
    .set({ ...parsed.data, hoursPerWeek: parsed.data.hoursPerWeek ?? null, onboarded: true, updatedAt: new Date() })
    .where(eq(schema.creatorProfiles.userId, user.id));
  revalidatePath("/", "layout");
  if (form.get("next") === "connections") redirect("/connections");
  return { ok: "Saved" };
}

export async function connectDemoAction() {
  const user = await requireUser();
  await connectDemo(user.id);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function syncAllAction() {
  const user = await requireUser();
  await syncUser(user.id);
  revalidatePath("/", "layout");
}

export async function disconnectAccount(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id"));
  const db = await getDb();
  // Deleting the account cascades to its posts, snapshots and audience data.
  await db.delete(schema.accounts).where(and(eq(schema.accounts.id, id), eq(schema.accounts.userId, user.id)));
  revalidatePath("/", "layout");
}

export async function setIdeaStatus(form: FormData) {
  const user = await requireUser();
  const status = z.enum(IDEA_STATUSES).parse(form.get("status"));
  const db = await getDb();
  await db
    .update(schema.contentIdeas)
    .set({ status })
    .where(and(eq(schema.contentIdeas.id, String(form.get("id"))), eq(schema.contentIdeas.userId, user.id)));
  revalidatePath("/plan");
}

export async function generatePlanAction(_: FormState): Promise<FormState> {
  const user = await requireUser();
  if (!aiConfigured()) return { error: "AI is not configured. Set ANTHROPIC_API_KEY on the server." };
  try {
    const n = await generateContentPlan(user.id);
    revalidatePath("/plan");
    return { ok: `Added ${n} posts to your plan.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function generateReportAction(_: FormState): Promise<FormState> {
  const user = await requireUser();
  if (!aiConfigured()) return { error: "AI is not configured. Set ANTHROPIC_API_KEY on the server." };
  try {
    await generateWeeklyReport(user.id);
    revalidatePath("/reports");
    return { ok: "Report ready." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function saveMediaKit(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const profile = await getOrCreateProfile(user.id, user.name);
  const parsed = z
    .object({
      bio: z.string().trim().max(600),
      contactEmail: z.union([z.literal(""), z.email("Enter a valid contact email")]),
    })
    .safeParse({ bio: form.get("bio") ?? "", contactEmail: form.get("contactEmail") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const db = await getDb();
  await db
    .update(schema.creatorProfiles)
    .set({
      ...parsed.data,
      mediaKitPublic: form.get("public") === "on",
      mediaKitShowRates: form.get("showRates") === "on",
      mediaKitSlug: profile.mediaKitSlug ?? randomToken(8).toLowerCase().replace(/[^a-z0-9]/g, "x"),
      updatedAt: new Date(),
    })
    .where(eq(schema.creatorProfiles.userId, user.id));
  revalidatePath("/media-kit");
  return { ok: "Saved" };
}

export async function deleteConversation(form: FormData) {
  const user = await requireUser();
  const db = await getDb();
  await db
    .delete(schema.conversations)
    .where(and(eq(schema.conversations.id, String(form.get("id"))), eq(schema.conversations.userId, user.id)));
  redirect("/chat");
}

/** GDPR: deletes the user and, by cascade, every piece of data we hold about them. */
export async function deleteMyAccount(form: FormData) {
  const user = await requireUser();
  if (form.get("confirm") !== "DELETE") return;
  const db = await getDb();
  await db.delete(schema.users).where(eq(schema.users.id, user.id));
  await destroySession();
  redirect("/");
}
