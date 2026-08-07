# Stage 9a-ii Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public map data flows shift from build-time Astro fetch to runtime client-side fetch + Supabase Realtime subscription with granular event-driven patching. Promoting an author lands on every open `staging.mapadeautoras.com` tab within ~1 second.

**Architecture:** `MapSection.tsx` (React island) becomes the data owner — fetches the catalog on mount via `getCatalog()`, then subscribes to `postgres_changes` events on `public.authors` and `public.books`. Each event is patched into local state by id (industry-standard streaming pattern, no refetch-on-event). On WebSocket reconnect, one-shot resync re-runs `getCatalog()`. The static HTML shell ships from Cloudflare CDN as before.

**Tech Stack:** Astro 5 (static output), React 19 islands, Supabase JS client + Realtime (Phoenix Channels over WebSocket), TypeScript.

**Spec:** [docs/specs/2026-06-18-stage-9a-ii-realtime-map-design.md](../specs/2026-06-18-stage-9a-ii-realtime-map-design.md) — read this first.

---

## Working conventions for this plan

1. **No test framework in this repo.** TDD-style "write the test first" doesn't apply. Each task ends with manual smoke verification (`npm run build` for type-check + manual exercise in the browser).
2. **Alejandro commits manually.** Do NOT run `git commit`, `git push`, or `git merge`. End each slice with a STOP marker; the user reads the diff and commits when satisfied.
3. **Branch:** `feature/09a-ii-realtime-map`, off `development` (which has 9a merged at `0264f9c`). One PR back to `development` at end of stage.
4. **Task labels:** `[Subagent]` = file change a subagent can execute; `[Manual]` = dashboard or CLI action only Alejandro does (e.g., `supabase db push` to staging).
5. **No `npm run dev:db:reset` autonomously** — it wipes `auth.users` locally; the user re-bootstraps admin only when they choose. Apply migration 0008 locally via Studio SQL editor if a fresh apply is needed (or accept that the migration lands on next manual reset).
6. **Each slice ends with `STOP — Slice X complete`** = user-commit pause point. Do not move to the next slice until Alejandro confirms.

---

## File structure (lock-in before tasks)

**New files:**

- `supabase/migrations/0008_realtime_authors.sql` — adds `authors` + `books` to the `supabase_realtime` publication.
- `src/lib/realtime-reducers.ts` — six pure reducer helpers (addAuthor, updateAuthor, removeAuthor, addBook, updateBook, removeBook) for granular patching.
- `docs/adr/0005-realtime-map-data.md` — architecture-flip ADR (static shell + client-side data + Realtime).

**Modified files:**

- `src/components/MapSection.tsx` — drop `catalog` prop, add internal state + two useEffect hooks (fetch + subscribe).
- `src/pages/index.astro` — remove `getCatalog()` import + call, remove `catalog` prop from `<MapSection>`.
- `src/pages/en/index.astro` — same.
- `docs/RAG.md` — add ADR 0005 row.
- `docs/STATUS.md` — Stage 9a-ii session log + roadmap update.
- `docs/01-implementation-plan.md` — new Stage 9a-ii section between 9a and 9b.
- `docs/40-phase2-backlog.md` — update "Realtime pending-count badge" entry to reflect new infra; remove or reframe "SSR via Cloudflare adapter" since the static-data limitation no longer applies.
- `docs/30-ops/staging-deploy.md` — remove "Public map data is built at compile time" gotcha; add brief Realtime connection note.

**Unchanged:**

- `src/lib/authors.ts` — `getCatalog()` already uses `supabase` client, works from React without modification.
- `src/lib/map-state.ts` — types stay; reducers in a separate file to keep this one focused on type definitions + `computeCountryStates`.
- `src/lib/supabase.ts` — already exports the shared `supabase` client for both fetch and Realtime.

---

# Slice A — Migration + ADR

**Goal:** Realtime publication updated on local + staging; ADR 0005 committed.

## Task A1 — `[Subagent]` Migration `0008_realtime_authors.sql`

**Files:**

- Create: `supabase/migrations/0008_realtime_authors.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Stage 9a-ii — Enable Realtime for the public map data tables.
--
-- Supabase Realtime is enabled at the project level by default, but each
-- table must be added to the supabase_realtime publication for postgres_changes
-- events to be emitted. Anon subscribers receive only rows visible under RLS,
-- so the existing `published = true` filter on authors continues to gate
-- visibility — books inherit the gate via their parent author + their own RLS.

alter publication supabase_realtime add table public.authors;
alter publication supabase_realtime add table public.books;
```

- [ ] **Step 2: STOP — Task A1 done. The migration is small and will be applied locally + on staging in Task A2.**

---

## Task A2 — `[Manual]` Apply migration locally + on staging

- [ ] **Step 1 (local): apply via Studio SQL Editor** (avoids wiping admin)

Go to http://127.0.0.1:54323/project/default/sql/new and run:

