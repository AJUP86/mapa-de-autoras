// AdminAwareNav.tsx — Stage 7b-i
//
// Mounted in Base.astro so every page renders the same nav slot. On mount
// reads the supabase session; renders a small skeleton during the check,
// then either the public nav (logo, "Mapa" while the map is open, "Conóceme"
// and a short EN/ES pill; Stage 11: fits a 360 px phone, and suggesting lives
// on the map, so no "Sugerir" link) or the admin nav (logo + map icon —
// the real map in both modes — + inbox icon with pending-count badge + books
// + add icon + logout; fits a 360 px phone).
//
// The pending count is queried once on mount; refreshed every 60s with
// setInterval. Realtime upgrade is phase 2 — see docs/40-phase2-backlog.md.

import { useEffect, useState } from "react";
import { readSession, signOut, type AdminSessionState } from "~/lib/admin-session";
import { supabase } from "~/lib/supabase";
import AdminNavIcon from "./AdminNavIcon";
import { IconMap } from "./icons";

interface Labels {
  /** Admin variant: the text logo ("Inicio"). */
  home: string;
  homeHref: string;
  /** Public variant: the wordmark next to the "m" mark. */
  siteName: string;
  map: string;
  mapHref: string;
  about: string;
  aboutHref: string;
  languageSwitchHref: string;
  /** Short pill text ("EN" on /es, "ES" on /en). */
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
  /** PUBLIC_MAP_OPEN (MAP_OPEN): the public nav links "Mapa" only when open. */
  mapOpen: boolean;
}

export default function AdminAwareNav({ labels, mapOpen }: Props) {
  const [state, setState] = useState<AdminSessionState>({ kind: "loading" });
  const [pendingCount, setPendingCount] = useState<number>(0);

  // The language switch href is built at BUILD time from the pathname only, so
  // it loses the query string. /[lang]/book?id=<uuid> keeps the book identity
  // there, so carry the current search across the locale switch. Set on mount
  // (not during render) to keep SSR and first client render identical.
  const [search, setSearch] = useState("");
  useEffect(() => {
    setSearch(window.location.search);
  }, []);

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
  if (state.kind !== "admin")
    return <PublicNav labels={labels} mapOpen={mapOpen} search={search} />;

  return (
    <nav className="flex items-center justify-between gap-4 px-6 py-3 border-b border-ink/10 bg-parchment">
      <a
        href={labels.homeHref}
        className="font-display text-lg font-semibold text-ink no-underline"
      >
        {labels.home}
      </a>
      <div className="flex items-center gap-1">
        {/* The real map in both modes: while it is closed, /map's admin gate shows it. */}
        <AdminNavIcon label={labels.map} href={labels.mapHref}>
          <IconMap size={20} />
        </AdminNavIcon>
        <AdminNavIcon label={labels.sugerencias} href="/admin/inbox" badge={pendingCount}>
          <InboxIcon />
        </AdminNavIcon>
        <AdminNavIcon label={labels.libros} href="/admin/books">
          <BookIcon />
        </AdminNavIcon>
        <AdminNavIcon label={labels.anadir} href="/admin/add">
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
    </nav>
  );
}

// Public bar: one row at every width (h-15), content aligned with the home's
// 1080 px column. Below `sm` the wordmark is visually hidden (the "m" mark
// stays, the link keeps its name) so logo, links and the language pill fit a
// 360 px phone. Every target is at least 44 × 44 px.
const PUBLIC_BAR = "border-b border-ink/10 bg-parchment";
const PUBLIC_ROW =
  "mx-auto flex h-15 max-w-[1080px] items-center justify-between gap-2 px-4 sm:px-6";
const PUBLIC_LINK =
  "inline-flex min-h-11 items-center px-2 text-[0.9rem] whitespace-nowrap text-ink/80 no-underline hover:text-oxblood sm:px-3";

function PublicNav({
  labels,
  mapOpen,
  search,
}: {
  labels: Labels;
  mapOpen: boolean;
  search: string;
}) {
  // While the map is closed (spec §5.5) the nav does not link to it.
  const links = [
    ...(mapOpen ? [{ href: labels.mapHref, label: labels.map }] : []),
    { href: labels.aboutHref, label: labels.about },
  ];
  return (
    <nav className={PUBLIC_BAR}>
      <div className={PUBLIC_ROW}>
        <a
          href={labels.homeHref}
          className="flex min-h-11 min-w-11 flex-none items-center gap-2.5 font-display text-[1.12rem] font-semibold tracking-[-0.01em] whitespace-nowrap text-ink no-underline"
        >
          <span
            aria-hidden="true"
            className="grid size-[30px] flex-none place-items-center rounded-full bg-oxblood text-base leading-none text-bone"
          >
            m
          </span>
          <span className="sr-only sm:not-sr-only">{labels.siteName}</span>
        </a>
        <div className="flex min-w-0 items-center">
          <ul className="flex items-center">
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href} className={PUBLIC_LINK}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href={`${labels.languageSwitchHref}${search}`}
            hrefLang={labels.languageSwitchHreflang}
            aria-label={labels.languageSwitchAriaLabel}
            className="group ml-1 inline-flex min-h-11 min-w-11 items-center justify-center no-underline"
          >
            <span className="rounded-full border border-ink/15 bg-bone px-2.5 py-1 text-xs font-semibold tracking-wider text-ink/80 transition-colors group-hover:border-oxblood/40 group-hover:text-oxblood">
              {labels.languageSwitchLabel}
            </span>
          </a>
        </div>
      </div>
    </nav>
  );
}

function NavSkeleton() {
  return (
    <nav className={PUBLIC_BAR}>
      <div className={PUBLIC_ROW}>
        <div className="h-[30px] w-[30px] rounded-full bg-ink/5 sm:w-40" aria-hidden />
        <div className="h-6 w-56 max-w-[60%] rounded bg-ink/5" aria-hidden />
      </div>
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
