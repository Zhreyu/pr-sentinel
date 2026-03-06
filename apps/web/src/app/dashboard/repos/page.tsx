import { db } from "@pr-sentinel/database";
import {
  repositories,
  organizations,
  organizationMembers,
  pullRequests,
} from "@pr-sentinel/database/schema";
import { eq, count, and, sql } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function ReposPage() {
  const session = await getSession();

  if (!session) {
    redirect("/");
  }

  // Get user's organizations
  const userOrgs = await db
    .select({ orgId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, session.userId));

  const orgIds = userOrgs.map((o) => o.orgId);

  if (orgIds.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Repositories</h1>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-600">
            No repositories connected yet.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Repositories will appear here once you install the GitHub App on your repositories.
          </p>
        </div>
      </div>
    );
  }

  // Get repositories with PR counts
  const repos = await db
    .select({
      repo: repositories,
      org: organizations,
      openPRs: sql<number>`COUNT(CASE WHEN ${pullRequests.state} = 'open' THEN 1 END)`.as("open_prs"),
      totalPRs: count(pullRequests.id).as("total_prs"),
    })
    .from(repositories)
    .leftJoin(organizations, eq(repositories.organizationId, organizations.id))
    .leftJoin(pullRequests, eq(pullRequests.repositoryId, repositories.id))
    .where(sql`${repositories.organizationId} = ANY(ARRAY[${sql.join(orgIds, sql`, `)}]::uuid[])`)
    .groupBy(repositories.id, organizations.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Repositories</h1>
        <span className="text-sm text-gray-500">{repos.length} repositories</span>
      </div>

      {repos.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-600">
            No repositories connected yet.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Repositories will appear here once you install the GitHub App on your repositories.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {repos.map(({ repo, org, openPRs, totalPRs }) => (
            <div
              key={repo.id}
              className="rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{repo.githubFullName}</h3>
                  <p className="text-sm text-gray-500">{org?.name ?? "Unknown org"}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    repo.isActive
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {repo.isActive ? "Active" : "Inactive"}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-4 text-sm">
                <div>
                  <span className="font-medium text-orange-600">{openPRs}</span>
                  <span className="text-gray-500"> open PRs</span>
                </div>
                <div>
                  <span className="font-medium">{totalPRs}</span>
                  <span className="text-gray-500"> total</span>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Link
                  href={`/dashboard?search=${encodeURIComponent(repo.githubFullName)}`}
                  className="rounded bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  View PRs
                </Link>
                <a
                  href={`https://github.com/${repo.githubFullName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  GitHub
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
