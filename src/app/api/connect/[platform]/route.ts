import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getConnector, redirectUri } from "@/lib/connectors";
import { randomToken } from "@/lib/crypto";

/** Starts the OAuth flow for a platform. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const connector = getConnector(platform);
  if (!connector) return NextResponse.redirect(new URL("/connections?error=unknown_platform", req.url));
  if (!connector.configured()) {
    return NextResponse.redirect(new URL(`/connections?error=not_configured&platform=${platform}`, req.url));
  }

  const state = randomToken();
  (await cookies()).set(`oauth_state_${platform}`, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(connector.authUrl(state, redirectUri(connector.platform)));
}
