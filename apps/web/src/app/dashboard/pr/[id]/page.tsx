import { db } from "@pr-sentinel/database";
import {
  pullRequests,
  repositories,
  prAnalyses,
} from "@pr-sentinel/database/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function PRDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch PR with repo and latest analysis
  const prData = await db
    .select({
      pr: pullRequests,
      repo: repositories,
    })
    .from(pullRequests)
    .leftJoin(repositories, eq(pullRequests.repositoryId, repositories.id))
    .where(eq(pullRequests.id, id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!prData) {
    notFound();
  }

  const { pr, repo } = prData;

  // Get latest analysis
  const analysis = await db
    .select()
    .from(prAnalyses)
    .where(eq(prAnalyses.pullRequestId, pr.id))
    .orderBy(desc(prAnalyses.createdAt))
    .limit(1)
    .then((rows) => rows[0]);

  const githubUrl = repo
    ? `https://github.com/${repo.githubFullName}/pull/${pr.githubPrNumber}`
    : null;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeftIcon />
        Back to dashboard
      </Link>

      {/* PR Header */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>{repo?.githubFullName ?? "Unknown"}</span>
              <span>•</span>
              <span>#{pr.githubPrNumber}</span>
              {pr.authorAssociation && (
                <>
                  <span>•</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                    {formatAssociation(pr.authorAssociation)}
                  </span>
                </>
              )}
              {pr.isFromFork && (
                <>
                  <span>•</span>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                    Fork
                  </span>
                </>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  pr.state === "open"
                    ? "bg-green-100 text-green-800"
                    : pr.state === "merged"
                      ? "bg-purple-100 text-purple-800"
                      : "bg-gray-100 text-gray-800"
                }`}
              >
                {pr.state}
              </span>
              {pr.draft && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  Draft
                </span>
              )}
            </div>
            <h1 className="mt-2 text-2xl font-bold">{pr.title}</h1>
            <p className="mt-2 text-gray-600">
              Opened by <span className="font-medium">{pr.authorLogin}</span>
            </p>
          </div>

          {githubUrl && (
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              View on GitHub
            </a>
          )}
        </div>

        {/* Stats */}
        <div className="mt-6 flex gap-6 text-sm">
          <div>
            <span className="text-gray-500">Files changed:</span>{" "}
            <span className="font-medium">{pr.changedFiles}</span>
          </div>
          <div>
            <span className="text-gray-500">Commits:</span>{" "}
            <span className="font-medium">{pr.commitCount}</span>
          </div>
          <div>
            <span className="text-green-600">+{pr.additions}</span>{" "}
            <span className="text-red-600">-{pr.deletions}</span>
          </div>
        </div>

        {/* Description */}
        {pr.body && (
          <div className="mt-6 border-t border-gray-200 pt-6">
            <h3 className="mb-2 text-sm font-medium text-gray-500">Description</h3>
            <p className="whitespace-pre-wrap text-gray-700">{pr.body}</p>
          </div>
        )}
      </div>

      {/* Analysis */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold">AI Analysis</h2>

        {analysis ? (
          <div className="mt-4 space-y-6">
            {/* Scores */}
            <div className="grid gap-4 sm:grid-cols-4">
              <ScoreCard
                label="Value Score"
                score={analysis.valueScore}
                description="How valuable this PR is to the project"
                type="value"
              />
              <ScoreCard
                label="Risk Score"
                score={analysis.riskScore}
                description="Potential risk of merging this PR"
                type="risk"
              />
              <ConfidenceCard
                score={
                  analysis.intentClassification &&
                  typeof analysis.intentClassification === "object" &&
                  "overallConfidence" in analysis.intentClassification &&
                  typeof analysis.intentClassification.overallConfidence === "number"
                    ? analysis.intentClassification.overallConfidence
                    : null
                }
              />
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-500">Intent</p>
                <p className="mt-1 text-lg font-semibold capitalize">
                  {analysis.intentClassification &&
                  typeof analysis.intentClassification === "object" &&
                  "type" in analysis.intentClassification
                    ? String(analysis.intentClassification.type)
                    : "Unknown"}
                </p>
              </div>
            </div>

            {analysis.intentClassification &&
              typeof analysis.intentClassification === "object" &&
              "maintainerSummary" in analysis.intentClassification &&
              typeof analysis.intentClassification.maintainerSummary === "string" &&
              analysis.intentClassification.maintainerSummary.length > 0 && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                <p className="text-sm font-medium text-blue-900">Maintainer Summary</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-blue-900/90">
                  {analysis.intentClassification.maintainerSummary}
                </p>
                {"needsMaintainerAttention" in analysis.intentClassification &&
                  typeof analysis.intentClassification.needsMaintainerAttention === "boolean" && (
                  <p className="mt-3 text-xs font-medium uppercase tracking-wide text-blue-700">
                    {analysis.intentClassification.needsMaintainerAttention
                      ? "Maintainer attention recommended"
                      : "Can likely be triaged quickly"}
                  </p>
                )}
              </div>
            )}

            {analysis.intentClassification &&
              typeof analysis.intentClassification === "object" &&
              "topFilesToInspect" in analysis.intentClassification &&
              Array.isArray(analysis.intentClassification.topFilesToInspect) &&
              analysis.intentClassification.topFilesToInspect.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-500">Top Files To Inspect</h3>
                <div className="mt-2 space-y-2">
                  {analysis.intentClassification.topFilesToInspect.map((file, index) => (
                    <div key={`${file.path}-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="font-mono text-sm font-medium text-gray-900">{file.path}</p>
                      <p className="mt-1 text-sm text-gray-600">{file.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis.intentClassification &&
              typeof analysis.intentClassification === "object" &&
              "contextNotes" in analysis.intentClassification &&
              Array.isArray(analysis.intentClassification.contextNotes) &&
              analysis.intentClassification.contextNotes.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-500">Context Notes</h3>
                <ul className="mt-2 space-y-2">
                  {analysis.intentClassification.contextNotes.map((note, index) => (
                    <li key={index} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* AI Slop Indicators */}
            {analysis.aiSlopIndicators &&
              Array.isArray(analysis.aiSlopIndicators) &&
              analysis.aiSlopIndicators.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500">
                    AI Slop Indicators
                  </h3>
                  <div className="mt-2 space-y-2">
                    {analysis.aiSlopIndicators.map((indicator, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-yellow-200 bg-yellow-50 p-3"
                      >
                        <p className="font-medium text-yellow-800">
                          {String(indicator.type).replace(/_/g, " ")}
                        </p>
                        <p className="mt-1 text-sm text-yellow-700">
                          {indicator.evidence}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {analysis.reviewSuggestions &&
              Array.isArray(analysis.reviewSuggestions) &&
              analysis.reviewSuggestions.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Review Suggestions</h3>
                  <div className="mt-2 space-y-2">
                    {analysis.reviewSuggestions.map((suggestion, index) => (
                      <div key={index} className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium uppercase text-gray-600">
                            {String(suggestion.severity)}
                          </span>
                          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                            {String(suggestion.type)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-medium text-gray-900">{suggestion.message}</p>
                        {typeof suggestion.whyItMatters === "string" && suggestion.whyItMatters.length > 0 && (
                          <p className="mt-2 text-sm text-gray-600">{suggestion.whyItMatters}</p>
                        )}
                        {suggestion.location && (
                          <p className="mt-2 font-mono text-xs text-gray-500">
                            {suggestion.location.file}
                            {suggestion.location.startLine ? `:${suggestion.location.startLine}` : ""}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Analysis metadata */}
            <div className="text-sm text-gray-500">
              <p>
                Analyzed by <span className="font-medium">{analysis.modelUsed}</span> •{" "}
                {analysis.tokensUsed} tokens
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-gray-500">
            Analysis pending. The PR will be analyzed shortly.
          </p>
        )}
      </div>
    </div>
  );
}

function ConfidenceCard({ score }: { score: number | null }) {
  const percentage = score === null ? null : Math.round(score * 100);

  return (
    <div className="rounded-lg bg-gray-50 p-4">
      <p className="text-sm font-medium text-gray-500">Confidence</p>
      <p className="mt-1 text-3xl font-bold text-gray-800">
        {percentage === null ? "N/A" : `${percentage}%`}
      </p>
      <p className="mt-1 text-xs text-gray-400">How certain the analyzer is about this assessment</p>
    </div>
  );
}

function ScoreCard({
  label,
  score,
  description,
  type,
}: {
  label: string;
  score: number;
  description: string;
  type: "value" | "risk";
}) {
  const getColor = () => {
    if (type === "value") {
      if (score >= 70) return "text-green-600";
      if (score >= 40) return "text-yellow-600";
      return "text-gray-600";
    }
    if (score >= 70) return "text-red-600";
    if (score >= 40) return "text-yellow-600";
    return "text-green-600";
  };

  return (
    <div className="rounded-lg bg-gray-50 p-4">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${getColor()}`}>{score}</p>
      <p className="mt-1 text-xs text-gray-400">{description}</p>
    </div>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 19l-7-7m0 0l7-7m-7 7h18"
      />
    </svg>
  );
}

function formatAssociation(value: string) {
  return value.replace(/_/g, " ");
}
