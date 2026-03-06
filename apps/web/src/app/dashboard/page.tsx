import { db } from "@pr-sentinel/database";
import {
  pullRequests,
  repositories,
  prAnalyses,
} from "@pr-sentinel/database/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { getSession } from "@/lib/session";
import Link from "next/link";

type FilterType = "all" | "high-value" | "medium" | "low-signal" | "slop" | "pending";
type SortType = "priority" | "updated" | "created";

interface SearchParams {
  filter?: FilterType;
  sort?: SortType;
  search?: string;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getSession();
  const params = await searchParams;

  if (!session) {
    return null;
  }

  const filter = params.filter ?? "all";
  const sort = params.sort ?? "priority";
  const search = params.search ?? "";

  // Build query with filters
  const baseQuery = db
    .select({
      pr: pullRequests,
      repo: repositories,
      analysis: prAnalyses,
    })
    .from(pullRequests)
    .leftJoin(repositories, eq(pullRequests.repositoryId, repositories.id))
    .leftJoin(
      prAnalyses,
      and(
        eq(prAnalyses.pullRequestId, pullRequests.id),
        eq(
          prAnalyses.id,
          sql`(SELECT id FROM pr_analyses WHERE pull_request_id = ${pullRequests.id} ORDER BY created_at DESC LIMIT 1)`
        )
      )
    )
    .where(eq(pullRequests.state, "open"));

  // Get all open PRs with their analyses
  const allPRs = await baseQuery.orderBy(desc(pullRequests.githubUpdatedAt)).limit(200);

  // Apply client-side filtering and sorting for more flexibility
  let filteredPRs = allPRs;

  // Apply search filter
  if (search) {
    const searchLower = search.toLowerCase();
    filteredPRs = filteredPRs.filter(
      ({ pr, repo }) =>
        pr.title.toLowerCase().includes(searchLower) ||
        pr.authorLogin.toLowerCase().includes(searchLower) ||
        (repo?.githubFullName?.toLowerCase().includes(searchLower) ?? false)
    );
  }

  // Apply category filter
  if (filter !== "all") {
    filteredPRs = filteredPRs.filter(({ analysis }) => {
      if (filter === "pending") {
        return !analysis;
      }
      if (!analysis) return false;

      const hasSlop =
        analysis.aiSlopIndicators &&
        Array.isArray(analysis.aiSlopIndicators) &&
        analysis.aiSlopIndicators.length > 0;

      switch (filter) {
        case "high-value":
          return analysis.valueScore >= 70 && !hasSlop;
        case "medium":
          return analysis.valueScore >= 40 && analysis.valueScore < 70 && !hasSlop;
        case "low-signal":
          return analysis.valueScore < 40 && !hasSlop;
        case "slop":
          return hasSlop;
        default:
          return true;
      }
    });
  }

  // Apply sorting
  filteredPRs.sort((a, b) => {
    if (sort === "priority") {
      // Priority score = value - risk (higher is better)
      const aPriority = a.analysis ? a.analysis.valueScore - a.analysis.riskScore : -100;
      const bPriority = b.analysis ? b.analysis.valueScore - b.analysis.riskScore : -100;
      return bPriority - aPriority;
    }
    if (sort === "updated") {
      return b.pr.githubUpdatedAt - a.pr.githubUpdatedAt;
    }
    if (sort === "created") {
      return b.pr.githubCreatedAt - a.pr.githubCreatedAt;
    }
    return 0;
  });

  // Calculate stats
  const totalOpen = allPRs.length;
  const analyzed = allPRs.filter((p) => p.analysis).length;
  const highValue = allPRs.filter(
    (p) => p.analysis && p.analysis.valueScore >= 70
  ).length;
  const hasSlop = allPRs.filter(
    (p) =>
      p.analysis &&
      p.analysis.aiSlopIndicators &&
      Array.isArray(p.analysis.aiSlopIndicators) &&
      p.analysis.aiSlopIndicators.length > 0
  ).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Open PRs" value={totalOpen} />
        <StatCard title="Analyzed" value={analyzed} />
        <StatCard title="High Value" value={highValue} />
        <StatCard title="AI Slop" value={hasSlop} />
      </div>

