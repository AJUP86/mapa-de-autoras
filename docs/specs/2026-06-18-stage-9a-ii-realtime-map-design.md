# Stage 9a-ii — Realtime map data

**Date:** 2026-06-18
**Branch:** `feature/09a-ii-realtime-map`
**Status:** Design approved, ready to implement.

> Companion to [docs/specs/2026-06-12-stage-9a-staging-deploy-design.md](2026-06-12-stage-9a-staging-deploy-design.md). Stage 9a shipped staging on a static-output Astro site with build-time Supabase fetches; the public map only refreshes on the next Pages build. 9a-ii flips the public map to client-side data fetch + Supabase Realtime subscription so promoted authors land on every open tab within ~1 second. The static-shell + client-side-data shift is captured in [ADR 0005](../adr/0005-realtime-map-data.md).

---

## Why now

Staging surfaced the gap immediately: an admin promoted a suggestion, the row landed in Supabase, the admin inbox updated — but the public map showed nothing until a Pages rebuild ran. For a site whose value proposition is "see new authors as they appear", a multi-minute build lag is a UX failure. Real-time updates are not a phase 2 nice-to-have; they're a baseline expectation.

## Scope

**In (9a-ii):**

- Public map data flows shift from build-time to runtime: `MapSection.tsx` fetches the catalog itself on mount and subscribes to Postgres changes via Supabase Realtime.
- `src/pages/index.astro` and `src/pages/en/index.astro` drop the `await getCatalog()` call in front-matter and the `catalog` prop on `<MapSection>`.
- New migration `0008_realtime_authors.sql` adds `public.authors` and `public.books` to the `supabase_realtime` publication so Realtime emits events for those tables.
- Realtime events are handled **granularly** (industry-standard streaming pattern): INSERT → append, UPDATE → replace, DELETE → remove. No refetch-on-event.
- On WebSocket reconnect, one-time catalog refetch to resync (handles transient disconnects).
- New ADR 0005 captures the architecture flip from Stages 4-5 "build-time fetch baked into static HTML" to "static shell + client-side data + Realtime".

**Out (9a-ii):**

- Admin pages (inbox, promote, suggestion review) — already client-side; pending-count badge polling stays as-is (Phase 2 backlog covers the Realtime upgrade if/when it becomes useful).
- `countries` table — static-by-nature 249-entry ISO list, stays build-time.
- Suggestions table — admin-only by RLS; not surfaced on the public map; no Realtime needed.
- Optimistic local updates inside the promote form — admin redirects to `/admin/inbox` after Save, so the admin doesn't see the public map mid-flow. Visitors get the update via Realtime.
- Map shell skeleton text (e.g., "Cargando autoras…") — the map outline + filter buttons render immediately; data arrives ~200-500ms later. No additional loading copy needed.

**Out (Phase 2):** see [docs/40-phase2-backlog.md](../40-phase2-backlog.md).

---

## Decisions

