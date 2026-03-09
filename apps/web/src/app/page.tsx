import { getSession } from "@/lib/session";
import { isSetupComplete } from "@/lib/setup";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  const setupComplete = await isSetupComplete();

  return (
    <main className="min-h-screen relative flex flex-col items-center justify-center p-8 overflow-hidden bg-[var(--bg-main)]">
      {/* Precision Background */}
      <div className="absolute inset-0 tech-grid pointer-events-none opacity-40"></div>

      {/* Decorative Blur - Subtle */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[var(--accent)] opacity-[0.03] blur-[120px] pointer-events-none"></div>

      <div className="relative z-10 w-full max-w-[640px] flex flex-col items-center text-center">

        {/* Release Metadata */}
        <div className="mb-12 flex items-center gap-3 px-4 py-1.5 rounded-full border border-[var(--border-dim)] bg-[var(--bg-sidebar)]/50 backdrop-blur-sm animate-fade">
          <span className="flex h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse"></span>
          <span className="text-[10px] font-mono font-bold text-[var(--text-secondary)] tracking-[0.2em] uppercase">
            v1.0.0-stable // RELEASE_READY
          </span>
        </div>

        {/* Hero Section - Balanced Typography */}
        <div className="mb-16 animate-fade" style={{ animationDelay: '100ms' }}>
          <h1 className="text-[64px] md:text-[88px] font-extrabold tracking-[-0.04em] leading-[0.9] mb-8 text-[var(--text-main)]">
            PR Sentinel<span className="text-[var(--accent)]">_</span>
          </h1>
          <p className="text-[18px] md:text-[21px] text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed font-medium">
            High-precision triage for modern engineering teams.
            Automated intelligence for every pull request.
          </p>
        </div>

        {/* Central Auth Gateway - Sharp Alignment */}
        <div className="w-full max-w-[440px] animate-fade" style={{ animationDelay: '200ms' }}>
          <div className="card-border p-10 bg-[var(--bg-sidebar)]/80 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.05)] border-[var(--border-bright)] relative group">

            {/* Header Allignment Fix */}
            <div className="flex flex-col items-center mb-8">
              <span className="text-[11px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-[0.3em] mb-4">/ AUTH_SEQUENCE_INIT</span>
              <div className="h-px w-12 bg-[var(--border-dim)] group-hover:w-20 transition-all duration-500"></div>
            </div>

            {setupComplete ? (
              <a
                href="/api/auth/github"
                className="btn-primary w-full justify-center py-4 text-base font-bold rounded-xl shadow-lg shadow-[var(--bg-main)]/5 hover:scale-[1.02] active:scale-[0.98] transition-all bg-[var(--text-main)] text-[var(--bg-main)]"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                Sign-in with GitHub
              </a>
            ) : (
              <div className="space-y-4">
                <a
                  href="/setup"
                  className="btn-primary w-full justify-center py-4 text-base font-bold rounded-xl shadow-lg shadow-[var(--bg-main)]/5 transition-all bg-[var(--text-main)] text-[var(--bg-main)]"
                >
                  Finish Initial Setup
                </a>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                  Run <code className="font-mono">pnpm bootstrap</code> on the host machine to
                  provision Docker, create <code className="font-mono">.env</code>, and link GitHub.
                </p>
              </div>
            )}

            {/* Bottom Metrics - Perfectly Balanced */}
            <div className="mt-10 pt-8 border-t border-[var(--border-dim)] grid grid-cols-2 gap-px bg-[var(--border-dim)] rounded-lg overflow-hidden">
              <div className="bg-[var(--bg-sidebar)] p-4">
                <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-tighter mb-1">Architecture</p>
                <p className="text-[13px] font-mono font-bold text-[var(--text-secondary)] tracking-tight">E2E_SECURE</p>
              </div>
              <div className="bg-[var(--bg-sidebar)] p-4">
                <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-tighter mb-1">Intelligence</p>
                <p className="text-[13px] font-mono font-bold text-[var(--text-secondary)] tracking-tight">AI_AUGMENTED</p>
              </div>
            </div>
          </div>
        </div>

        {/* Global Footer info */}
        <div className="mt-16 text-[var(--text-muted)] font-mono text-[11px] opacity-60 flex items-center gap-4">
          <span className="tracking-[0.4em]">SYSTEM_READY</span>
          <div className="w-8 h-px bg-[var(--border-dim)]"></div>
          <span className="tracking-[0.4em]">AWAITING_CONNECTION...</span>
        </div>
      </div>
    </main>
  );
}