      {/* Filters */}
      <div className="border-b border-zinc-200 pb-6">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-400">
              Filter
            </label>
            <div className="flex flex-wrap gap-1">
              <FilterButton href={buildUrl(params, { filter: "all" })} active={filter === "all"}>
                All
              </FilterButton>
              <FilterButton href={buildUrl(params, { filter: "high-value" })} active={filter === "high-value"}>
                High Value
              </FilterButton>
              <FilterButton href={buildUrl(params, { filter: "medium" })} active={filter === "medium"}>
                Medium
              </FilterButton>
              <FilterButton href={buildUrl(params, { filter: "low-signal" })} active={filter === "low-signal"}>
                Low Signal
              </FilterButton>
              <FilterButton href={buildUrl(params, { filter: "slop" })} active={filter === "slop"}>
                AI Slop
              </FilterButton>
              <FilterButton href={buildUrl(params, { filter: "pending" })} active={filter === "pending"}>
                Pending
              </FilterButton>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-400">
              Sort by
            </label>
            <div className="flex gap-1">
              <FilterButton href={buildUrl(params, { sort: "priority" })} active={sort === "priority"}>
                Priority
              </FilterButton>
              <FilterButton href={buildUrl(params, { sort: "updated" })} active={sort === "updated"}>
                Updated
              </FilterButton>
              <FilterButton href={buildUrl(params, { sort: "created" })} active={sort === "created"}>
                Created
              </FilterButton>
            </div>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-400">
              Search
            </label>
            <form action="/dashboard" method="GET">
              <input type="hidden" name="filter" value={filter} />
              <input type="hidden" name="sort" value={sort} />
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  name="search"
                  placeholder="Search title, author, or repo..."
                  defaultValue={search}
                  className="w-full rounded-md border border-zinc-200 bg-white py-2 pl-10 pr-4 text-sm placeholder-zinc-400 transition-colors focus:border-zinc-400 focus:outline-none"
                />
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* PR List */}
      <div>
        <div className="flex items-center justify-between pb-4">
          <h2 className="text-sm font-medium text-zinc-900">
            Pull Requests
            <span className="ml-2 text-zinc-400">
              {filteredPRs.length}
            </span>
          </h2>
        </div>

        {filteredPRs.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-zinc-500">No pull requests found</p>
            <Link
              href="/dashboard"
              className="mt-2 inline-block text-sm text-zinc-900 underline hover:no-underline"
            >
              Clear filters
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {filteredPRs.map(({ pr, repo, analysis }) => (
              <PRRow
                key={pr.id}
                pr={pr}
                repoName={repo?.githubFullName ?? "Unknown"}
                analysis={analysis}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function buildUrl(current: SearchParams, update: Partial<SearchParams>): string {
  const params = new URLSearchParams();
  const merged = { ...current, ...update };

  if (merged.filter && merged.filter !== "all") params.set("filter", merged.filter);
  if (merged.sort && merged.sort !== "priority") params.set("sort", merged.sort);
  if (merged.search) params.set("search", merged.search);

  const queryString = params.toString();
  return queryString ? `/dashboard?${queryString}` : "/dashboard";
}

function StatCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="border-b border-zinc-200 pb-4">
      <p className="text-sm font-medium text-zinc-500">{title}</p>
      <p className="mt-1 text-3xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function FilterButton({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-zinc-900 text-white"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
      }`}
    >
      {children}
    </a>
  );
}

function PRRow({
  pr,
  repoName,
  analysis,
}: {
  pr: typeof pullRequests.$inferSelect;
  repoName: string;
  analysis: typeof prAnalyses.$inferSelect | null;
}) {
  const valueScore = analysis?.valueScore;
  const riskScore = analysis?.riskScore;
  const hasSlop =
    analysis?.aiSlopIndicators &&
    Array.isArray(analysis.aiSlopIndicators) &&
    analysis.aiSlopIndicators.length > 0;

  return (
    <Link
      href={`/dashboard/pr/${pr.id}`}
      className="group flex items-center justify-between py-4 transition-colors hover:bg-zinc-50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span>{repoName}</span>
          <span>/</span>
          <span className="font-mono">#{pr.githubPrNumber}</span>
          {pr.draft && (
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">
              Draft
            </span>
          )}
          {hasSlop && (
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">
              AI Slop
            </span>
          )}
        </div>
        <h3 className="mt-1 truncate text-sm font-medium text-zinc-900">
          {pr.title}
        </h3>
        <div className="mt-1.5 flex items-center gap-4 text-sm text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-medium text-zinc-600">
              {pr.authorLogin.charAt(0).toUpperCase()}
            </span>
            {pr.authorLogin}
          </span>
          <span className="font-mono text-xs">
            +{pr.additions} / -{pr.deletions}
          </span>
          <span>{pr.changedFiles} files</span>
        </div>
      </div>

      <div className="flex items-center gap-4 ml-4 text-sm">
        {analysis ? (
          <>
            <ScoreBadge label="Value" score={valueScore ?? 0} />
            <ScoreBadge label="Risk" score={riskScore ?? 0} />
          </>
        ) : (
          <span className="text-zinc-400">Pending</span>
        )}
      </div>
    </Link>
  );
}

function ScoreBadge({
  label,
  score,
}: {
  label: string;
  score: number;
}) {
  return (
    <div className="text-right">
      <p className="text-[10px] uppercase tracking-wider text-zinc-400">{label}</p>
      <p className="mt-0.5 font-medium text-zinc-900">{score}</p>
    </div>
  );
}

// Icons
function SearchIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}
