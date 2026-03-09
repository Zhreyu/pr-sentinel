import { db } from "@pr-sentinel/database";
import {
  invites,
  organizations,
  organizationMembers,
} from "@pr-sentinel/database/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getSession();

  const invite = await db
    .select({ invite: invites, org: organizations })
    .from(invites)
    .leftJoin(organizations, eq(invites.organizationId, organizations.id))
    .where(eq(invites.inviteToken, token))
    .limit(1)
    .then((rows) => rows[0]);

  if (!invite?.invite) {
    return <TechnicalError title="AUTH_TOKEN_INVALID" message="The requested invitation resource could not be found or has been invalidated." />;
  }

  const { invite: inviteData, org } = invite;
  const orgName = org?.name ?? org?.githubOrgLogin ?? "WORKSPACE_RESOURCE";

  if (inviteData.expiresAt && new Date(inviteData.expiresAt) < new Date()) {
    return <TechnicalError title="AUTH_TOKEN_EXPIRED" message="The security lifespan of this invite has concluded. Contact administrator." />;
  }

  if (inviteData.status !== "pending") {
    return <TechnicalError title="TOKEN_ALREADY_EXCHANGED" message="This invitation has already been processed and cannot be reused." showDashboard />;
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 bg-[var(--bg-main)] overflow-hidden">
      <div className="absolute inset-0 tech-grid opacity-30 pointer-events-none"></div>

      <div className="relative z-10 w-full max-w-[440px] animate-fade">
        <div className="card-border bg-[var(--bg-sidebar)] p-10 border-[var(--border-dim)] shadow-2xl relative">
          <div className="absolute top-0 right-0 p-4 font-mono text-[9px] text-[var(--text-muted)] tracking-widest uppercase">/ SECURE_HANDSHAKE</div>

          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-[var(--bg-main)] border border-[var(--border-dim)] rounded-lg flex items-center justify-center mb-6 text-[var(--accent)]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            </div>
            <h1 className="text-xl font-bold text-[var(--text-main)] tracking-tight text-center">ACCESS_PROTOCOL_INIT</h1>
            <div className="mt-4 px-3 py-1 bg-[var(--bg-main)] border border-[var(--border-dim)] rounded font-mono text-[11px] text-[var(--text-muted)]">
              REF: {token.slice(-8).toUpperCase()}
            </div>
          </div>

          <p className="text-sm text-[var(--text-muted)] text-center leading-relaxed mb-10">
            You have been invited to join <span className="text-[var(--text-main)] font-bold">{orgName}</span> with <span className="text-[var(--accent)] font-bold uppercase tracking-widest text-xs px-1.5 py-0.5 bg-[var(--accent-muted)] rounded">{inviteData.role}</span> privileges.
          </p>

          {!session ? (
            <a href={`/api/auth/github?redirect=/invite/${token}`} className="btn-primary w-full justify-center py-3">
              AUTHENTICATE_IDENTITY_VIA_GITHUB
            </a>
          ) : (
            <form action={async () => {
              "use server";
              const sess = await getSession();
              if (!sess) return;

              // Actual accept logic here... 
              // Using existing implementation pattern
              await db.update(invites).set({ status: 'accepted', usedByUserId: sess.userId }).where(eq(invites.inviteToken, token));
              await db.insert(organizationMembers).values({
                organizationId: inviteData.organizationId,
                userId: sess.userId,
                role: inviteData.role,
              });

              revalidatePath("/dashboard");
              redirect("/dashboard");
            }}>
              <button type="submit" className="btn-primary w-full justify-center py-3 border-none bg-[var(--text-main)] text-[var(--bg-main)]">
                CONFIRM_IDENTITY // ACCEPT_INVITE
              </button>
              <div className="mt-4 flex items-center justify-center gap-2">
                <img src={session.avatarUrl || ""} className="w-4 h-4 rounded grayscale opacity-50" />
                <span className="text-[11px] font-mono text-[var(--text-muted)] uppercase">signed_in_as: {session.githubLogin}</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function TechnicalError({ title, message, showDashboard }: any) {
  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 bg-[var(--bg-main)] overflow-hidden text-center">
      <div className="absolute inset-0 tech-grid opacity-30 pointer-events-none"></div>
      <div className="relative z-10 w-full max-w-[400px]">
        <div className="card-border p-10 bg-[var(--bg-sidebar)] border-rose-900/40">
          <div className="w-12 h-12 mx-auto bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded flex items-center justify-center mb-6">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m18 6-12 12" /><path d="m6 6 12 12" /></svg>
          </div>
          <h2 className="text-lg font-bold text-[var(--text-main)] mb-2 font-mono uppercase tracking-widest text-rose-500">{title}</h2>
          <p className="text-sm text-[var(--text-muted)] mb-8">{message}</p>
          <Link href={showDashboard ? "/dashboard" : "/"} className="btn-secondary w-full justify-center">
            RETURN_TO_STATION
          </Link>
        </div>
      </div>
    </div>
  );
}
