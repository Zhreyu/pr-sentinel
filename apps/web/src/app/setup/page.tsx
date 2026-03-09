import { isSetupComplete } from "@/lib/setup";
import { redirect } from "next/navigation";

export default async function SetupPage({
    searchParams
}: {
    searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const complete = await isSetupComplete();
  if (complete) redirect("/");

  const params = await searchParams;
  const error = params.error;
  const status = params.status;

  return (
    <main className="min-h-screen relative flex items-center justify-center p-8 overflow-hidden bg-[var(--bg-main)]">
      <div className="absolute inset-0 tech-grid opacity-40 pointer-events-none"></div>
      <div className="relative z-10 w-full max-w-2xl animate-fade">
        <div className="card-border bg-[var(--bg-sidebar)]/80 p-10 md:p-14 backdrop-blur-xl border-[var(--border-bright)]">
          <div className="flex flex-col items-center text-center mb-10">
            <div className="w-14 h-14 bg-[var(--text-main)] flex items-center justify-center rounded-2xl mb-8 text-[var(--bg-main)] shadow-xl shadow-black/5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[var(--text-main)] uppercase">
              Bootstrap Setup
            </h1>
            <p className="mt-4 text-[15px] text-[var(--text-secondary)] max-w-xl leading-relaxed">
              PR Sentinel is now installed through the terminal bootstrap flow. Run{" "}
              <code className="font-mono">pnpm bootstrap</code> on the host machine to create
              the environment file, start Docker services, link GitHub, and finish the first workspace login.
            </p>
          </div>

          {error ? (
            <div className="mb-8 rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-500">
              {error}
            </div>
          ) : null}

          {status === "github-app-created" ? (
            <div className="mb-8 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-500">
              GitHub App credentials were saved. Return to the terminal and continue the bootstrap flow.
            </div>
          ) : null}

          <div className="space-y-5">
            <div className="rounded-xl border border-[var(--border-dim)] bg-[var(--bg-main)] px-5 py-4">
              <p className="text-[11px] font-mono font-bold tracking-[0.2em] text-[var(--text-muted)] uppercase">
                First Run
              </p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Use <code className="font-mono">pnpm bootstrap</code> once per installation.
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border-dim)] bg-[var(--bg-main)] px-5 py-4">
              <p className="text-[11px] font-mono font-bold tracking-[0.2em] text-[var(--text-muted)] uppercase">
                Normal Runtime
              </p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                After bootstrap, manage the full Docker stack with{" "}
                <code className="font-mono">pnpm start</code>,{" "}
                <code className="font-mono">pnpm stop</code>, and{" "}
                <code className="font-mono">pnpm restart</code>.
              </p>
            </div>

            <div className="pt-4">
              <a
                href="/"
                className="btn-primary inline-flex justify-center py-3 px-6 text-sm font-bold rounded-xl bg-[var(--text-main)] text-[var(--bg-main)]"
              >
                Back to Home
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
