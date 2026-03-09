import Link from "next/link";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { db } from "@pr-sentinel/database";
import { organizations, organizationMembers } from "@pr-sentinel/database/schema";
import { eq } from "drizzle-orm";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/");
  }

  // Fetch all organizations for this user
  const userOrgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      githubOrgLogin: organizations.githubOrgLogin,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, session.userId));

  // Determine active workspace (for now, just the first)
  const activeWorkspace = userOrgs[0];

  return (
    <div className="flex h-screen bg-[var(--bg-main)] font-sans selection:bg-emerald-500/30 overflow-hidden">
      {/* Sidebar - Pro Layout */}
      <aside className="w-[280px] flex flex-col border-r border-[var(--border-dim)] bg-[var(--bg-sidebar)] z-50 shrink-0">

        {/* Workspace Switcher Area - Precision Alignment */}
        <div className="h-20 flex items-center px-4 border-b border-[var(--border-dim)]">
          <WorkspaceSwitcher
            workspaces={userOrgs}
            activeWorkspaceId={activeWorkspace?.id}
          />
        </div>

        {/* Unified Navigation */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <div className="px-3 mb-2">
            <span className="text-[10px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-[0.2em]">MAIN_MENU</span>
          </div>

          <Link href="/dashboard" className="nav-link group py-2.5">
            <svg className="group-hover:text-[var(--accent)] transition-colors" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="9" height="9" rx="2" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="9" height="9" rx="2" /><rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
            Dashboard
          </Link>
          <Link href="/dashboard/repos" className="nav-link group py-2.5">
            <svg className="group-hover:text-[var(--accent)] transition-colors" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Repositories
          </Link>
          <Link href="/dashboard/settings" className="nav-link group py-2.5">
            <svg className="group-hover:text-[var(--accent)] transition-colors" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />
            </svg>
            Settings
          </Link>
        </nav>

        {/* Pro Account Management Footer */}
        <div className="p-4 border-t border-[var(--border-dim)] bg-[rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between gap-3 p-2 group bg-black/5 border border-transparent hover:border-[var(--border-dim)] rounded-xl transition-all">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative">
                <img src={session.avatarUrl || ""} className="w-8 h-8 rounded-lg grayscale group-hover:grayscale-0 transition-all border border-[var(--border-dim)]" alt="" />
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-[var(--bg-sidebar)] rounded-full"></div>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-[var(--text-main)] truncate">{session.githubLogin}</span>
                <span className="text-[9px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-tight">Authenticated</span>
              </div>
            </div>

            <Link href="/api/auth/logout" className="p-2 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-muted)] hover:text-rose-500 transition-colors" title="SECURE_LOGOUT">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Technical Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <div className="absolute inset-0 tech-grid pointer-events-none opacity-20"></div>

        {/* Top Header - High Precision Alignment */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-[var(--border-dim)] z-10 bg-[var(--bg-main)]/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-4 text-[11px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest">
            <span className="opacity-50">PR_SENTINEL</span>
            <div className="w-1 h-1 bg-[var(--border-bright)] rounded-full"></div>
            <span className="text-[var(--accent)]">{activeWorkspace?.name || activeWorkspace?.githubOrgLogin || 'WORKSPACE_NULL'}</span>
            <div className="w-1 h-1 bg-[var(--border-bright)] rounded-full"></div>
            <span className="opacity-50">ROOT_STATION</span>
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <div className="h-8 w-px bg-[var(--border-dim)] mx-1"></div>
            <div className="flex items-center gap-2.5 px-3 py-1.5 bg-[var(--bg-hover)]/50 rounded-lg border border-[var(--border-dim)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shadow-[0_0_8px_var(--accent)]"></span>
              <span className="text-[10px] font-mono font-bold text-[var(--text-muted)] tracking-wider">SYSTEM_ONLINE</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto relative z-10 w-full">
          <div className="max-w-7xl mx-auto p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