| #   | Decision             | Choice                                                                                                                                                                | Rationale                                                                                               |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Initial render       | Map outline + filter buttons + empty side panel; no countries highlighted until catalog loads                                                                         | Skeleton flash <500ms is acceptable; map shell alone signals "loading"                                  |
| 2   | Initial data fetch   | `MapSection` calls `getCatalog()` on mount via `useEffect`                                                                                                            | Same SQL shape as the old build-time call; one query, reusable function                                 |
| 3   | Realtime scope       | Subscribe to BOTH `public.authors` and `public.books`, events `*` (INSERT/UPDATE/DELETE)                                                                              | Covers promote (author + N books), edit (7b-ii), delete (7b-ii) without future refactor                 |
| 4   | Event handling       | **Granular patching**: INSERT appends, UPDATE replaces by id, DELETE removes by id. Books are matched to parent author by `author_id` and appended in `display_order` | Industry-standard streaming pattern; zero extra queries per event; UI updates within ~50ms of DB commit |
| 5   | Countries data       | Stays build-time, passed as Astro prop to `<MapSection>` (or sourced from a static module)                                                                            | Static 249-entry ISO list; refetching wasteful                                                          |
| 6   | EN locale parity     | Both `index.astro` and `en/index.astro` lose `getCatalog()`; both pass the same labels into one shared `<MapSection>`                                                 | Symmetric, no per-locale code                                                                           |
| 7   | Migration            | New `0008_realtime_authors.sql`: `alter publication supabase_realtime add table public.authors, public.books;`                                                        | Realtime is opt-in per table on Supabase                                                                |
| 8   | RLS posture          | Unchanged — anon already filtered to `published = true` via existing policy on `authors`; books inherit via FK + their own policy                                     | Subscriptions inherit table RLS; no new security surface                                                |
| 9   | Connection lifecycle | `useEffect` mounts the subscription; cleanup unsubscribes on unmount                                                                                                  | Prevents leaks across SPA-style navigation and HMR reloads in dev                                       |
| 10  | Reconnect / resync   | On WebSocket reconnect → one-time `getCatalog()` to re-sync (events missed during disconnect would otherwise leave state stale)                                       | Standard "rejoin and resync" pattern; supabase-js exposes connection state via the `system` event       |
| 11  | Failure mode         | If initial fetch fails OR Realtime fails to connect → render the existing "empty map" gracefully + log to console; do not block the rest of the page                  | Defensive; the suggest form, navigation, and styleguide still work                                      |
| 12  | ADR                  | New [ADR 0005](../adr/0005-realtime-map-data.md) — captures the architecture flip from Stages 4-5 + the public/private rationale                                      | Decisions live in committed `docs/`, not memory                                                         |

---

## Architecture

```
   ┌──────────────────────────────────┐
   │  Cloudflare CDN edge             │   Astro static HTML/CSS/JS
   │  staging.mapadeautoras.com       │   (instant first paint, no data baked in)
   └──────────────┬───────────────────┘
                  │
                  │ MapSection React island mounts
                  ▼
   ┌──────────────────────────────────┐
   │  <MapSection> (initial state)    │
   │  - catalog: null (skeleton)      │
   │  - countries: from Astro props   │   World outline + filter UI render
   └──────────────┬───────────────────┘
                  │
                  │ useEffect → getCatalog() one-shot query
                  ▼
   ┌──────────────────────────────────┐
   │  Supabase PostgREST              │
   │  authors + books (RLS-filtered)  │
   └──────────────┬───────────────────┘
                  │ {country: [{author, books[]}]}
                  ▼
   ┌──────────────────────────────────┐
   │  <MapSection> (loaded)           │
   │  catalog: CountryEntry[]         │
   │  Map paints countries; ready     │
   └──────────────┬───────────────────┘
                  │
                  │ useEffect → supabase.channel().on(...).subscribe()
                  ▼
   ┌──────────────────────────────────┐
   │  Supabase Realtime (WebSocket)   │
   │  channel: 'public-map-realtime'  │
   │  events:                         │
   │   - public.authors INSERT/UPD/DEL│   Push events as DB changes happen
   │   - public.books   INSERT/UPD/DEL│
   └──────────────┬───────────────────┘
                  │
                  ▼
   ┌──────────────────────────────────┐
   │  Granular patcher                │
   │  INSERT author → append          │
   │  UPDATE author → replace by id   │
   │  DELETE author → remove by id    │
   │  Same three for books            │
   │  Books matched by author_id      │
   └──────────────────────────────────┘
                  ▲
                  │ On WebSocket reconnect → one-shot resync
                  │ (re-run getCatalog() once, then resume patching)
                  └─────
```

---

## Component contract — `<MapSection>` (refactored)

**Props (after refactor):**

- `labels: MapLabels` — i18n strings (same as today).
- `countries: CountryRow[]` — ISO 3166-1 list, build-time prop (same as today; used for country names + topojson lookup).
- ~~`catalog: CountryEntry[]`~~ — **removed**. Catalog is now internal state.

**Internal state:**

- `catalog: CountryEntry[] | null` — `null` = loading, `[]` = loaded but empty, `CountryEntry[]` = loaded with data.
- `connectionState: 'connecting' | 'open' | 'reconnecting' | 'closed'` — surfaces Realtime status for optional UI indicator (small dot or nothing; default nothing).

**Lifecycle (useEffect):**

