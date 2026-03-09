import { getAuthorizationUrl } from "@pr-sentinel/github";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { isSetupComplete } from "@/lib/setup";

export async function GET(req: NextRequest) {
  const isSetup = req.nextUrl.searchParams.get("setup") === "true";

  if (!isSetup) {
    const setupComplete = await isSetupComplete();
    if (!setupComplete) {
      return NextResponse.redirect(new URL("/setup", req.url));
    }
  }

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

  if (isSetup) {
    cookieStore.set("setup-mode", "true", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });
  }

  const authUrl = getAuthorizationUrl(state);
  // Use NextResponse.redirect for external URLs
  return NextResponse.redirect(authUrl);
}
