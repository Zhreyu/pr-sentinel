import { db } from "@pr-sentinel/database";
import {
  repositories,
  organizations,
  organizationMembers,
  pullRequests,
} from "@pr-sentinel/database/schema";
import { eq, count, sql } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function ReposPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const userOrgs = await db
    .select({ orgId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, session.userId));

  const orgIds = userOrgs.map((o) => o.orgId);
  const appSlug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG;
  const installUrl = `https://github.com/apps/${appSlug}/installations/new`;

  if (orgIds.length === 0) {
    return <EmptyTechState installUrl={installUrl} />;
  }

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
    <div className="animate-fade">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div className="space-y-1">
          <h1 className="text-[32px] font-bold tracking-tight text-[var(--text-main)] m-0">Repositories</h1>
          <p className="text-[14px] text-[var(--text-muted)] font-mono">/ LISTING_CONNECTED_RESOURCES [{repos.length}]</p>
        </div>

        <a href={installUrl} target="_blank" rel="noopener noreferrer" className="btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14" /></svg>
          Resource Management
        </a>
      </header>

      {repos.length === 0 ? (
        <EmptyTechState installUrl={installUrl} />
      ) : (
        <div className="space-y-3">
          {repos.map(({ repo, org, openPRs, totalPRs }) => (
            <div key={repo.id} className="card-border p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 group bg-[var(--bg-main)]/40 hover:bg-[var(--bg-hover)]/40">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 flex items-center justify-center bg-[var(--bg-hover)] border border-[var(--border-dim)] rounded text-[var(--text-muted)] group-hover:text-[var(--accent)] group-hover:border-[var(--accent)]/30 transition-all">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-[15px] font-bold text-[var(--text-main)] truncate">{repo.githubFullName.split("/")[1]}</h3>
                    <div className={`w-1.5 h-1.5 rounded-full ${repo.isActive ? 'bg-[var(--accent)] shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-[var(--border-dim)]'}`}></div>
                  </div>
                  <p className="text-[12px] text-[var(--text-muted)] font-mono tracking-tight">/ {org?.name ?? org?.githubOrgLogin ?? "unknown"}</p>
                </div>
              </div>

              <div className="flex items-center gap-12 pr-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Open</span>
                  <span className="text-xl font-mono font-bold text-[var(--text-main)]">{openPRs}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1">Lifetime</span>
                  <span className="text-xl font-mono font-bold text-[var(--text-main)] opacity-60">{totalPRs}</span>
                </div>

                <div className="flex items-center gap-3 ml-4">
                  <Link href={`/dashboard?search=${encodeURIComponent(repo.githubFullName)}`} className="btn-secondary py-1.5 px-4 text-xs font-bold uppercase tracking-wider">
                    Explore
                  </Link>
                  <a href={`https://github.com/${repo.githubFullName}`} target="_blank" className="btn-ghost p-2 opacity-40 hover:opacity-100">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyTechState({ installUrl }: { installUrl: string }) {
  return (
    <div className="max-w-md mx-auto py-24 text-center">
      <div className="w-16 h-16 mx-auto bg-[var(--bg-hover)] border border-[var(--border-dim)] rounded flex items-center justify-center mb-6 text-[var(--text-muted)]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
      </div>
      <h2 className="text-lg font-bold text-[var(--text-main)] mb-2">WORKSPACE_EMPTY</h2>
      <p className="text-sm text-[var(--text-muted)] mb-8 leading-relaxed">No repositories have been authorized for monitoring. Connect your GitHub organization to initialize monitoring.</p>
      <a href={installUrl} className="btn-primary">/ ATTACH_RESOURCES</a>
    </div>
  );
}
