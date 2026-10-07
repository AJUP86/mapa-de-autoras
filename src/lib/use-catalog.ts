// use-catalog.ts — Stage 11
//
// The public catalog for map UIs: initial fetch + optional Supabase Realtime
// patching (ADR 0005). Moved out of the old home map (MapSection.tsx) with the
// same behavior. /map is the only caller; `{ realtime: false }` skips the
// subscription (unused since the home picture became build-time).

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { fetchCatalog } from "./authors";
import type { CountryEntry } from "./map-state";
import {
  addAuthor,
  addBook,
  removeAuthor,
  removeBook,
  updateAuthor,
  updateBook,
  type AuthorRow,
  type BookRow,
} from "./realtime-reducers";

export type CatalogState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "loaded"; catalog: CountryEntry[] };

export function useCatalog({ realtime = true }: { realtime?: boolean } = {}) {
  const [state, setState] = useState<CatalogState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const hasSubscribedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetchCatalog()
      .then((catalog) => {
        if (!cancelled) setState({ kind: "loaded", catalog });
      })
      .catch((e: Error) => {
        console.warn("[useCatalog] load failed:", e.message);
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Subscribe once the catalog has loaded. Keyed on the boolean so content
  // patches never tear the channel down (same rule as the old MapSection).
  const loaded = state.kind === "loaded";
  useEffect(() => {
    if (!realtime || !loaded) return;
    const patch = (fn: (c: CountryEntry[]) => CountryEntry[]) =>
      setState((prev) =>
        prev.kind === "loaded" ? { kind: "loaded", catalog: fn(prev.catalog) } : prev,
      );
    const channel = supabase
      .channel("public-map-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "authors" }, (p) =>
        patch((c) => addAuthor(c, p.new as AuthorRow)),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "authors" }, (p) =>
        patch((c) => updateAuthor(c, p.new as AuthorRow)),
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "authors" }, (p) => {
        const id = (p.old as { id?: string }).id;
        if (id) patch((c) => removeAuthor(c, id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "books" }, (p) =>
        patch((c) => addBook(c, p.new as BookRow)),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "books" }, (p) =>
        patch((c) => updateBook(c, p.new as BookRow)),
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "books" }, (p) =>
        patch((c) => removeBook(c, p.old as BookRow)),
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        // A second SUBSCRIBED means we reconnected: resync missed events.
        if (hasSubscribedOnce.current) {
          // On failure keep the catalog we already show.
          fetchCatalog()
            .then((catalog) => setState({ kind: "loaded", catalog }))
            .catch((e: Error) => console.warn("[useCatalog] resync failed:", e.message));
        } else {
          hasSubscribedOnce.current = true;
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [realtime, loaded]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
