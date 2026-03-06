import { db } from "@pr-sentinel/database";
import {
  invites,
  organizations,
  organizationMembers,
  users,
} from "@pr-sentinel/database/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getSession();

  // Find the invite
  const invite = await db
    .select({
      invite: invites,
      org: organizations,
    })
    .from(invites)
    .leftJoin(organizations, eq(invites.organizationId, organizations.id))
    .where(eq(invites.token, token))
    .limit(1)
    .then((rows) => rows[0]);

  if (!invite || !invite.invite) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Invalid Invite</h1>
          <p className="mt-2 text-gray-600">
            This invite link is invalid or has expired.
          </p>
          <Link href="/" className="mt-4 inline-block text-blue-600 hover:underline">
            Go home
          </Link>
        </div>
      </main>
    );
  }

  const { invite: inviteData, org } = invite;

  // Check if invite is expired
  if (new Date(inviteData.expiresAt) < new Date()) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Invite Expired</h1>
          <p className="mt-2 text-gray-600">
            This invite link has expired. Please ask the organization admin to send a new invite.
          </p>
          <Link href="/" className="mt-4 inline-block text-blue-600 hover:underline">
            Go home
          </Link>
        </div>
      </main>
    );
  }

  // Check if invite is already used
  if (inviteData.status !== "pending") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Invite Already Used</h1>
          <p className="mt-2 text-gray-600">
            This invite has already been accepted.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block text-blue-600 hover:underline">
            Go to dashboard
          </Link>
        </div>
      </main>
    );
  }

  // If not logged in, show login prompt
  if (!session) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Join {org?.name ?? "Organization"}</h1>
          <p className="mt-2 text-gray-600">
            You've been invited to join as a <strong>{inviteData.role}</strong>.
          </p>
          <p className="mt-4 text-sm text-gray-500">
            Please sign in with GitHub to accept this invite.
          </p>
          <Link
            href={`/api/auth/github?redirect=/invite/${token}`}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-6 py-3 text-lg font-medium text-white transition-colors hover:bg-gray-800"
          >
            Sign in with GitHub
          </Link>
        </div>
      </main>
    );
  }

  // Check if user email matches invite email
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1)
    .then((rows) => rows[0]);

  // Accept invite action
  async function acceptInvite() {
    "use server";

    const session = await getSession();
    if (!session) return;

    // Get the invite again
    const invite = await db
      .select()
      .from(invites)
      .where(eq(invites.token, token))
      .limit(1)
      .then((rows) => rows[0]);

    if (!invite || invite.status !== "pending") return;

    // Check if user is already a member
    const existingMembership = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, invite.organizationId),
          eq(organizationMembers.userId, session.userId)
        )
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (existingMembership) {
      // Already a member, just mark invite as accepted
      await db
        .update(invites)
        .set({ status: "accepted" })
        .where(eq(invites.id, invite.id));
      redirect("/dashboard");
    }

    // Add user to organization
    await db.insert(organizationMembers).values({
      organizationId: invite.organizationId,
      userId: session.userId,
      role: invite.role,
      invitedAt: invite.createdAt,
    });

    // Mark invite as accepted
    await db
      .update(invites)
      .set({ status: "accepted" })
      .where(eq(invites.id, invite.id));

    revalidatePath("/dashboard");
    redirect("/dashboard");
  }

  const emailMatches = user?.email?.toLowerCase() === inviteData.email.toLowerCase();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold">Join {org?.name ?? "Organization"}</h1>
        <p className="mt-2 text-gray-600">
          You've been invited to join as a <strong>{inviteData.role}</strong>.
        </p>

        {!emailMatches && (
          <div className="mt-4 rounded-lg bg-yellow-50 p-4 text-left text-sm">
            <p className="font-medium text-yellow-800">Note:</p>
            <p className="mt-1 text-yellow-700">
              This invite was sent to <strong>{inviteData.email}</strong>, but you're signed in as{" "}
              <strong>{user?.email ?? session.githubLogin}</strong>.
            </p>
            <p className="mt-1 text-yellow-700">
              You can still accept this invite if you have access to this organization.
            </p>
          </div>
        )}

        <form action={acceptInvite} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-6 py-3 text-lg font-medium text-white transition-colors hover:bg-blue-700"
          >
            Accept Invite
          </button>
        </form>

        <p className="mt-4 text-sm text-gray-500">
          Signed in as {session.githubLogin}
        </p>
      </div>
    </main>
  );
}