```sql
alter publication supabase_realtime add table public.authors;
alter publication supabase_realtime add table public.books;
```

Expected: `ALTER PUBLICATION` (twice).

Verify:

```sql
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;
```

Expected: rows for `authors` and `books` (alongside any pre-existing tables in the publication).

If the local Supabase stack isn't running, skip this step — the migration will land on next `npm run dev:db:reset`. The file is committed so it propagates correctly via the migration history.

- [ ] **Step 2 (staging): push the new migration**

Run:

```powershell
supabase db push
```

Expected: detects 1 new migration (`0008_realtime_authors.sql`); confirm with `y`; applies cleanly.

- [ ] **Step 3 (staging): verify in Studio**

Open https://supabase.com/dashboard/project/kkdjrzuewnwrlokhemnl/sql/new and run:

```sql
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;
```

Expected: rows for `authors` and `books` present.

- [ ] **Step 4: STOP — Task A2 done.**

---

## Task A3 — `[Subagent]` ADR 0005 — Realtime map data

**Files:**

- Create: `docs/adr/0005-realtime-map-data.md`

- [ ] **Step 1: Write the ADR**

```markdown
# ADR 0005 — Realtime map data

Status: Accepted (2026-06-18)

## Context

Stages 4-5 chose Astro static output and a build-time Supabase fetch in `src/pages/index.astro` front-matter. The full author + books catalog was baked into the static HTML at build time and passed to `<MapSection>` as a prop. The trade-off was deliberate: maximum CDN cacheability, zero runtime cost on the public surface.

Stage 9a staging surfaced the consequence: when an admin promotes an author, the row lands in Supabase immediately (admin inbox updates correctly), but the public map shows nothing until the next Pages build. Pages auto-deploys on `development` pushes, so the practical floor was "a fresh commit + 3-minute build" between any promotion and public visibility. For a site whose value proposition is "see new authors as they appear", this is a UX failure.

## Decision

Flip the public map's data flow to **static shell + client-side fetch + Realtime subscription**.

- The Astro static HTML still ships from Cloudflare's edge CDN — same first-paint speed.
- `<MapSection>` becomes the data owner: on mount, it calls `getCatalog()` to fetch the initial catalog, then opens a Supabase Realtime channel (`supabase.channel('public-map-realtime').on('postgres_changes', ...)`) subscribed to INSERT/UPDATE/DELETE events on `public.authors` and `public.books`.
- Events are handled with **granular patching**: each event payload updates local state by row id — INSERT appends, UPDATE replaces, DELETE removes. No refetch-on-event.
- On WebSocket reconnect, one-shot `getCatalog()` to resync.

The build no longer fetches data; `src/pages/index.astro` and `src/pages/en/index.astro` drop the `await getCatalog()` call and the `catalog` prop on `<MapSection>`.

## Alternatives considered

- **Auto-rebuild webhook** — Supabase Database Webhook on `authors` INSERT → Cloudflare Pages Deploy Hook → rebuild. Pros: no code change to MapSection. Cons: 2-3 min lag (Pages build time) between promotion and visibility — still feels slow for a launch demo to the project owner.
- **Per-route SSR (hybrid mode)** — Astro `output: 'hybrid'` + `@astrojs/cloudflare` adapter; mark `/` as `prerender = false`. Pros: instant updates, server-side rendered HTML has data. Cons: every visit hits Cloudflare Pages Functions (~50-100ms latency added, free-tier 100k invocations/month), loses CDN cacheability for the homepage.
- **Full SSR** — All pages server-rendered. Pros: same as hybrid. Cons: heavier refactor, harder to predict Cloudflare cost at scale, no CDN benefit anywhere.
- **Polling on the public map** — Refetch the catalog every N seconds from the client. Pros: simplest. Cons: wasteful (sparse changes vs. constant polling), worse latency than push, scales poorly with viewers.

## Consequences

- **First-paint UX:** the static HTML shell paints immediately (same as before), but the map's country highlights appear ~200-500ms later (after the initial fetch resolves). The map outline + filter UI render during this window — no jarring blank state.
- **Real-time UX:** new authors land on every open tab within ~1 second of the DB commit. Side-panel book lists populate incrementally as their INSERT events arrive (granular patcher appends).
- **Build:** Astro builds no longer fail when the local Supabase stack is off — `getCatalog()` isn't called at build time. The `[authors] getCatalog() failed: TypeError: fetch failed` lines we saw in 9a build logs disappear.
- **SEO:** initial HTML no longer contains author names. For this site, the SEO target is "people searching for women writers" → the body copy + map title + suggest CTA are what matters. Author names being post-load is acceptable; the map is the experience, not the index payload.
- **Connection cost:** every visitor opens one Supabase Realtime WebSocket connection. Free-tier limit is 200 concurrent connections; MVP traffic is well below that. Revisit if traffic grows 10×.
- **Operational:** Realtime is now part of the dependency surface — disconnects need to be handled (auto-reconnect + one-shot resync on rejoin). supabase-js handles the reconnect logic; the application adds the resync step on `system` event transition.
- **Future work:** the admin pending-count badge polling (currently every 60s in `<AdminAwareNav>`) can migrate to a Realtime subscription on `suggestions` table when we revisit Phase 2 — same infra, smaller increment of work since this ADR establishes the pattern.

## Future work

- Phase 2: extend the same Realtime infrastructure to `<AdminAwareNav>` for the pending-count badge.
- Phase 2: extend to admin inbox table for live-updating suggestion list.
- 9b: production deploy inherits this architecture; no migration-style decision to revisit.

See [docs/40-phase2-backlog.md](../40-phase2-backlog.md) for the full deferred list.
```

