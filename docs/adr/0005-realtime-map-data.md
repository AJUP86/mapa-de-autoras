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
