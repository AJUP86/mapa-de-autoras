// AdminOnly.tsx — Stage 11 (closed mode, spec §5.5)
//
// While the map is closed (PUBLIC_MAP_OPEN=false), /map and /book show the
// "Abre pronto" page; a signed-in admin still gets the real page. AdminOnly
// renders its children only for an admin session — nothing while it checks,
// nothing for anyone else — so a visitor never sees the real page flash.
// Signing out (here or in another tab) hides them again.
//
// It hides, it does not secure: published rows stay readable through the
// public API (anon RLS; spec decision 10).
//
// AdminLayer is the full-screen layer the gated page is drawn in, over the
// "Abre pronto" page: while it is mounted the page behind is hidden (one
// <main>, nothing to tab into) and does not scroll, and focus starts in the
// layer.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { isAdmin, readSession } from "~/lib/admin-session";
import { supabase } from "~/lib/supabase";

export default function AdminOnly({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // An auth event is newer than the first read: once one has arrived, a late
    // readSession() result must not overwrite it (e.g. a sign-out in between).
    let eventSeen = false;
    readSession()
      .then((s) => {
        if (!cancelled && !eventSeen) setAdmin(s.kind === "admin");
      })
      .catch(() => {
        // Could not read the session: stay hidden.
        if (!cancelled && !eventSeen) setAdmin(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      eventSeen = true;
      setAdmin(session !== null && isAdmin(session));
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return admin ? <>{children}</> : null;
}

export function AdminLayer({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    const html = document.documentElement;
    const body = document.body;
    const savedHtml = html.style.cssText;
    const savedBody = body.style.cssText;
    // The gated page renames the tab ("Mapa · …"); give "Abre pronto" its own back.
    const savedTitle = document.title;
    // Same lock as the open /map page (Base.astro `bare`).
    for (const el of [html, body]) {
      el.style.height = "100%";
      el.style.overflow = "hidden";
      el.style.overscrollBehavior = "none";
    }
    // Everything else on the page (nav, the "Abre pronto" <main>) is fully
    // covered: hide it, so there is one <main> and nothing behind to tab into.
    // (`hidden` beats astro-island's display: contents — Tailwind's preflight
    // makes [hidden] display: none !important.)
    const covered = Array.from(body.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && !el.hidden && !el.contains(layer),
    );
    for (const el of covered) el.hidden = true;
    // Start keyboard and screen-reader users in the layer. A container needs
    // no ring (focus:outline-none), whatever the input.
    layer.focus({ preventScroll: true });
    return () => {
      html.style.cssText = savedHtml;
      body.style.cssText = savedBody;
      document.title = savedTitle;
      for (const el of covered) el.hidden = false;
    };
  }, []);

  return (
    <div ref={ref} tabIndex={-1} className={`${className} focus:outline-none`}>
      {children}
    </div>
  );
}
