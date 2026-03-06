import { db } from "@pr-sentinel/database";
import {
  pullRequests,
  repositories,
  prAnalyses,
} from "@pr-sentinel/database/schema";
import { eq, desc, and, sql, gte, lt, or, ilike } from "drizzle-orm";
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
      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard title="Open PRs" value={totalOpen} />
        <StatCard title="Analyzed" value={analyzed} color="blue" />
        <StatCard title="High Value" value={highValue} color="green" />
        <StatCard title="AI Slop" value={hasSlop} color="red" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Filter</label>
          <div className="flex gap-1">
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
          <label className="mb-1 block text-xs font-medium text-gray-500">Sort</label>
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

        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-500">Search</label>
          <form action="/dashboard" method="GET">
            <input type="hidden" name="filter" value={filter} />
            <input type="hidden" name="sort" value={sort} />
            <input
              type="text"
              name="search"
              placeholder="Search by title, author, or repo..."
              defaultValue={search}
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </form>
        </div>
      </div>

      {/* PR List */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold">
            Pull Requests
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({filteredPRs.length} shown)
            </span>
          </h2>
        </div>

        {filteredPRs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="mb-2">No pull requests match your filters.</p>
            <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
              Clear filters
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
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
  color = "gray",
}: {
  title: string;
  value: number;
  color?: "gray" | "blue" | "green" | "red";
}) {
  const colors = {
    gray: "bg-gray-100 text-gray-900",
    blue: "bg-blue-100 text-blue-800",
    green: "bg-green-100 text-green-800",
    red: "bg-red-100 text-red-800",
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className={`mt-1 inline-block rounded-full px-3 py-1 text-2xl font-bold ${colors[color]}`}>
        {value}
      </p>
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
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {children}
    </Link>
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

  const priorityScore = analysis ? analysis.valueScore - analysis.riskScore : null;

  return (
    <Link
      href={`/dashboard/pr/${pr.id}`}
      className="flex items-center justify-between px-6 py-4 transition-colors hover:bg-gray-50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{repoName}</span>
          <span className="text-gray-300">•</span>
          <span className="text-sm text-gray-500">#{pr.githubPrNumber}</span>
          {pr.draft && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              Draft
            </span>
          )}
          {hasSlop && (
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
              AI Slop
            </span>
          )}
        </div>
        <h3 className="mt-1 truncate font-medium text-gray-900">{pr.title}</h3>
        <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
          <span>{pr.authorLogin}</span>
          <span className="text-green-600">+{pr.additions}</span>
          <span className="text-red-600">-{pr.deletions}</span>
          <span>{pr.changedFiles} files</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {analysis ? (
          <>
            {priorityScore !== null && (
              <div className="text-center">
                <p className="text-xs text-gray-500">Priority</p>
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-sm font-semibold ${
                    priorityScore >= 50
                      ? "bg-green-100 text-green-800"
                      : priorityScore >= 20
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {priorityScore}
                </span>
              </div>
            )}
            <ScoreBadge label="Value" score={valueScore ?? 0} type="value" />
            <ScoreBadge label="Risk" score={riskScore ?? 0} type="risk" />
          </>
        ) : (
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-500">
            Pending
          </span>
        )}
      </div>
    </Link>
  );
}

function ScoreBadge({
  label,
  score,
  type,
}: {
  label: string;
  score: number;
  type: "value" | "risk";
}) {
  const getColor = () => {
    if (type === "value") {
      if (score >= 70) return "bg-green-100 text-green-800";
      if (score >= 40) return "bg-yellow-100 text-yellow-800";
      return "bg-gray-100 text-gray-800";
    }
    // risk
    if (score >= 70) return "bg-red-100 text-red-800";
    if (score >= 40) return "bg-yellow-100 text-yellow-800";
    return "bg-green-100 text-green-800";
  };

  return (
    <div className="text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-sm font-semibold ${getColor()}`}>
        {score}
      </span>
    </div>
  );
}