1. Mount → `getCatalog()` → `setCatalog(result)`.
2. After catalog loads → `supabase.channel('public-map-realtime')` → register `.on('postgres_changes', ...)` listeners for authors + books, all event types → `.subscribe()`.
3. On each event → call the matching reducer (`addAuthor`, `updateAuthor`, `removeAuthor`, `addBook`, `updateBook`, `removeBook`) on local catalog state.
4. On `system` event with `'CLOSED' → 'JOINED'` transition (reconnect) → one-shot `getCatalog()` to resync.
5. Unmount → `supabase.removeChannel(channel)`.

**Render:**

- If `catalog === null` → render map outline, filter buttons, "all countries default-colored" baseline. No author dots or panel content.
- If `catalog !== null` → render full map as today.

---

## Reducer helpers (new — `src/lib/realtime-reducers.ts`)

Co-located helpers for the granular patching logic:

```ts
// Pure, testable. Take a catalog snapshot + an event payload, return the new catalog.
export function addAuthor(catalog: CountryEntry[], row: AuthorRow): CountryEntry[];
export function updateAuthor(catalog: CountryEntry[], row: AuthorRow): CountryEntry[];
export function removeAuthor(catalog: CountryEntry[], id: string): CountryEntry[];
export function addBook(catalog: CountryEntry[], row: BookRow): CountryEntry[];
export function updateBook(catalog: CountryEntry[], row: BookRow): CountryEntry[];
export function removeBook(catalog: CountryEntry[], id: string): CountryEntry[];
```

Rules:

- `published = false` authors are filtered out before patching (anon RLS would not deliver such rows, but defence-in-depth).
- New author lands in its `country_iso_a3` bucket; bucket is created if it doesn't exist.
- Removing the last author from a country bucket removes the bucket.
- Books sort by `display_order` within their parent author.
- Author UPDATE → preserves existing books array; only top-level fields are merged.

---

## Migration `0008_realtime_authors.sql`

```sql
-- Stage 9a-ii — Enable Realtime for the public map data tables.
--
-- Supabase Realtime is enabled at the project level by default, but each table
-- must be added to the supabase_realtime publication for postgres_changes
-- events to be emitted. Anon subscribers receive only rows visible under RLS,
-- so the existing `published = true` filter on authors continues to gate
-- visibility — books inherit the gate via their parent author + their own RLS.

alter publication supabase_realtime add table public.authors;
alter publication supabase_realtime add table public.books;
```

---

## Risks + mitigations

| #   | Risk                                                                                                     | Mitigation                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Skeleton flash feels janky on slow connections                                                           | Map outline + filter UI render immediately; only the country highlights wait for data. Visual experience is "map loads, then comes alive" — same pattern as Google Maps and other map-heavy sites |
| 2   | Supabase Realtime free-tier limit (200 concurrent connections)                                           | MVP traffic estimate is dozens of visitors at peak. Well within limit; revisit if traffic grows 10×                                                                                               |
| 3   | Events arrive out of order (author INSERT vs. its book INSERTs from the same promote transaction)        | Granular patcher tolerates this: author can land with empty books; subsequent book events append. Inter-event delay is milliseconds; user-perceptible latency is zero                             |
| 4   | RLS leak — Realtime emits a row that shouldn't be visible                                                | Already covered: RLS policies apply to Realtime subscriptions. `published = false` rows are filtered server-side before emission. Reducer also re-checks `published === true` as defence-in-depth |
| 5   | WebSocket disconnect leaves catalog stale                                                                | supabase-js auto-reconnects with exponential backoff. On reconnect, fire one-shot `getCatalog()` to resync; resume granular patching                                                              |
| 6   | Initial fetch fails (e.g., Supabase down)                                                                | `MapSection` catches the error, renders the empty-map baseline; logs to console. Rest of the page (suggest form, nav, footer) keeps working                                                       |
| 7   | New author lacks books at the moment its INSERT event arrives                                            | Country is colored, author shows in side panel with empty books list; books appear within milliseconds as their INSERT events arrive (granular patcher appends)                                   |
| 8   | Astro build no longer fails on missing local DB (since `getCatalog()` is no longer called at build time) | Bonus side effect — removes the `[authors] getCatalog() failed: TypeError: fetch failed` noise from recent build logs when Docker isn't running. Build is now data-independent                    |

---

## Slice plan

### Slice A — DB migration + ADR

