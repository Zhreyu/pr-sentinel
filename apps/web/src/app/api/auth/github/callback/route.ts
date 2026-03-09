import {
  exchangeCodeForToken,
  getGitHubUser,
  getGitHubUserEmails,
} from "@pr-sentinel/github";
import { db } from "@pr-sentinel/database";
import { systemConfig, users } from "@pr-sentinel/database/schema";
import { desc, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { createSession, setSessionCookie } from "@/lib/session";
import { CONFIG_KEYS, organizationMembers, organizations } from "@pr-sentinel/database/schema";

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

    // --- SETUP SEQUENCE HANDLING ---
    const isSetup = cookieStore.get("setup-mode")?.value === "true";
    cookieStore.delete("setup-mode");

    if (isSetup) {
      const configuredWorkspaceName =
        process.env.DEFAULT_WORKSPACE_NAME?.trim() || `${githubUser.login}'s Workspace`;

      const orgCheck = await db
        .select()
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, userId))
        .limit(1);

      if (orgCheck.length === 0) {
        const unclaimedOrg = await db
          .select({
            id: organizations.id,
            name: organizations.name,
            githubOrgLogin: organizations.githubOrgLogin,
          })
          .from(organizations)
          .leftJoin(
            organizationMembers,
            eq(organizationMembers.organizationId, organizations.id)
          )
          .where(isNull(organizationMembers.id))
          .orderBy(desc(organizations.createdAt))
          .limit(1)
          .then((rows) => rows[0]);

        const targetOrg =
          unclaimedOrg ??
          (
            await db
              .insert(organizations)
              .values({
                name: configuredWorkspaceName,
                githubOrgLogin: githubUser.login,
              })
              .returning()
          )[0];

        if (targetOrg) {
          await db
            .update(organizations)
            .set({
              name: configuredWorkspaceName,
              githubOrgLogin: targetOrg.githubOrgLogin || githubUser.login,
              updatedAt: new Date(),
            })
            .where(eq(organizations.id, targetOrg.id));

          await db.insert(organizationMembers).values({
            organizationId: targetOrg.id,
            userId,
            role: "admin",
          });
        }
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      const activeProviders = [
        process.env.ANTHROPIC_API_KEY ? "anthropic" : null,
        process.env.OPENAI_API_KEY ? "openai" : null,
        process.env.GOOGLE_AI_API_KEY ? "google" : null,
      ]
        .filter(Boolean)
        .join(",");

      await upsertSystemConfig(CONFIG_KEYS.SETUP_COMPLETE, "true");
      if (appUrl) {
        await upsertSystemConfig(CONFIG_KEYS.APP_URL, appUrl);
      }
      if (activeProviders) {
        await upsertSystemConfig(CONFIG_KEYS.AI_PROVIDERS, activeProviders);
      }

      return redirect("/dashboard");
    }

    redirect("/dashboard");
  } catch (err) {
    // Re-throw redirect errors (they're not real errors)
    if (err instanceof Error && "digest" in err && typeof err.digest === "string" && err.digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    console.error("OAuth callback error:", err);
    redirect("/?error=auth_failed");
  }
}

async function upsertSystemConfig(key: string, value: string) {
  const existing = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, key))
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    await db
      .update(systemConfig)
      .set({ value, updatedAt: new Date() })
      .where(eq(systemConfig.key, key));
    return;
  }

  await db.insert(systemConfig).values({ key, value });
}