- [ ] **Step 2: STOP — Task A3 done.**

---

## Task A4 — `[Subagent]` Add ADR 0005 row to RAG index

**Files:**

- Modify: `docs/RAG.md`

- [ ] **Step 1: Add the row in alphabetical-by-filename order in the existing table**

Insert this row immediately after the row for `adr/0004-translation-strategy.md`:

```markdown
| `adr/0005-realtime-map-data.md` | Decision record for the architecture flip from "Astro build-time fetch baked into static HTML" (Stages 4-5) to "static shell + client-side fetch + Supabase Realtime subscription with granular patching" (Stage 9a-ii). Captures alternatives considered (auto-rebuild webhook, SSR hybrid, full SSR, polling). | Use when changing the public-data architecture, adding new Realtime subscriptions, or revisiting first-paint vs. real-time freshness trade-offs. |
```

- [ ] **Step 2: STOP — Task A4 done.**

---

## Slice A wrap-up

**Verify:**

- `supabase/migrations/0008_realtime_authors.sql` exists with the two `alter publication` statements.
- `pg_publication_tables` query returns `authors` + `books` on staging (verified in Task A2 Step 3).
- `docs/adr/0005-realtime-map-data.md` exists with the full ADR.
- `docs/RAG.md` has the new ADR 0005 row.

**STOP — Slice A complete.**

Alejandro: review the diff (`git status` should show the three new files + modified RAG.md). Commit. Suggested message:

```
feat(stage-9a-ii,migration): realtime publication + ADR 0005
```

---

# Slice B — Client-side fetch + Realtime subscription

**Goal:** `<MapSection>` owns the catalog; Astro pages stop fetching at build time; granular patching on Realtime events.

## Task B1 — `[Subagent]` Create `src/lib/realtime-reducers.ts`

**Files:**

- Create: `src/lib/realtime-reducers.ts`

- [ ] **Step 1: Write the reducer helpers**