- New migration `supabase/migrations/0008_realtime_authors.sql`.
- New ADR `docs/adr/0005-realtime-map-data.md` — captures the architecture flip + alternatives considered (build-time vs. SSR vs. client-side+Realtime).
- `docs/RAG.md` — add ADR 0005 row.
- Apply migration locally (`npm run dev:db:reset` is **not** required — can run the SQL directly in Studio if user prefers to preserve admin); apply to staging via `supabase db push`.

### Slice B — Client-side fetch + Realtime subscription

- New `src/lib/realtime-reducers.ts` — six pure reducer helpers.
- Refactor `src/components/MapSection.tsx`:
  - Drop `catalog` prop, add internal state.
  - `useEffect` to fetch on mount.
  - Second `useEffect` to subscribe to Realtime.
  - Render skeleton when `catalog === null`.
- Refactor `src/pages/index.astro` — remove `getCatalog()` import + call, remove `catalog` prop.
- Refactor `src/pages/en/index.astro` — same.
- Verify locally: `npm run dev`, open `/`, watch devtools Network for the fetch, watch for WebSocket connection.

### Slice C — STATUS + docs sync

- `docs/STATUS.md` — add "Last session — 2026-06-18 (Stage 9a-ii)" entry; mark 9a-ii Done in roadmap table.
- `docs/01-implementation-plan.md` — add a Stage 9a-ii section between 9a and 9b.
- `docs/40-phase2-backlog.md` — remove or update "SSR via Cloudflare adapter" entry (no longer the only path to real-time data) and "Realtime pending-count badge" (still phase 2, but now consistent with the broader Realtime infrastructure we're using).
- `docs/30-ops/staging-deploy.md` — remove the "Public map data is built at compile time" gotcha (no longer true); add a brief note about Realtime connection management and the Supabase Realtime free-tier limit.
- `npm run build` confirms 11 pages still build without runtime data fetches.

---

## Verification checklist (whole stage)

- [ ] `staging.mapadeautoras.com` loads; map outline + filter UI render immediately.
- [ ] Within ~500ms, country highlights appear (no skeleton text needed; transition is smooth).
- [ ] devtools Network shows a single `authors?select=...,books(...)` request on page load.
- [ ] devtools Network shows a persistent WebSocket connection to `*.supabase.co/realtime/v1/websocket`.
- [ ] Open two tabs of `staging.mapadeautoras.com`. In tab 1, log in to admin → promote a pending suggestion. In tab 2 (no refresh), the country gets colored within ~1 second and the author appears in the side panel when clicked.
- [ ] In tab 2: open admin (still works), reject a suggestion; in tab 1's map: no change (suggestions don't affect map until promoted — by design).
- [ ] Build logs on next Pages deploy show NO more `[authors] getCatalog() failed: TypeError: fetch failed` lines (build no longer depends on Supabase being reachable).
- [ ] `npm run build` passes locally without Docker running.

---

## Open questions before implementation starts

- **Connection-state UI indicator**: spec says default-no (just silent reconnect). If you want a tiny "live" badge or a "reconnecting…" toast for debug visibility, flag it now and we'll add to Slice B. Otherwise the user never sees Realtime mechanics — they just see the map updating.
- **Local dev with Realtime**: local Supabase ships Realtime by default. Migration 0008 applies locally on next `dev:db:reset`. No additional setup required.
- **Backwards compatibility**: this is a one-way migration. Once 0008 is applied + MapSection refactored, the build no longer produces a static map with data baked in. If we ever wanted to roll back, we'd need to restore the build-time fetch in both `index.astro` files. The ADR captures this trade-off.

---

## Hours estimate

| Phase                                                      | Hours                             |
| ---------------------------------------------------------- | --------------------------------- |
| Spec (this doc)                                            | 1                                 |
| Plan (next)                                                | 0.5                               |
| Slice A — Migration + ADR + RAG                            | 0.5                               |
| Slice B — MapSection refactor + reducers + Astro pages     | 3-4                               |
| Slice C — STATUS + plan + docs + 40-phase2-backlog updates | 0.5-1                             |
| Verify on staging (incl. tab-to-tab demo)                  | 0.5                               |
| **Total realistic**                                        | **5-7h** spread over 1-2 sessions |
