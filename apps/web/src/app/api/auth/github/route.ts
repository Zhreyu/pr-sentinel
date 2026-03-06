import { getAuthorizationUrl } from "@pr-sentinel/github";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  // Generate a random state for CSRF protection
  const state = crypto.randomUUID();

  // Store state in a cookie for verification
  const cookieStore = await cookies();
  cookieStore.set("oauth-state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  });

  const authUrl = getAuthorizationUrl(state);
  // Use NextResponse.redirect for external URLs
  return NextResponse.redirect(authUrl);
}
