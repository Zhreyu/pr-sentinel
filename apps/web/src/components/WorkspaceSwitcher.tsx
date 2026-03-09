"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Workspace {
    id: string;
    name: string | null;
    githubOrgLogin: string | null;
    memberCount?: number;
}

export function WorkspaceSwitcher({
    workspaces,
    activeWorkspaceId
}: {
    workspaces: Workspace[];
    activeWorkspaceId?: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const active = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    if (!active) return null;

    return (
        <div className="relative w-full" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors group text-left border border-transparent hover:border-[var(--border-dim)]"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-[var(--text-main)] text-[var(--bg-main)] flex items-center justify-center rounded font-bold shadow-sm shrink-0">
                        {(active?.name?.[0] || active?.githubOrgLogin?.[0] || '?').toUpperCase()}
                    </div>
                    <div className="min-w-0 flex flex-col">
                        <span className="font-bold text-[13px] text-[var(--text-main)] truncate uppercase tracking-tight">
                            {active?.name || active?.githubOrgLogin || 'WORKSPACE'}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-[var(--text-muted)] tracking-wider">
                            WORKSPACE
                        </span>
                    </div>
                </div>
                <svg
                    className={`text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                >
                    <path d="m6 9 6 6 6-6" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 w-full mt-2 bg-[var(--bg-sidebar)] border border-[var(--border-dim)] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.3)] z-[100] overflow-hidden animate-fade p-1.5 space-y-1">
                    <div className="px-3 py-2 text-[10px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border-dim)] mb-1">
                        Select Workspace
                    </div>
                    {workspaces.map(w => (
                        <Link
                            key={w.id}
                            href={`/dashboard?workspaceId=${w.id}`}
                            onClick={() => setIsOpen(false)}
                            className={`flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors group ${w.id === activeWorkspaceId ? 'bg-[var(--accent-muted)]' : ''}`}
                        >
                            <div className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold ${w.id === activeWorkspaceId ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}>
                                {(w.name?.[0] || w.githubOrgLogin?.[0] || '?').toUpperCase()}
                            </div>
                            <span className={`text-xs font-semibold ${w.id === activeWorkspaceId ? 'text-[var(--text-main)]' : 'text-[var(--text-secondary)]'}`}>
                                {w.name || w.githubOrgLogin || 'Unnamed'}
                            </span>
                        </Link>
                    ))}
                    <div className="border-t border-[var(--border-dim)] mt-1 pt-1">
                        <Link href="/dashboard/settings" className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors group">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3" /><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /></svg>
                            <span className="text-[11px] font-bold uppercase tracking-wider">Manage Workspaces</span>
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
