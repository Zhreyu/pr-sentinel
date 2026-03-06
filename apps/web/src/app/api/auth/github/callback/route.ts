import {
  exchangeCodeForToken,
  getGitHubUser,
  getGitHubUserEmails,
} from "@pr-sentinel/github";
import { db } from "@pr-sentinel/database";
import { users } from "@pr-sentinel/database/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { createSession, setSessionCookie } from "@/lib/session";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    console.error("GitHub OAuth error:", error);
    redirect("/?error=oauth_failed");
  }

  // Validate parameters
  if (!code || !state) {
    redirect("/?error=invalid_callback");
  }

  // Verify state
  const cookieStore = await cookies();
  const storedState = cookieStore.get("oauth-state")?.value;
  cookieStore.delete("oauth-state");

  if (!storedState || storedState !== state) {
    redirect("/?error=invalid_state");
  }

  try {
    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(code);

    // Fetch user info from GitHub
    const githubUser = await getGitHubUser(accessToken);

    // Try to get verified email
    let email = githubUser.email;
    if (!email) {
      const emails = await getGitHubUserEmails(accessToken);
      const primaryEmail = emails.find((e) => e.primary && e.verified);
      email = primaryEmail?.email ?? null;
    }

    // Create or update user in database
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.githubUserId, githubUser.id))
      .limit(1);

    let userId: string;

    const existing = existingUser[0];
    if (existing) {
      // Update existing user
      await db
        .update(users)
        .set({
          githubLogin: githubUser.login,
          avatarUrl: githubUser.avatar_url,
          email,
          updatedAt: new Date(),
        })
        .where(eq(users.githubUserId, githubUser.id));
      userId = existing.id;
    } else {
      // Create new user
      const newUser = await db
        .insert(users)
        .values({
          githubUserId: githubUser.id,
          githubLogin: githubUser.login,
          avatarUrl: githubUser.avatar_url,
          email,
        })
        .returning({ id: users.id });
      const created = newUser[0];
      if (!created) {
        throw new Error("Failed to create user");
      }
      userId = created.id;
    }

    // Create session
    const token = await createSession({
      userId,
      githubId: githubUser.id,
      githubLogin: githubUser.login,
      avatarUrl: githubUser.avatar_url,
    });

    await setSessionCookie(token);

    redirect("/dashboard");
  } catch (err) {
    console.error("OAuth callback error:", err);
    redirect("/?error=auth_failed");
  }
}
