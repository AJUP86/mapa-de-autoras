// AdminAwareNav.tsx — Stage 7b-i
//
// Mounted in Base.astro so every page renders the same nav slot. On mount
// reads the supabase session; renders a small skeleton during the check,
// then either the public nav (logo + Sugerir) or the admin nav (logo +
// inbox icon with pending-count badge + add icon + logout).
//
// The pending count is queried once on mount; refreshed every 60s with
// setInterval. Realtime upgrade is phase 2 — see docs/40-phase2-backlog.md.

import { useEffect, useState } from "react";
import { readSession, signOut, type AdminSessionState } from "~/lib/admin-session";
import { supabase } from "~/lib/supabase";
import AdminNavIcon from "./AdminNavIcon";

interface Labels {
  mapa: string;
  mapaHref: string;
  sugerir: string;
  sugerirHref: string;
  about: string;
  aboutHref: string;
  languageSwitchHref: string;
  languageSwitchLabel: string;
  languageSwitchAriaLabel: string;
  languageSwitchHreflang: string;
  sugerencias: string;
  libros: string;
  anadir: string;
  salir: string;
}

interface Props {
  labels: Labels;
}

export default function AdminAwareNav({ labels }: Props) {
  const [state, setState] = useState<AdminSessionState>({ kind: "loading" });
  const [pendingCount, setPendingCount] = useState<number>(0);

  // Initial session read + cross-tab signout subscription
  useEffect(() => {
    let cancelled = false;
    readSession().then((s) => {
      if (!cancelled) setState(s);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      readSession().then((s) => {
        if (!cancelled) setState(s);
      });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Poll pending suggestion count while admin
  useEffect(() => {
    if (state.kind !== "admin") return;
    let cancelled = false;
    const refresh = async () => {
      const { count, error } = await supabase
        .from("suggestions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (cancelled) return;
      if (error) {
        console.warn("[AdminAwareNav] pending count failed:", error.message);
        return;
      }
      setPendingCount(count ?? 0);
    };
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [state.kind]);

  if (state.kind === "loading") return <NavSkeleton />;

  return (
    <nav className="flex items-center justify-between gap-4 px-6 py-3 border-b border-ink/10 bg-parchment">
      <a
        href={labels.mapaHref}
        className="font-display text-lg font-semibold text-ink no-underline"
      >
        {labels.mapa}
      </a>
      {state.kind === "admin" ? (
        <div className="flex items-center gap-1">
          <AdminNavIcon label={labels.sugerencias} href="/admin/inbox" badge={pendingCount}>
            <InboxIcon />
          </AdminNavIcon>
          <AdminNavIcon label={labels.libros} href="/admin/books">
            <BookIcon />
          </AdminNavIcon>
          <AdminNavIcon label={labels.anadir} href="/admin/promote">
            <PlusIcon />
          </AdminNavIcon>
          <AdminNavIcon
            label={labels.salir}
            onClick={async () => {
              await signOut();
              window.location.replace("/admin");
            }}
          >
            <LogoutIcon />
          </AdminNavIcon>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <a href={labels.aboutHref} className="text-sm text-ink/80 hover:text-oxblood">
            {labels.about}
          </a>
          <a href={labels.sugerirHref} className="text-sm text-ink/80 underline hover:text-oxblood">
            {labels.sugerir}
          </a>
          <a
            href={labels.languageSwitchHref}
            hrefLang={labels.languageSwitchHreflang}
            aria-label={labels.languageSwitchAriaLabel}
            className="inline-flex items-center justify-center rounded-full border border-ink/15 bg-bone px-3 py-1 text-xs font-medium tracking-wider text-ink/80 transition-colors hover:border-oxblood/40 hover:text-oxblood"
          >
            {labels.languageSwitchLabel}
          </a>
        </div>
      )}
    </nav>
  );
}

function NavSkeleton() {
  return (
    <nav className="flex items-center justify-between gap-4 px-6 py-3 border-b border-ink/10 bg-parchment">
      <div className="h-6 w-32 rounded bg-ink/5" aria-hidden />
      <div className="h-6 w-24 rounded bg-ink/5" aria-hidden />
    </nav>
  );
}

function InboxIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
