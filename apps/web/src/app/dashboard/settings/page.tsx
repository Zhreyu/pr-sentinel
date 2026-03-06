import { db } from "@pr-sentinel/database";
import {
  organizations,
  organizationMembers,
  users,
  invites,
} from "@pr-sentinel/database/schema";
import { eq, and, desc } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export default async function SettingsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/");
  }

  // Get user's organizations
  const userOrgs = await db
    .select({
      org: organizations,
      membership: organizationMembers,
    })
    .from(organizationMembers)
    .leftJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, session.userId));

  // Get members for each org
  const orgsWithMembers = await Promise.all(
    userOrgs.map(async ({ org, membership }) => {
      if (!org) return null;

      const members = await db
        .select({
          member: organizationMembers,
          user: users,
        })
        .from(organizationMembers)
        .leftJoin(users, eq(organizationMembers.userId, users.id))
        .where(eq(organizationMembers.organizationId, org.id));

      const pendingInvites = await db
        .select()
        .from(invites)
        .where(
          and(
            eq(invites.organizationId, org.id),
            eq(invites.status, "pending")
          )
        );

      return {
        org,
        membership,
        members,
        pendingInvites,
        isOwner: membership?.role === "owner",
      };
    })
  );

  const validOrgs = orgsWithMembers.filter(Boolean);

  // Create organization action
  async function createOrg(formData: FormData) {
    "use server";

    const session = await getSession();
    if (!session) return;

    const name = formData.get("name") as string;
    if (!name) return;

    // Create organization
    const newOrg = await db
      .insert(organizations)
      .values({ name })
      .returning();

    const org = newOrg[0];
    if (!org) return;

    // Add current user as owner
    await db.insert(organizationMembers).values({
      organizationId: org.id,
      userId: session.userId,
      role: "owner",
    });

    revalidatePath("/dashboard/settings");
  }

  // Create invite action
  async function createInvite(formData: FormData) {
    "use server";

    const session = await getSession();
    if (!session) return;

    const orgId = formData.get("orgId") as string;
    const email = formData.get("email") as string;
    const role = (formData.get("role") as string) || "member";

    if (!orgId || !email) return;

    // Verify user is admin/owner of the org
    const membership = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userId, session.userId)
        )
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return;
    }

    // Create invite with random token
    const token = crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 day expiry

    await db.insert(invites).values({
      organizationId: orgId,
      email,
      role,
      token,
      expiresAt,
    });

    revalidatePath("/dashboard/settings");
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-gray-600">Manage your organizations and team members.</p>
      </div>

      {/* User Info */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Your Account</h2>
        <div className="mt-4 flex items-center gap-4">
          <img
            src={session.avatarUrl}
            alt={session.githubLogin}
            className="h-16 w-16 rounded-full"
          />
          <div>
            <p className="font-medium">{session.githubLogin}</p>
            <p className="text-sm text-gray-500">Connected via GitHub</p>
          </div>
        </div>
      </div>

      {/* Organizations */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Organizations</h2>
        </div>

        {validOrgs.length === 0 ? (
          <div className="mt-4 rounded-lg bg-gray-50 p-6 text-center">
            <p className="text-gray-600">
              You're not part of any organizations yet.
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Organizations are created automatically when you install the GitHub App.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {validOrgs.map((orgData) => (
              <OrgCard key={orgData!.org.id} {...orgData!} createInvite={createInvite} />
            ))}
          </div>
        )}

        {/* Create Org Form */}
        <div className="mt-6 border-t border-gray-200 pt-6">
          <h3 className="text-sm font-medium text-gray-700">Create New Organization</h3>
          <form action={createOrg} className="mt-2 flex gap-2">
            <input
              type="text"
              name="name"
              placeholder="Organization name"
              required
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Create
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function OrgCard({
  org,
  membership,
  members,
  pendingInvites,
  isOwner,
  createInvite,
}: {
  org: typeof organizations.$inferSelect;
  membership: typeof organizationMembers.$inferSelect | null;
  members: Array<{
    member: typeof organizationMembers.$inferSelect;
    user: typeof users.$inferSelect | null;
  }>;
  pendingInvites: Array<typeof invites.$inferSelect>;
  isOwner: boolean;
  createInvite: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">{org.name}</h3>
          <p className="text-sm text-gray-500">
            {members.length} member{members.length !== 1 ? "s" : ""} •{" "}
            Your role: {membership?.role ?? "member"}
          </p>
        </div>
        {org.githubOrgLogin && (
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
            GitHub: {org.githubOrgLogin}
          </span>
        )}
      </div>

      {/* Member List */}
      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Members
        </p>
        <div className="mt-2 space-y-2">
          {members.map(({ member, user }) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded bg-white p-2"
            >
              <div className="flex items-center gap-2">
                {user?.avatarUrl && (
                  <img
                    src={user.avatarUrl}
                    alt={user.githubLogin ?? ""}
                    className="h-6 w-6 rounded-full"
                  />
                )}
                <span className="text-sm">{user?.githubLogin ?? "Unknown"}</span>
              </div>
              <span className="text-xs text-gray-500">{member.role}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Pending Invites
          </p>
          <div className="mt-2 space-y-2">
            {pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between rounded bg-yellow-50 p-2"
              >
                <span className="text-sm">{invite.email}</span>
                <span className="text-xs text-yellow-600">
                  Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Form (only for admins/owners) */}
      {(isOwner || membership?.role === "admin") && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Invite Member
          </p>
          <form action={createInvite} className="mt-2 flex gap-2">
            <input type="hidden" name="orgId" value={org.id} />
            <input
              type="email"
              name="email"
              placeholder="Email address"
              required
              className="flex-1 rounded border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            <select
              name="role"
              className="rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Invite
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