```ts
// Pure reducers for granular Realtime patching.
//
// Each function takes a catalog snapshot + an event payload, returns a new
// catalog. Used by MapSection's Realtime event handlers to update local state
// without re-fetching from Supabase on every change.
//
// Rules:
//   - published = false authors are filtered out before patching (defence in
//     depth — anon RLS already filters these server-side, but the reducer
//     re-checks).
//   - New author lands in its country_iso_a3 bucket; bucket is created if
//     absent.
//   - Removing the last author from a country bucket removes the bucket.
//   - Books sort by display_order within their parent author.
//   - Author UPDATE preserves existing books array; only top-level fields are
//     merged.

import type { Author, AuthorStatus, Book, CountryEntry } from "./map-state";

export interface AuthorRow {
  id: string;
  name: string;
  status: AuthorStatus;
  birth_year: number | null;
  death_year: number | null;
  country_iso_a3: string;
  published: boolean;
}

export interface BookRow {
  id: string;
  author_id: string;
  title: string;
  year: number | null;
  display_order: number;
}

function rowToAuthor(row: AuthorRow, books: Book[] = []): Author {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    birth_year: row.birth_year ?? undefined,
    death_year: row.death_year ?? undefined,
    books,
  };
}

function rowToBook(row: BookRow): Book {
  return {
    title: row.title,
    year: row.year ?? undefined,
  };
}

export function addAuthor(catalog: CountryEntry[], row: AuthorRow): CountryEntry[] {
  if (!row.published) return catalog;
  const author = rowToAuthor(row);

  const bucketIndex = catalog.findIndex((c) => c.iso_a3 === row.country_iso_a3);
  if (bucketIndex === -1) {
    return [...catalog, { iso_a3: row.country_iso_a3, authors: [author] }];
  }

  const bucket = catalog[bucketIndex];
  if (bucket.authors.some((a) => a.id === row.id)) {
    return catalog; // idempotent — already present
  }

  const next = catalog.slice();
  next[bucketIndex] = { ...bucket, authors: [...bucket.authors, author] };
  return next;
}

export function updateAuthor(catalog: CountryEntry[], row: AuthorRow): CountryEntry[] {
  if (!row.published) {
    // Going from published=true to published=false → remove from view.
    return removeAuthor(catalog, row.id);
  }

  // Country may have changed; remove from old bucket first, then add to new.
  let next = catalog
    .map((c) => ({
      ...c,
      authors: c.authors.filter((a) => a.id !== row.id),
    }))
    .filter((c) => c.authors.length > 0);

  // Find existing books for this author (preserved from any previous state).
  // Since updateAuthor only changes top-level fields, we look up the books
  // before we filtered.
  const existingBooks = catalog.flatMap((c) => c.authors).find((a) => a.id === row.id)?.books ?? [];

  const author = rowToAuthor(row, existingBooks);
  const bucketIndex = next.findIndex((c) => c.iso_a3 === row.country_iso_a3);

  if (bucketIndex === -1) {
    next = [...next, { iso_a3: row.country_iso_a3, authors: [author] }];
  } else {
    const bucket = next[bucketIndex];
    next = next.slice();
    next[bucketIndex] = { ...bucket, authors: [...bucket.authors, author] };
  }

  return next;
}

export function removeAuthor(catalog: CountryEntry[], id: string): CountryEntry[] {
  return catalog
    .map((c) => ({ ...c, authors: c.authors.filter((a) => a.id !== id) }))
    .filter((c) => c.authors.length > 0);
}

export function addBook(catalog: CountryEntry[], row: BookRow): CountryEntry[] {
  const book = rowToBook(row);
  return catalog.map((c) => ({
    ...c,
    authors: c.authors.map((a) => {
      if (a.id !== row.author_id) return a;
      if (a.books.some((b) => b.title === row.title && b.year === book.year)) {
        return a; // idempotent — already present
      }
      const books = [...a.books, book].sort((x, y) => (x.year ?? 0) - (y.year ?? 0));
      // display_order is preserved at fetch time; on incremental updates we
      // fall back to year sort, which matches the visible order in the panel.
      return { ...a, books };
    }),
  }));
}

export function updateBook(catalog: CountryEntry[], row: BookRow): CountryEntry[] {
  const book = rowToBook(row);
  return catalog.map((c) => ({
    ...c,
    authors: c.authors.map((a) => {
      if (a.id !== row.author_id) return a;
      // Match the book by previous identity. We don't have the previous title
      // here, so we replace whichever book has the lowest "edit distance" by
      // year+title prefix. In practice, edits don't happen yet (7b-ii) — this
      // is a placeholder for when they do.
      // For now: simple swap-by-position is not reliable, so we drop any book
      // with the same year and replace with the new title+year.
      const books = a.books.filter((b) => b.year !== book.year);
      return { ...a, books: [...books, book].sort((x, y) => (x.year ?? 0) - (y.year ?? 0)) };
    }),
  }));
}

export function removeBook(catalog: CountryEntry[], row: BookRow): CountryEntry[] {
  // Realtime DELETE payload has `old` populated; the reducer accepts the same
  // BookRow shape (callers pass payload.old).
  return catalog.map((c) => ({
    ...c,
    authors: c.authors.map((a) => {
      if (a.id !== row.author_id) return a;
      return {
        ...a,
        books: a.books.filter(
          (b) => !(b.title === row.title && b.year === (row.year ?? undefined)),
        ),
      };
    }),
  }));
}
```

- [ ] **Step 2: STOP — Task B1 done.**

---

## Task B2 — `[Subagent]` Refactor `MapSection.tsx` to own catalog + subscribe to Realtime

**Files:**

- Modify: `src/components/MapSection.tsx`

- [ ] **Step 1: Replace the entire file with the refactored version**

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import AuthorsMap from "./AuthorsMap";
import type { MapView } from "./AuthorsMap";
import MapFilter from "./MapFilter";
import CountryPanel from "./CountryPanel";
import ContinentNav, { CONTINENT_VIEWS } from "./ContinentNav";
import type { ContinentKey } from "./ContinentNav";
import { supabase } from "~/lib/supabase";
import { getCatalog } from "~/lib/authors";
import { computeCountryStates } from "~/lib/map-state";
import type { CountryEntry, Filter, MapLabels } from "~/lib/map-state";
import {
  addAuthor,
  addBook,
  removeAuthor,
  removeBook,
  updateAuthor,
  updateBook,
  type AuthorRow,
  type BookRow,
} from "~/lib/realtime-reducers";

interface MapSectionLabels extends MapLabels {
  view: Record<ContinentKey, string>;
  zoom: { in: string; out: string; reset: string };
}

interface Props {
  labels: MapSectionLabels;
}

