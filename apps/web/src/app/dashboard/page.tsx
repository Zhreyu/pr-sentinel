import { db } from "@pr-sentinel/database";
import { pullRequests, repositories, prAnalyses } from "@pr-sentinel/database/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { getSession } from "@/lib/session";
import Link from "next/link";

type FilterType =
  | "all"
  | "high-value"
  | "medium"
  | "low-signal"
  | "slop"
  | "pending"
  | "maintainer"
  | "external"
  | "first-time";
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

  if (!session) return null;

  const filter = params.filter ?? "all";
  const sort = params.sort ?? "priority";
  const search = params.search ?? "";

  const baseQuery = db
    .select({ pr: pullRequests, repo: repositories, analysis: prAnalyses })
    .from(pullRequests)
    .leftJoin(repositories, eq(pullRequests.repositoryId, repositories.id))
    .leftJoin(
      prAnalyses,
      and(
        eq(prAnalyses.pullRequestId, pullRequests.id),
        eq(prAnalyses.id, sql`(SELECT id FROM pr_analyses WHERE pull_request_id = ${pullRequests.id} ORDER BY created_at DESC LIMIT 1)`)
      )
    )
    .where(eq(pullRequests.state, "open"));

  const allPRs = await baseQuery.orderBy(desc(pullRequests.githubUpdatedAt)).limit(200);

  let filteredPRs = allPRs;
  if (search) {
    const s = search.toLowerCase();
    filteredPRs = filteredPRs.filter(({ pr, repo }) =>
      pr.title.toLowerCase().includes(s) ||
      pr.authorLogin.toLowerCase().includes(s) ||
      (repo?.githubFullName?.toLowerCase().includes(s) ?? false)
    );
  }

  if (filter !== "all") {
    filteredPRs = filteredPRs.filter(({ pr, analysis }) => {
      if (filter === "pending") return !analysis;
      if (filter === "maintainer") return isMaintainerAssociation(pr.authorAssociation);
      if (filter === "external") return !isMaintainerAssociation(pr.authorAssociation);
      if (filter === "first-time") return isFirstTimeContributor(pr.authorAssociation);
      if (!analysis) return false;
      const hasSlop = analysis.aiSlopIndicators && Array.isArray(analysis.aiSlopIndicators) && analysis.aiSlopIndicators.length > 0;
      switch (filter) {
        case "high-value": return analysis.valueScore >= 70 && !hasSlop;
        case "medium": return analysis.valueScore >= 40 && analysis.valueScore < 70 && !hasSlop;
        case "low-signal": return analysis.valueScore < 40 && !hasSlop;
        case "slop": return hasSlop;
        default: return true;
      }
    });
  }

  filteredPRs.sort((a, b) => {
    if (sort === "priority") {
      const ap = getPriorityScore(a.pr, a.analysis);
      const bp = getPriorityScore(b.pr, b.analysis);
      return bp - ap;
    }
    if (sort === "updated") return b.pr.githubUpdatedAt - a.pr.githubUpdatedAt;
    if (sort === "created") return b.pr.githubCreatedAt - a.pr.githubCreatedAt;
    return 0;
  });

  const totalOpen = allPRs.length;
  const analyzed = allPRs.filter((p) => p.analysis).length;
  const highValue = allPRs.filter((p) => p.analysis && p.analysis.valueScore >= 70).length;
  const slopCount = allPRs.filter((p) => p.analysis?.aiSlopIndicators && Array.isArray(p.analysis.aiSlopIndicators) && p.analysis.aiSlopIndicators.length > 0).length;
  const firstTimeCount = allPRs.filter((p) => isFirstTimeContributor(p.pr.authorAssociation)).length;

  return (
    <div className="animate-fade">
      {/* Precision Stats Row */}
      <div className="flex flex-wrap gap-8 items-center mb-12 py-6 border-y border-[var(--border-dim)]">
        <CompactStat title="Open PRs" value={totalOpen} label="TOTAL" />
        <div className="w-px h-8 bg-[var(--border-dim)]"></div>
        <CompactStat title="Analyzed" value={analyzed} label="AUTO" />
        <div className="w-px h-8 bg-[var(--border-dim)]"></div>
        <CompactStat title="High Value" value={highValue} label="PRECISION" color="text-[var(--text-main)]" />
        <div className="w-px h-8 bg-[var(--border-dim)]"></div>
        <CompactStat title="First Time" value={firstTimeCount} label="CONTRIB" color="text-sky-400" />
        <div className="w-px h-8 bg-[var(--border-dim)]"></div>
        <CompactStat title="AI Slop" value={slopCount} label="REJECT" color="text-[var(--danger)]" />
      </div>

      {/* Structured Toolbars */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-main)] border border-[var(--border-dim)] rounded-lg">
          {["all", "high-value", "first-time", "maintainer", "external", "slop", "pending"].map((f) => (
            <a
              key={f}
              href={buildUrl(params, { filter: f as FilterType })}
              className={`px-3 py-1 text-[11px] font-bold uppercase tracking-widest rounded transition-all ${filter === f ? 'bg-[var(--bg-hover)] text-[var(--accent)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
            >
              {f.replace("-", " ")}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {/* Search Box - Sharp UI */}
          <form action="/dashboard" method="GET" className="relative group">
            <input type="hidden" name="filter" value={filter} />
            <input type="hidden" name="sort" value={sort} />
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-[var(--text-muted)]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            </div>
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="search_metadata..."
              className="input-field pl-12 w-[180px] focus:w-[260px] font-mono text-xs tracking-tight bg-[var(--bg-main)] border-[var(--border-bright)] focus:border-[var(--accent)] transition-all duration-300"
            />
          </form>

          <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-main)] border border-[var(--border-dim)] rounded-lg">
            {(["priority", "updated"] as SortType[]).map((s) => (
              <a
                key={s}
                href={buildUrl(params, { sort: s })}
                className={`px-3 py-1 text-[11px] font-bold uppercase tracking-widest rounded transition-all ${sort === s ? 'bg-[var(--bg-hover)] text-[var(--accent)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
              >
                {s}
              </a>
            ))}
          </div>
        </div>
      </div>
      <p className="mb-6 text-[11px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">
        priority_sort = value - risk + maintainer_attention + contributor_context
      </p>

      {/* Main List Area - High Density */}
      <div className="space-y-[1px] bg-[var(--border-dim)] border border-[var(--border-dim)] rounded-lg overflow-hidden shadow-2xl">
        {filteredPRs.length === 0 ? (
          <div className="bg-[var(--bg-main)] p-20 text-center">
            <p className="text-[var(--text-muted)] font-mono text-xs uppercase tracking-[4px]">no_entries_match_criteria</p>
          </div>
        ) : (
          filteredPRs.map(({ pr, repo, analysis }, i) => (
            <TechnicalPRRow
              key={pr.id}
              pr={pr}
              repoName={repo?.githubFullName ?? "unknown"}
              analysis={analysis}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CompactStat({ title, value, label, color = "text-zinc-400" }: { title: string; value: number; label: string; color?: string }) {
  return (
    <div className="flex flex-col">
      <div className="text-[10px] font-mono font-bold text-[var(--text-muted)] tracking-[0.2em] mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-mono font-extrabold tracking-tighter ${color}`}>{value}</span>
        <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-tight">{title}</span>
      </div>
    </div>
  );
}

function TechnicalPRRow({ pr, repoName, analysis }: { pr: any, repoName: string, analysis: any }) {
  const hasSlop = analysis?.aiSlopIndicators && analysis.aiSlopIndicators.length > 0;
  const association = formatAuthorAssociation(pr.authorAssociation);
  const isMaintainer = isMaintainerAssociation(pr.authorAssociation);
  const isFirstTimer = isFirstTimeContributor(pr.authorAssociation);

  return (
    <Link href={`/dashboard/pr/${pr.id}`} className="flex items-center gap-4 px-6 py-4 bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] group transition-all duration-150 border-l-2 border-transparent hover:border-[var(--accent)]">
      {/* Side Color Indicator based on Analysis */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1.5 font-mono text-[10px] uppercase font-bold tracking-widest text-[var(--text-muted)]">
          <span className="text-[var(--text-secondary)] group-hover:text-[var(--accent)] transition-colors uppercase">{repoName.slice(0, 12)}</span>
          <span className="opacity-30">/</span>
          <span>#{pr.githubPrNumber}</span>
          {pr.draft && <span className="text-[var(--text-muted)] bg-[var(--bg-hover)] px-1.5 rounded">DRAFT</span>}
          <span
            className={`px-1.5 rounded border ${
              isFirstTimer
                ? "text-sky-400 border-sky-500/20 bg-sky-500/10"
                : isMaintainer
                ? "text-emerald-500 border-emerald-500/20 bg-emerald-500/10"
                : "text-amber-500 border-amber-500/20 bg-amber-500/10"
            }`}
          >
            {association}
          </span>
          {pr.isFromFork && (
            <span className="text-sky-400 bg-sky-500/10 px-1.5 rounded border border-sky-500/20">FORK</span>
          )}
          {hasSlop && <span className="text-[var(--danger)] bg-[var(--danger)]/10 px-1.5 rounded border border-[var(--danger)]/20 animate-pulse">SLOP_DETECTED</span>}
        </div>

        <h3 className="text-[15px] font-semibold text-[var(--text-main)] transition-colors truncate">
          {pr.title}
        </h3>

        <div className="mt-2 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <img src={`https://github.com/${pr.authorLogin}.png?size=40`} className="w-4 h-4 rounded grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all border border-[var(--border-dim)]" />
            <span className="text-xs text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">{pr.authorLogin}</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="text-[var(--accent)] opacity-70">+{pr.additions}</span>
            <span className="text-[var(--danger)] opacity-70">-{pr.deletions}</span>
          </div>
        </div>
      </div>

      {/* Analysis Output Section */}
      <div className="flex items-center gap-10 border-l border-[var(--border-dim)] pl-10">
        {analysis ? (
          <div className="flex items-center gap-8">
            <div className="flex flex-col items-center">
              <span className="text-[9px] font-mono font-bold text-[var(--text-muted)] uppercase mb-1">Val</span>
              <span className={`text-base font-mono font-bold ${analysis.valueScore >= 70 ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>{analysis.valueScore}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[9px] font-mono font-bold text-[var(--text-muted)] uppercase mb-1">Risk</span>
              <span className={`text-base font-mono font-bold ${analysis.riskScore >= 70 ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]'}`}>{analysis.riskScore}</span>
            </div>
          </div>
        ) : (
          <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest px-4 py-2 border border-[var(--border-dim)]/50 rounded bg-[var(--bg-main)]/40 italic">
            pending_analysis
          </div>
        )}

        <div className="text-[var(--text-muted)] group-hover:text-[var(--text-main)] transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      </div>
    </Link>
  );
}

function buildUrl(current: SearchParams, update: Partial<SearchParams>): string {
  const p = new URLSearchParams();
  const merged = { ...current, ...update };
  if (merged.filter && merged.filter !== "all") p.set("filter", merged.filter);
  if (merged.sort && merged.sort !== "priority") p.set("sort", merged.sort);
  if (merged.search) p.set("search", merged.search);
  const q = p.toString();
  return q ? `/dashboard?${q}` : "/dashboard";
}

function isMaintainerAssociation(association?: string | null): boolean {
  return association === "OWNER" || association === "MEMBER" || association === "COLLABORATOR";
}

function isFirstTimeContributor(association?: string | null): boolean {
  return association === "FIRST_TIMER" || association === "FIRST_TIME_CONTRIBUTOR";
}

function formatAuthorAssociation(association?: string | null): string {
  if (!association) return "UNKNOWN";
  return association.replace(/_/g, " ");
}

function getPriorityScore(pr: any, analysis: any): number {
  let score = analysis ? analysis.valueScore - analysis.riskScore : -20;

  if (!analysis) {
    score += 5;
  }

  if (isFirstTimeContributor(pr.authorAssociation)) {
    score += 18;
  } else if (!isMaintainerAssociation(pr.authorAssociation)) {
    score += 8;
  }

  if (pr.isFromFork) {
    score += 4;
  }

  if (typeof pr.commitCount === "number" && pr.commitCount >= 10) {
    score += 4;
  }

  const intent = analysis?.intentClassification;
  if (
    intent &&
    typeof intent === "object" &&
    "needsMaintainerAttention" in intent &&
    intent.needsMaintainerAttention === true
  ) {
    score += 12;
  }

  if (
    intent &&
    typeof intent === "object" &&
    "overallConfidence" in intent &&
    typeof intent.overallConfidence === "number" &&
    intent.overallConfidence < 0.45
  ) {
    score += 3;
  }

  if (pr.draft) {
    score -= 10;
  }

  return score;
}
