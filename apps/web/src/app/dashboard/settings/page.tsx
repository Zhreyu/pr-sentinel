import crypto from "node:crypto";
import { db } from "@pr-sentinel/database";
import {
  organizations,
  organizationMembers,
  invites,
  users,
} from "@pr-sentinel/database/schema";
import { eq, desc, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function isOrganizationAdmin(orgId: string, userId: string): Promise<boolean> {
  const membership = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.role, "admin")
      )
    )
    .limit(1);

  return membership.length > 0;
}

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  // Fetch active workspace
  const userOrgRow = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      githubOrgLogin: organizations.githubOrgLogin,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(eq(organizationMembers.userId, session.userId))
    .limit(1)
    .then((r) => r[0]);

  if (!userOrgRow) {
    return (
      <div className="p-20 text-center animate-fade">
        <h1 className="text-xl font-bold text-[var(--text-main)] mb-2 uppercase tracking-widest">NO_WORKSPACE_ASSOCIATED</h1>
        <p className="text-[var(--text-muted)] font-mono text-xs">ERR_ORG_MISSING</p>
      </div>
    );
  }

  const isAdmin = userOrgRow.role === "admin";

  // Fetch all members
  const members = await db
    .select({
      id: users.id,
      githubLogin: users.githubLogin,
      avatarUrl: users.avatarUrl,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(eq(organizationMembers.organizationId, userOrgRow.id));

  // Fetch invites
  const orgInvites = await db
    .select()
    .from(invites)
    .where(eq(invites.organizationId, userOrgRow.id))
    .orderBy(desc(invites.createdAt));

  /* ───── Server Actions ───── */

  async function updateWorkspaceName(formData: FormData) {
    "use server";
    const sess = await getSession();
    if (!sess) return;
    const orgId = formData.get("orgId") as string;
    const newName = formData.get("newName") as string;

    if (await isOrganizationAdmin(orgId, sess.userId)) {
      await db.update(organizations).set({ name: newName }).where(eq(organizations.id, orgId));
      revalidatePath("/dashboard/settings");
    }
  }

  async function createInvite(formData: FormData) {
    "use server";
    const sess = await getSession();
    if (!sess) return;
    const orgId = formData.get("orgId") as string;
    const githubUsername = formData.get("githubUsername") as string;
    const role = (formData.get("role") as "admin" | "member") || "member";

    if (!(await isOrganizationAdmin(orgId, sess.userId))) {
      return;
    }

    const token = crypto.randomBytes(24).toString("hex");

    await db.insert(invites).values({
      organizationId: orgId,
      invitedByUserId: sess.userId,
      githubUsername: githubUsername || null,
      inviteToken: token,
      role: role,
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    revalidatePath("/dashboard/settings");
  }

  return (
    <div className="animate-fade">
      <header className="mb-12 border-b border-[var(--border-dim)] pb-8">
        <h1 className="text-[40px] font-bold tracking-tight text-[var(--text-main)] mb-2 uppercase">Settings</h1>
        <p className="text-[var(--text-muted)] font-mono text-[14px]">/ SYSTEM_PREFERENCES & ACCESS_CONTROL</p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-12 items-start">

        {/* Main Configuration Flow */}
        <div className="space-y-16">

          {/* Workspace Branding */}
          <section id="general" className="space-y-6">
            <div className="flex items-center gap-4 h-8">
              <div className="w-1.5 h-6 bg-[var(--accent)] rounded-full"></div>
              <h2 className="text-xl font-bold uppercase tracking-tight text-[var(--text-main)]">General Workspace</h2>
            </div>

            <div className="card-border p-8 bg-[var(--bg-sidebar)]/30 backdrop-blur-sm">
              <form action={updateWorkspaceName} className="space-y-8">
                <input type="hidden" name="orgId" value={userOrgRow.id} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[11px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                      Workspace Alias
                    </label>
                    <input
                      name="newName"
                      defaultValue={userOrgRow.name || ""}
                      placeholder={userOrgRow.githubOrgLogin || "Display name..."}
                      className="input-field w-full py-3 px-4 text-base"
                      disabled={!isAdmin}
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                      Unique Identifier
                    </label>
                    <div className="input-field w-full bg-[var(--bg-main)]/50 text-[var(--text-muted)] font-mono flex items-center opacity-60 py-3">
                      {userOrgRow.githubOrgLogin}
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="pt-6 border-t border-[var(--border-dim)] flex justify-end">
                    <button type="submit" className="btn-primary py-2.5 px-8 shadow-lg shadow-emerald-500/10">SAVE_CONFIGURATION</button>
                  </div>
                )}
              </form>
            </div>
          </section>

          {/* Members & Team */}
          <section id="team" className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-1.5 h-6 bg-[var(--accent)] rounded-full"></div>
              <h2 className="text-xl font-bold uppercase tracking-tight text-[var(--text-main)]">Access & Team</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
              {/* Members List */}
              <div className="card-border overflow-hidden bg-[var(--bg-sidebar)]/30">
                <div className="px-6 py-4 bg-[var(--bg-main)]/40 border-b border-[var(--border-dim)] flex justify-between items-center">
                  <span className="text-[11px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest">Active Members [{members.length}]</span>
                </div>
                <div className="divide-y divide-[var(--border-dim)] max-h-[400px] overflow-y-auto">
                  {members.map(member => (
                    <div key={member.id} className="px-6 py-4 flex items-center justify-between hover:bg-[var(--bg-hover)] transition-colors group">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <img src={member.avatarUrl || ""} className="w-10 h-10 rounded-lg border border-[var(--border-dim)] grayscale group-hover:grayscale-0 transition-all" />
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-[var(--bg-sidebar)] rounded-full flex items-center justify-center">
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4"><path d="M20 6L9 17L4 12" /></svg>
                          </div>
                        </div>
                        <div>
                          <p className="text-[14px] font-bold text-[var(--text-main)] transition-colors">@{member.githubLogin}</p>
                          <p className="text-[10px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-tight">UID_{member.id.slice(0, 8)}</p>
                        </div>
                      </div>
                      <span className={`pill px-3 py-1 border text-[9px] ${member.role === 'admin' ? 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5' : 'border-[var(--border-dim)] text-[var(--text-muted)]'}`}>
                        {member.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Invite Action Card */}
              <div className="card-border p-6 bg-emerald-500/[0.02] border-emerald-500/10">
                <h3 className="text-[11px] font-mono font-bold text-[#10b981] uppercase tracking-[0.2em] mb-4">Grant Access</h3>
                <p className="text-xs text-[var(--text-muted)] mb-6 leading-relaxed">
                  Generate a technical handshake for new contributors. Tokens expire in 7 cycles.
                </p>
                <form action={createInvite} className="space-y-4">
                  <input type="hidden" name="orgId" value={userOrgRow.id} />
                  <input
                    name="githubUsername"
                    placeholder="GITHUB_HANDLE"
                    className="input-field w-full font-mono text-xs uppercase"
                    disabled={!isAdmin}
                  />
                  <select
                    name="role"
                    className="input-field w-full appearance-none font-mono text-xs bg-[var(--bg-main)]"
                    disabled={!isAdmin}
                  >
                    <option value="member">ROLE_MEMBER</option>
                    <option value="admin">ROLE_ADMIN</option>
                  </select>
                  <button
                    type="submit"
                    className="btn-primary w-full justify-center mt-2 group disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!isAdmin}
                  >
                    INITIALIZE_HANDSHAKE
                    <svg className="group-hover:translate-x-1 transition-transform" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                  </button>
                </form>
                {!isAdmin ? (
                  <p className="text-[10px] text-[var(--text-muted)] mt-3 uppercase">
                    Admin role required to create invitations.
                  </p>
                ) : null}
              </div>
            </div>

            {/* Invitations Table - Precise Listing */}
            <div className="card-border bg-black/5 overflow-hidden">
              <div className="px-6 py-2 border-b border-[var(--border-dim)] bg-black/10">
                <span className="text-[9px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-[0.2em]">Pending Invitations</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="bg-black/5 text-[var(--text-muted)] uppercase opacity-50">
                    <tr>
                      <th className="px-6 py-3 font-bold tracking-widest">Target</th>
                      <th className="px-6 py-3 font-bold tracking-widest">Expiration</th>
                      <th className="px-6 py-3 font-bold tracking-widest">Status</th>
                      <th className="px-6 py-3 font-bold tracking-widest text-right">Resource</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-dim)]">
                    {orgInvites.map(invite => (
                      <tr key={invite.id} className="hover:bg-black/5 transition-colors">
                        <td className="px-6 py-4 font-bold text-[var(--text-main)]">
                          {invite.githubUsername ? `@${invite.githubUsername}` : 'PUBLIC_GATE'}
                        </td>
                        <td className="px-6 py-4 text-[var(--text-secondary)]">
                          {new Date(invite.expiresAt!).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full border text-[9px] ${invite.status === 'pending' ? 'border-amber-500/20 text-amber-500' : 'border-[var(--border-dim)] text-[var(--text-muted)]'}`}>
                            {invite.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/invite/${invite.inviteToken}`);
                              alert("Session token copied.");
                            }}
                            className="text-[var(--accent)] hover:text-white transition-colors uppercase font-bold text-[9px] underline underline-offset-4"
                          >
                            COPY_LINK
                          </button>
                        </td>
                      </tr>
                    ))}
                    {orgInvites.length === 0 && (
                      <tr><td colSpan={4} className="px-6 py-10 text-center text-[var(--text-muted)] uppercase italic">Null set // no pending invitations</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Account Management Segment */}
          <section id="account" className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-1.5 h-6 bg-[var(--accent)] rounded-full"></div>
              <h2 className="text-xl font-bold uppercase tracking-tight text-[var(--text-main)]">Account Identity</h2>
            </div>

            <div className="card-border p-8 bg-[var(--bg-sidebar)]/30 backdrop-blur-sm">
              <div className="flex flex-col md:flex-row items-center gap-10">
                <div className="relative shrink-0">
                  <img src={session.avatarUrl || ""} className="w-24 h-24 rounded-2xl border-2 border-[var(--border-dim)] shadow-xl" />
                  <div className="absolute -bottom-2 -right-2 bg-[var(--bg-main)] p-2 rounded-xl border border-[var(--border-dim)]">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
                  </div>
                </div>

                <div className="flex-1 space-y-6">
                  <div>
                    <h4 className="text-2xl font-bold text-[var(--text-main)] mb-1">@{session.githubLogin}</h4>
                    <p className="text-sm font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest">Active System Session / Identity Verified</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-6 border-t border-[var(--border-dim)]">
                    <div>
                      <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Global User ID</p>
                      <p className="text-xs font-mono text-[var(--text-main)] bg-[var(--bg-main)]/50 px-2 py-1 rounded inline-block">{session.userId}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Session Protocol</p>
                      <p className="text-xs font-mono text-emerald-500 bg-emerald-500/5 px-2 py-1 rounded inline-block border border-emerald-500/10">JWT_AUTHORIZATION</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

        </div>

        {/* Technical Rail (Right Side) */}
        <aside className="space-y-16 sticky top-8 animate-fade" style={{ animationDelay: '100ms' }}>

          <div className="space-y-6">
            <div className="flex items-center gap-4 h-8">
              <div className="w-1.5 h-6 bg-[var(--accent)] rounded-full opacity-40"></div>
              <h3 className="text-sm font-mono font-bold text-[var(--text-muted)] uppercase tracking-[0.2em]">Instance Status</h3>
            </div>

            <div className="card-border p-6 bg-[var(--bg-sidebar)]/30 backdrop-blur-sm shadow-xl ring-1 ring-white/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)] opacity-[0.03] blur-3xl pointer-events-none"></div>
              <div className="space-y-6">
                <div>
                  <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-2">Connected Providers</p>
                  <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-dim)] flex items-center justify-center grayscale text-[var(--text-muted)]" title="GitHub">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-dim)] flex items-center justify-center grayscale text-[var(--text-muted)] opacity-30" title="Vercel (Pending)">
                      <svg width="14" height="14" viewBox="0 0 512 512" fill="currentColor"><path d="M256 48l240 416H16z" /></svg>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-2">Instance URL</p>
                  <code className="text-[10px] font-mono p-2 bg-black/40 rounded border border-[var(--border-dim)] block break-all text-[var(--text-secondary)]">
                    {process.env.APP_URL || "NOT_CONFIGURED"}
                  </code>
                </div>

                <div className="pt-6 border-t border-[var(--border-dim)]">
                  <p className="text-[9px] font-mono text-[var(--text-muted)] uppercase leading-relaxed italic">
                    Precision Monitoring active via Root Handshake Terminal.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="card-border p-6 border-dashed border-[var(--border-dim)] flex flex-col items-center text-center gap-4">
            <div className="w-10 h-10 rounded-full bg-rose-500/5 flex items-center justify-center text-rose-500 border border-rose-500/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[var(--text-main)] uppercase tracking-[0.1em]">Danger Zone</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-1 mb-4">Instance removal requires Root terminal access.</p>
              <button className="text-[10px] font-mono font-bold text-rose-500/60 hover:text-rose-500 uppercase tracking-widest transition-colors">Terminate_Workspace_Session</button>
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
