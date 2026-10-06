import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getConnector, redirectUri } from "@/lib/connectors";
import { encrypt } from "@/lib/crypto";
import { getDb, schema } from "@/lib/db";
import { syncAccount } from "@/lib/sync";

/** OAuth redirect target: verifies state, stores encrypted tokens, runs the first sync. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const back = (q: string) => NextResponse.redirect(new URL(`/connections?${q}`, req.url));
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const connector = getConnector(platform);
  if (!connector) return back("error=unknown_platform");

  const jar = await cookies();
  const expected = jar.get(`oauth_state_${platform}`)?.value;
  jar.delete(`oauth_state_${platform}`);
  const url = req.nextUrl;
  if (url.searchParams.get("error")) return back(`error=denied&platform=${platform}`);
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back("error=invalid_state");

  try {
    const tokens = await connector.exchangeCode(code, redirectUri(connector.platform));
    const profile = await connector.fetchProfile(tokens.accessToken);
    const db = await getDb();
    const values = {
      handle: profile.handle,
      avatarUrl: profile.avatarUrl ?? null,
      followers: profile.followers,
      accessToken: encrypt(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      tokenExpiresAt: tokens.expiresAt ?? null,
      status: "active" as const,
      lastError: null,
    };
    const [account] = await db
      .insert(schema.accounts)
      .values({ userId: user.id, platform: connector.platform, externalId: profile.externalId, ...values })
      .onConflictDoUpdate({
        target: [schema.accounts.userId, schema.accounts.platform, schema.accounts.externalId],
        set: values,
      })
      .returning();
    const result = await syncAccount(account.id);
    return back(result.ok ? `connected=${platform}` : `error=sync_failed&platform=${platform}`);
  } catch (err) {
    console.error(`OAuth callback failed for ${platform}`, err);
    return back(`error=connect_failed&platform=${platform}`);
  }
}