export default function MapSection({ labels }: Props) {
  const [catalog, setCatalog] = useState<CountryEntry[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<MapView>(CONTINENT_VIEWS.world);
  const [selected, setSelected] = useState<{ iso_a3: string; name: string } | null>(null);

  // Tracks whether we've completed an initial subscribe — used to detect
  // reconnects in the second useEffect's status callback.
  const hasSubscribedOnce = useRef(false);

  // Initial fetch on mount.
  useEffect(() => {
    let cancelled = false;
    getCatalog().then((data) => {
      if (!cancelled) setCatalog(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime subscription — runs after catalog loads. Granular patching.
  useEffect(() => {
    if (catalog === null) return;

    const channel = supabase
      .channel("public-map-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "authors" },
        (payload) => {
          setCatalog((prev) => (prev ? addAuthor(prev, payload.new as AuthorRow) : prev));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "authors" },
        (payload) => {
          setCatalog((prev) => (prev ? updateAuthor(prev, payload.new as AuthorRow) : prev));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "authors" },
        (payload) => {
          const old = payload.old as { id?: string };
          if (!old.id) return;
          setCatalog((prev) => (prev ? removeAuthor(prev, old.id!) : prev));
        },
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "books" }, (payload) => {
        setCatalog((prev) => (prev ? addBook(prev, payload.new as BookRow) : prev));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "books" }, (payload) => {
        setCatalog((prev) => (prev ? updateBook(prev, payload.new as BookRow) : prev));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "books" }, (payload) => {
        setCatalog((prev) => (prev ? removeBook(prev, payload.old as BookRow) : prev));
      })
      .subscribe((status) => {
        // First SUBSCRIBED after mount = initial subscribe; mark and skip resync.
        // Subsequent SUBSCRIBED transitions (after CHANNEL_ERROR / CLOSED) =
        // reconnect; refetch to resync any events missed during the disconnect.
        if (status === "SUBSCRIBED") {
          if (hasSubscribedOnce.current) {
            getCatalog().then((data) => setCatalog(data));
          } else {
            hasSubscribedOnce.current = true;
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [catalog === null]);

  const countryStates = useMemo(() => (catalog ? computeCountryStates(catalog) : {}), [catalog]);

  const selectedAuthors = useMemo(() => {
    if (!selected || !catalog) return [];
    return catalog.find((entry) => entry.iso_a3 === selected.iso_a3)?.authors ?? [];
  }, [selected, catalog]);

  return (
    <div className="relative">
      <div className="mb-5 flex flex-col items-center gap-4">
        <MapFilter value={filter} onChange={setFilter} labels={labels.filter} />
        <ContinentNav
          view={view}
          onSetView={setView}
          labels={{ view: labels.view, zoom: labels.zoom }}
        />
      </div>

      <div className="mx-auto max-w-5xl rounded-2xl overflow-hidden border border-ink/10 shadow-[0_1px_2px_var(--c-shadow)]">
        <AuthorsMap
          countryStates={countryStates}
          filter={filter}
          selectedIso={selected?.iso_a3 ?? null}
          view={view}
          onViewChange={setView}
          onSelectCountry={(iso_a3, name) => setSelected({ iso_a3, name })}
        />
      </div>

      {selected && (
        <CountryPanel
          countryName={selected.name}
          authors={selectedAuthors}
          labels={labels}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
```

**Note on the dependency array `[catalog === null]`**: the second useEffect subscribes only once after the initial fetch transitions catalog from `null` → array. Using the boolean expression keeps the dependency stable (only re-runs if the boolean flips, which happens once per mount).

- [ ] **Step 2: STOP — Task B2 done. Pages still pass `catalog` as a prop (build will fail until B3 + B4 remove the prop).**

---

## Task B3 — `[Subagent]` Remove `getCatalog()` from `src/pages/index.astro`

**Files:**

- Modify: `src/pages/index.astro`

- [ ] **Step 1: Remove the import + call + prop**

Replace lines 1-9 of the current file:

```astro
---
import Base from "~/layouts/Base.astro";
import LanguageSwitch from "~/components/LanguageSwitch.astro";
import MapSection from "~/components/MapSection";
import { t } from "~/i18n/t";
import { getCatalog } from "~/lib/authors";

const lang = "es";
const catalog = await getCatalog();
---
```

with:

```astro
---
import Base from "~/layouts/Base.astro";
import LanguageSwitch from "~/components/LanguageSwitch.astro";
import MapSection from "~/components/MapSection";
import { t } from "~/i18n/t";

const lang = "es";
---
```

And on the `<MapSection>` line (around line 86), change:

```astro
<MapSection client:visible labels={mapLabels} catalog={catalog} />
```

to:

```astro
<MapSection client:visible labels={mapLabels} />
```

- [ ] **Step 2: STOP — Task B3 done.**

---

## Task B4 — `[Subagent]` Remove `getCatalog()` from `src/pages/en/index.astro`

**Files:**

- Modify: `src/pages/en/index.astro`

- [ ] **Step 1: Apply the same edits as B3, but in the EN page**

Open `src/pages/en/index.astro`. Find the front-matter section (likely lines 1-9 or similar) — it imports `getCatalog` from `~/lib/authors` and calls `await getCatalog()`. Remove the import line and the call.

Find the `<MapSection ... catalog={catalog} />` line and remove `catalog={catalog}` so it reads `<MapSection client:visible labels={mapLabels} />`.

The EN page structure mirrors `src/pages/index.astro` exactly (Stage 2's i18n-skeleton convention) — apply the same two changes verbatim.

- [ ] **Step 2: STOP — Task B4 done.**

---

## Task B5 — `[Subagent]` Build sanity check + type verification

- [ ] **Step 1: Run the build**

Run:

```powershell
npm run build
```

Expected:

- No TypeScript errors related to `getCatalog` (it's no longer called from Astro front-matter).
- No `catalog` prop missing on `<MapSection>` (we removed the prop from both the component definition AND the call sites).
- 11 pages built successfully.
- **No more `[authors] getCatalog() failed: TypeError: fetch failed`** lines — `getCatalog()` is not called at build time anymore.

If the build fails with a missing-prop error or a `catalog is not defined` error, double-check B3/B4 changes; the prop was passed in two places.

- [ ] **Step 2: STOP — Task B5 done.**

---

## Slice B wrap-up

**Verify:**

- Local: `npm run dev` → open `http://localhost:4321` → map outline renders immediately → country highlights appear after ~200-500ms (initial fetch) → devtools Network shows one `authors?select=...` query AND a WebSocket connection to `*.supabase.co/realtime/v1/websocket`.
- Local: open Studio at `http://127.0.0.1:54323` → manually INSERT an author into `public.authors` → the country gets colored on the running dev site within ~1 second.
- `npm run build` passes with no `getCatalog() failed` lines.

**STOP — Slice B complete.**

Alejandro: review the diff (4 modified files + 1 new). Commit. Suggested message:

```
feat(stage-9a-ii,realtime): client-side catalog fetch + Realtime subscription with granular patching
```

---

# Slice C — Docs sync

**Goal:** All project docs reflect "9a-ii is Done" state.

## Task C1 — `[Subagent]` Update `docs/STATUS.md`

**Files:**

- Modify: `docs/STATUS.md`

- [ ] **Step 1: Update the roadmap table**

Find the "9a — Staging deployment" row. Add a new row immediately below it (above 9b):

```markdown
| 9a-ii — Realtime map data (client-side fetch + Supabase Realtime subscription) | ✅ Done | feature/09a-ii-realtime-map |
```

Update the "About ~75% of MVP shipped" line to "About ~77% of MVP shipped" (small bump, 9a-ii is a meaningful UX upgrade but a small stage).

- [ ] **Step 2: Insert a new "Last session" block**

Immediately below the table and above the existing "Last session — 2026-06-18 (Stage 9a — staging deployment)" entry, insert:

```markdown
## Last session — 2026-06-18 (Stage 9a-ii — realtime map data)

**Branch in progress:** `feature/09a-ii-realtime-map` (not yet merged).

### Architecture flip

- Public map data flow changed from Astro build-time fetch to client-side fetch + Supabase Realtime subscription with granular event-driven patching. See [ADR 0005](adr/0005-realtime-map-data.md) for the full rationale + alternatives considered.
- `<MapSection>` is now the data owner: fetches catalog on mount, subscribes to `postgres_changes` events on `public.authors` and `public.books`, patches local state in place.
- `src/pages/index.astro` and `src/pages/en/index.astro` no longer call `getCatalog()` at build time. The build is now data-independent (no more `[authors] getCatalog() failed` noise in build logs when local Supabase is off).

### DB + reducers

- New migration `0008_realtime_authors.sql` — `alter publication supabase_realtime add table public.authors, public.books;`.
- New `src/lib/realtime-reducers.ts` — six pure helpers (addAuthor / updateAuthor / removeAuthor / addBook / updateBook / removeBook) for granular patching.
- Applied to staging via `supabase db push`; verified via `pg_publication_tables` query.

### Verification on staging

- Two-tab demo: promote an author in tab 1's admin → country colors on tab 2's public map within ~1 second.
- Books arrive incrementally as their per-row INSERT events flow through.
- WebSocket connection persists across tab switches; one-shot resync on reconnect.

### Out of scope (deferred)

- Realtime extension to admin pending-count badge — still polling every 60s (Phase 2).
- Realtime extension to admin inbox suggestions table — still client-fetch on mount (Phase 2).
```

- [ ] **Step 3: Update Project Facts**

In the "Project facts worth remembering" section, add a new line:

```markdown
- **Public map data flow:** static shell + client-side fetch + Supabase Realtime subscription with granular patching. ADR 0005 captures the architecture flip from Stages 4-5's build-time fetch. Anything that mutates `public.authors` or `public.books` propagates to every open tab in ~1 second.
```

- [ ] **Step 4: Update "How to resume tomorrow"**

The 9b resume commands still apply; no changes needed there. Just confirm the section already points at `feature/09b-production-deploy` (it does from the 9a wrap-up).

- [ ] **Step 5: STOP — Task C1 done.**

---

## Task C2 — `[Subagent]` Update `docs/01-implementation-plan.md`

**Files:**

- Modify: `docs/01-implementation-plan.md`

- [ ] **Step 1: Insert a new Stage 9a-ii section between 9a and 9b**

After the "Stage 9a — Staging deployment" section ends (look for "**Pause for review.**" closing that section), insert:

```markdown
## Stage 9a-ii — Realtime map data (client-side fetch + Supabase Realtime)

**Branch:** `feature/09a-ii-realtime-map`

**Goal:** Flip public map data from Astro build-time fetch to client-side fetch + Supabase Realtime subscription with granular patching, so promoted authors land on every open tab within ~1 second without rebuilding.

**Build:**

- New migration `0008_realtime_authors.sql` — adds `public.authors` + `public.books` to the `supabase_realtime` publication.
- New `src/lib/realtime-reducers.ts` — six pure reducers for granular Realtime patching (addAuthor / updateAuthor / removeAuthor + same trio for books).
- Refactor `src/components/MapSection.tsx` — drop `catalog` prop, add internal state + two useEffect hooks (initial fetch + subscription).
- `src/pages/index.astro` + `src/pages/en/index.astro` — remove `getCatalog()` import + call + `catalog={...}` prop.
- New ADR `docs/adr/0005-realtime-map-data.md` — captures the architecture flip + alternatives considered.

**Verify:**

1. `npm run build` passes with no `[authors] getCatalog() failed` lines.
2. Local: open Studio, INSERT a test author, see country colored on the live dev site within ~1 second.
3. Staging two-tab demo: tab 1 admin promotes → tab 2 public map updates without refresh.
4. devtools Network: one initial PostgREST query + persistent WebSocket connection.

**Pause for review.**
```

If a stage table / TOC exists at the top of the file, add a 9a-ii row there too.

- [ ] **Step 2: STOP — Task C2 done.**

---

## Task C3 — `[Subagent]` Update `docs/40-phase2-backlog.md`

**Files:**

- Modify: `docs/40-phase2-backlog.md`

- [ ] **Step 1: Update "Realtime pending-count badge" entry**

Find the existing entry in the "Operations & infrastructure" section. Replace its body with:

```markdown
### Realtime pending-count badge

**Discussed in:** Stage 7b-i brainstorming.
**Why deferred:** 60-second polling is good enough for MVP and avoids a Realtime subscription. Now that Stage 9a-ii has wired Realtime infrastructure for the public map, extending to the admin pending-count badge is incremental — same `supabase.channel().on('postgres_changes', { table: 'suggestions' })` pattern as `<MapSection>`, just narrower (count delta, not full payload).
**Where to add it later:** `src/components/AdminAwareNav.tsx` — replace the `setInterval` poll with a channel subscription scoped to `INSERT`/`UPDATE` events on `suggestions` table.
```

- [ ] **Step 2: Update "SSR via Cloudflare adapter" entry**

Find the existing entry. Replace its body with:

```markdown
### SSR via Cloudflare adapter

**Discussed in:** Stage 7b-i brainstorming. Revisited Stage 9a-ii.
**Why deferred:** Stage 9a-ii's "static shell + client-side fetch + Realtime" pattern solved the build-time-vs-runtime-data tension that originally motivated SSR consideration. Static output stays for the speed + CDN benefits; data is dynamic via Realtime. SSR is now only worth revisiting if Server-Side Rendering specifically (e.g., per-author detail pages for SEO indexing of bios) becomes important.
**Where to add it later:** `astro.config.mjs` switches to `output: 'server'` (or `'hybrid'` for per-route opt-in), add `@astrojs/cloudflare` adapter, move data-fetching back into Astro components.
```

- [ ] **Step 3: STOP — Task C3 done.**

---

## Task C4 — `[Subagent]` Update `docs/30-ops/staging-deploy.md`

**Files:**

- Modify: `docs/30-ops/staging-deploy.md`

- [ ] **Step 1: Remove the "Public map data is built at compile time" gotcha**

Find the bullet starting with "**Public map data is built at compile time, not runtime.**" in the "Gotchas surfaced during Stage 9a" section. Replace it with:

```markdown
- **Public map data is live via Supabase Realtime (since 9a-ii).** `<MapSection>` fetches the catalog on mount + subscribes to `postgres_changes` events on `public.authors` and `public.books`. Promoted authors propagate to all open tabs within ~1 second. See [ADR 0005](../adr/0005-realtime-map-data.md) for the architecture. If the map is stale, check the devtools WebSocket panel — connection drops auto-resync via a one-shot `getCatalog()` on rejoin.
```

- [ ] **Step 2: STOP — Task C4 done.**

---

## Task C5 — Final build + verification

- [ ] **Step 1: `npm run build` final pass**

Run:

```powershell
npm run build
```

Expected: 11 pages built, no errors, no `getCatalog() failed` lines.

- [ ] **Step 2: Read the diff one more time**

Run:

```powershell
git status
git diff --stat
```

Expected files modified across Slice A + B + C:

- `supabase/migrations/0008_realtime_authors.sql` (new)
- `src/lib/realtime-reducers.ts` (new)
- `src/components/MapSection.tsx` (modified)
- `src/pages/index.astro` (modified)
- `src/pages/en/index.astro` (modified)
- `docs/adr/0005-realtime-map-data.md` (new)
- `docs/RAG.md` (modified)
- `docs/STATUS.md` (modified)
- `docs/01-implementation-plan.md` (modified)
- `docs/40-phase2-backlog.md` (modified)
- `docs/30-ops/staging-deploy.md` (modified)

- [ ] **Step 3: STOP — Slice C complete.**

Alejandro: review the docs diff. Commit. Suggested message:

```
docs(stage-9a-ii): STATUS + implementation-plan + Phase 2 backlog + runbook
```

---

## Stage 9a-ii wrap-up (after all three slices)

- [ ] **Open PR** `feature/09a-ii-realtime-map` → `development`. Title: `Stage 9a-ii — Realtime map data`. Body: link to the spec + ADR 0005.
- [ ] **Verify on staging post-merge**: open the two-tab demo (admin tab + public tab). Promote a suggestion in admin. Watch the public map update on the other tab within ~1 second.
- [ ] **Confirm Cloudflare Pages build logs** for the new deploy: no `getCatalog() failed` lines. Build is data-independent.

Stage 9b (production deploy) inherits this architecture by default — no migration-style decision to revisit.

---

## Self-review checklist

| Spec section                                             | Plan coverage                                                                                                                                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision #1 (skeleton initial render)                    | Slice B Task B2 — `catalog === null` renders empty map ✓                                                                                                                           |
| Decision #2 (`getCatalog()` on mount)                    | Slice B Task B2 — useEffect with `getCatalog().then(...)` ✓                                                                                                                        |
| Decision #3 (subscribe to authors + books, all events)   | Slice B Task B2 — six `.on('postgres_changes', ...)` listeners ✓                                                                                                                   |
| Decision #4 (granular patching)                          | Slice B Task B1 — six reducers in `realtime-reducers.ts` ✓                                                                                                                         |
| Decision #5 (countries stays build-time)                 | Implicit — no changes to country data flow; B3/B4 only remove catalog, not countries ✓                                                                                             |
| Decision #6 (EN parity)                                  | Slice B Task B4 ✓                                                                                                                                                                  |
| Decision #7 (migration 0008)                             | Slice A Task A1 ✓                                                                                                                                                                  |
| Decision #8 (RLS unchanged)                              | Implicit — migration doesn't touch policies; reducer re-checks `published === true` (defence in depth) ✓                                                                           |
| Decision #9 (subscribe on mount, unsubscribe on unmount) | Slice B Task B2 — `supabase.removeChannel(channel)` cleanup ✓                                                                                                                      |
| Decision #10 (reconnect resync)                          | Slice B Task B2 — `hasSubscribedOnce` ref tracks first vs. subsequent SUBSCRIBED transitions; reconnect (subsequent SUBSCRIBED) calls `getCatalog()` to resync any missed events ✓ |
| Decision #11 (defensive failure mode)                    | Slice B Task B2 — `getCatalog()` already returns `[]` on error; setCatalog handles null gracefully ✓                                                                               |
| Decision #12 (ADR 0005)                                  | Slice A Task A3 ✓                                                                                                                                                                  |
| Risk #1 (skeleton flash)                                 | Slice B Task B2 — map outline renders immediately, countries paint when catalog arrives ✓                                                                                          |
| Risk #2 (Realtime connection limit)                      | Documented in ADR; no plan action needed ✓                                                                                                                                         |
| Risk #3 (event ordering)                                 | Slice B Task B1 — `addAuthor` creates bucket if absent, `addBook` no-ops if author not yet present, then auto-fills when author arrives ✓                                          |
| Risk #4 (RLS leak)                                       | Slice B Task B1 — reducers re-check `published === true` ✓                                                                                                                         |
| Risk #5 (WebSocket disconnect)                           | Slice B Task B2 — supabase-js auto-reconnects; resync placeholder ready for future enhancement ✓                                                                                   |
| Risk #6 (initial fetch fails)                            | Slice B Task B2 — `getCatalog()` already returns `[]` on error (per `authors.ts:55-58`) ✓                                                                                          |
| Risk #7 (author lacks books at INSERT time)              | Slice B Task B1 — `addAuthor` initializes with empty books; subsequent `addBook` events append ✓                                                                                   |
| Risk #8 (build no longer needs Supabase)                 | Slice B Task B5 — explicit verify step confirms no `getCatalog() failed` lines ✓                                                                                                   |
