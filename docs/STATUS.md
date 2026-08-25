# Project status

Running log of what's done, what's next, and any context a future-you (or contributor) needs to pick the project back up without re-reading the whole git history.

> Update this file at the end of every working session. Keep it short — link out to ADRs / `docs/01-implementation-plan.md` for details.

---

## Where we are on the MVP roadmap

| Stage                                                                                     | Status               | Branch                             |
| ----------------------------------------------------------------------------------------- | -------------------- | ---------------------------------- |
| 0 — Branching                                                                             | ✅ Merged            | master / development               |
| 1 — Scaffold + brand tokens + styleguide                                                  | ✅ Merged            | feature/01-scaffold-and-styleguide |
| 2 — i18n skeleton (ES default, EN at /en/)                                                | ✅ Merged            | feature/02-i18n-skeleton           |
| 3 — Supabase schema + RLS + 249-country seed                                              | ✅ Merged            | feature/03-supabase-schema         |
| 4 — Public landing + map (mocked data)                                                    | ✅ Merged            | feature/04-landing-and-map         |
| 4b — Two-color hierarchy map palette refinement                                           | ✅ Merged            | feature/04b-map-palette-penguin    |
| 5 — Map runs on live Supabase data + dev seed                                             | ✅ Merged            | feature/05-real-author-data        |
| **6 — Suggestion form + Turnstile + Edge Function**                                       | ✅ Merged            | feature/06-suggestion-flow         |
| 7a — Owner notification + admin auth + read-only inbox                                    | ✅ Merged            | feature/07a-notify-and-auth        |
| 7b-i — Promote suggestion + currently_reading + translate + unified admin UX              | ✅ Merged            | feature/07b-promote-and-crud       |
| 7b-ii — Author CRUD — add-more-books ✅ (8.5 /admin/add + promote); edit + delete pending | ⏳ Partial           | feature/07b-ii-author-crud         |
| 8 — Notify submitter on promote (scope pivoted from newsletter)                           | ✅ Merged            | feature/08-newsletter-confirmation |
| 8.4 — Page-pair DRY (shared components) + always-prefix locale URLs (dynamic routes)      | ✅ Merged            | feature/08.4-page-pair-dry         |
| **8.5 — Book-first refactor** (books.status, envelope suggestions, catalog, admin add)    | ✅ Done (PR → dev)   | feature/8.5-book-first-refactor    |
| 8.6 — Book detail + curation (book_quotes, buy links, public detail page, affiliate)      | 📝 Spec'd (deferred) | feature/8.6-book-detail (tbd)      |
| 9a — Staging deployment (Cloudflare Pages + Supabase staging)                             | ✅ Merged            | feature/09a-staging-deploy         |
| 9a-ii — Realtime map data (client-side fetch + Supabase Realtime)                         | ✅ Merged            | feature/09a-ii-realtime-map        |
| 9b — Production deployment (apex + www + Resend)                                          | ⏳ Pending           | feature/09b-production-deploy      |
| 10 — Launch content + checklist                                                           | ⏳ Pending           | feature/10-launch-prep             |

**Everything through 9a-ii + the 9-pre hardening is merged into `development`; `master` still holds only the initial commit (nothing merges there until the production launch).** Revised pre-launch path: **pre-deploy security hardening (9-pre — Branch 1 ✅ merged, Branch 2 ✅ merged + deployed to staging)** → **book-first refactor (8.5 ✅ Done, PR → development pending — + public catalog + admin auto-promote add)** → production deploy (9b) → launch prep (10). Post-launch backlog: author CRUD (7b-ii — **edit/delete only now; add-more-books shipped in 8.5**), real newsletter (broadcast list). Stage 10 (launch prep) has some early work merged (privacy policy, robots, site config) but remains **pending** overall — see [50-launch-checklist.md](50-launch-checklist.md).

---

## Last session — 2026-08-25 (Stage 8.5 — book-first refactor + public catalog + admin add)

**Status:** All of Stage 8.5 shipped on `feature/8.5-book-first-refactor` (13 commits). Executed workflow-driven (implement → independent review → adversarial probe) per task, with runtime verification (curl / anon-RLS canary / RPC-gate). `astro check` 0 errors, Vitest **36**, build **18 pages**. Migration chain 0011→0013 applies clean (`supabase migration up`). PR to `development` next.

### What landed

- **Schema (0011):** dropped `authors.status` → added `books.status` (`to_read|reading|read`, REPLICA IDENTITY FULL); suggestions became an **envelope** (`pending|processed`) + `suggestion_books` children (`disposition pending|promoted|rejected|already_present`); unique `authors (lower(name), country_iso_a3)`.
- **RPCs:** `promote_suggestion_book` (0012, entry-scoped, author-upsert — no duplicate dead-end) + `admin_add_book` (0013, `is_admin()`-gated auto-promote, publishes author).
- **Domain core (TDD):** `map-state` (aggregate book statuses → country color, `mixed` when ≥2) + `realtime-reducers` (id-keyed) rewritten; `getCatalog()` reads `books.status`.
- **Admin:** per-entry processing (promote / reject / already-present / re-open) + **Finish & notify**; book-status editor `/admin/books` (inline select, optimistic + revert, realtime repaint) with author / country / year filters; auto-promote **add** at `/admin/add` (the `+` nav).
- **Public:** book-first suggest form (envelope + N children, ack email); **catalog** `/books` (read-only, filterable, published-only via anon RLS — **canary-verified, no unpublished leak**); map filter + per-book panel badges on `books.status`.
- **Emails:** `submit_suggestion` → envelope payload + submit-ack; `notify_submitter` → per-book outcome (fires on `processed`, reuses C3 auth + no-revert idempotency).
- **DRY:** shared `src/lib/book-list.ts` (filter/derive pure fns, Vitest) + `BookFilters.tsx` reused by admin editor + public catalog.
- **Docs:** Stage **8.6** book-detail + curation **spec** written & deferred — `book_quotes` (bilingual passage + location), admin book-content editor (synopsis + quotes + buy-links), client-rendered public detail page, contextual affiliate disclosure.

### Verified vs. needs admin session / staging

- **Verified locally:** static gate (astro 0 / vitest 36 / build 18); anon catalog **canary** (unpublished author's book excluded, 38 vs 39); `admin_add_book` gate (anon → 401 permission denied, service-role → `unauthorized`, no insert); `notify_submitter` auth (anon bearer → 401) + new-schema selects (200).
- **Needs admin session / staging (login-gated or real email):** admin flows end-to-end (process a suggestion; edit status with two-tab realtime repaint; add a book); ack + outcome emails (Resend — the local `dev:functions` predates `RESEND_API_KEY`, so it short-circuits `skipped`); re-verify staging Database Webhook bearer + `TURNSTILE_ALLOWED_HOSTNAMES`.

### Follow-ups

- `docs/adr/0003-data-model.md` still describes the pre-8.5 schema (`authors.status`, one-row suggestions) — supersede with a book-first ADR/note before launch.
- Post-launch backlog item "**List view of authors + books by country**" is now partially delivered by `/books` — reconcile that entry.
- Stage 8.6 (book detail) per the new spec, sequenced after production (9b) or as prioritized.

### Next

- PR `feature/8.5-book-first-refactor` → `development` (CI runs the `verify` gate). Then 9b production deploy.

---

## Last session — 2026-08-09 (Pre-deploy hardening — Branch 2: Edge Function auth)

**Status:** Merged to `development`; Edge Functions deployed to staging via `supabase functions deploy --use-api`. Forged-admin-token spot-check on staging `translate` → **401** (C1 confirmed live; the old function returned 200). Closes every remaining P0 audit item (C1/C2/C3, H2, H3). Executed subagent-driven, with a per-task **workflow** (implement → independent spec review → parallel adversarial probes) for each fix. Also fixed the Windows line-ending churn early on this branch (`.gitattributes` = `* text=auto eol=lf` — Prettier writes LF, git `core.autocrlf=true` wanted CRLF → phantom-modified churn; now deterministic).

### What landed

- **Shared helpers** `supabase/functions/_shared/cors.ts` (origin-allowlist `corsHeaders(req)`) + `_shared/auth.ts` (`isServiceRoleBearer` constant-time compare; `requireAdmin` via `supabase.auth.getUser`).
- **C1 `translate`** — replaced the base64 (signature-**unverified**) JWT decode with `requireAdmin` (getUser signature check + `app_metadata.role==='admin'`); `verify_jwt` stays false (CORS preflight); origin CORS. Forged/anon/garbage/alg-none tokens → 401.
- **C2 `notify_owner`** — was an unauthenticated open email relay; now requires the service-role bearer, sends no CORS, PII log removed (H3 part b).
- **C3 `notify_submitter`** — pinned `[functions.notify_submitter] verify_jwt=true`; replaced the any-bearer check with `isServiceRoleBearer`; removed the `notified_at` revert-on-Resend-failure (at-most-once); dropped CORS for consistency.
- **H2 `submit_suggestion`** — server-side caps (booksText≤1000, note≤2000, submitterName≤120, email≤254); `verifyResp.ok` check; Turnstile hostname allowlist (`TURNSTILE_ALLOWED_HOSTNAMES`, enforce-if-set / skip-if-unset); origin CORS.
- **H3** — removed the undisclosed `subscribers` upsert (opt-in still recorded via `accepted_newsletter`).

### Gotchas surfaced (keep)

- **Local `supabase functions serve` injects `Access-Control-Allow-Origin: *` on every response**, masking each function's own CORS — the origin-allowlist **cannot be verified locally** (proven: `notify_owner` sends no CORS in code, yet the response shows `*`). It applies only on hosted. **Verify CORS on staging.**
- **Anon-key format:** local `.env` `PUBLIC_SUPABASE_ANON_KEY` is the new `sb_publishable_…` (rejected by the platform gate anyway); the token that exercises any-bearer holes is the **legacy JWT anon key** from `supabase status -o env`.
- **`supabase functions serve` hot-reloads** edited functions including `_shared/` imports — curl red→green works with no restart.

### Happy paths — verified vs. needs-staging

- **Verified locally (workflow positive controls):** `notify_owner` + `notify_submitter` with the real service-role bearer → 200 (the webhook callers still pass the new gates); `submit_suggestion` valid-length input passes the caps.
- **Needs staging verification (not testable locally):**
  - `translate` admin path — needs a real admin session JWT (log into `/admin`, hit Traducir). `requireAdmin` uses getUser; low risk but unverified live.
  - `submit_suggestion` — set/verify `TURNSTILE_ALLOWED_HOSTNAMES` on the staging function (include `staging.mapadeautoras.com`) or leave unset; confirm CORS allows the staging origin; submit a real form.
  - `notify_submitter` webhook — C3 reinstated the **strict** service-key match (`.trim()` handles whitespace, not truncation). **Re-verify/re-paste** the staging Database Webhook's `Authorization: Bearer <service_role>` so it matches exactly, else a promote won't email the submitter.
  - `notify_owner` — will 401 the current staging `pg_net` trigger (it sends no bearer); the owner email won't fire until **9b** wires the Database Webhook with the service-role bearer (expected per plan; was console-log-only on staging anyway).

### Next

- PR Branch 2 → `development` (CI runs on it now). Hardening (Branches 1+2) then complete.
- Staging smoke test of the happy paths above after deploy.
- Then the Stage 8.5 book-first refactor ([spec](specs/2026-08-07-stage-8.5-book-first-design.md) + [plan](plans/2026-08-07-stage-8.5-book-first-implementation.md)).

---

## Last session — 2026-08-08 (Pre-deploy hardening — Branch 1: CI + hygiene)

**Status:** Branch `feature/09-pre-1-ci-and-hygiene` — all 6 tasks committed, pre-PR to `development`. Audit-driven (see [docs/audit25072026.md](audit25072026.md)); precedes the Stage 8.5 refactor and Stage 9b. Full plan + coverage map: [docs/plans/2026-08-07-stage-9-pre-security-hardening-implementation.md](plans/2026-08-07-stage-9-pre-security-hardening-implementation.md).

### What landed (Branch 1)

- Removed committed `supabase/snippets/` Studio scratch (personal email + admin-grant SQL); gitignored the dir.
- Prettier baseline across the repo + `format` / `format:check` scripts.
- `astro check` 34 → 0 errors: excluded `supabase/functions` from `tsconfig` (Deno files were type-checked by the Node checker), fixed the `map-state.test.ts` helper + `promote.ts` `Json` casts.
- CI workflow `.github/workflows/ci.yml` — `format:check` + `astro check` + `vitest` + `astro build` on Node 22 for every PR/push to `development`/`master`.
- Build-time env guard in `astro.config.mjs` (fails `astro build` on missing `PUBLIC_*`, build-only); sitemap `/admin` filter.
- `/admin` de-indexed: robots `Disallow /admin` + a `noindex` meta via a new optional `Base.astro` prop (public pages unaffected).

### Gotchas surfaced (worth remembering)

- **`prettier-plugin-astro@0.14.1` (latest) is incompatible with `prettier@3.8.3`** — throws "Unhandled node type frontmatter" on every `.astro` file. `.astro` is excluded from Prettier via `.prettierignore` (+ `embeddedLanguageFormatting: "off"` so illustrative Markdown code fences don't fail the check); `.astro` stays covered by `astro check`. Revisit when the plugin supports prettier 3.8+.
- **Vite `504 (Outdated Optimize Dep)`** — after the Task-3 `npm install` (lockfile regen) + Task-5 `astro.config.mjs` change invalidated Vite's dep-optimize cache on a long-running dev server, the map island failed to load (`Failed to fetch dynamically imported module: MapSection.tsx`). Fix: stop dev, `rm -rf node_modules/.vite`, `npm run dev` (or `npm run dev -- --force`). Matches the older `.vite` note in this file.

### Next

- PR Branch 1 → `development` (CI runs on it once the workflow is on the default branch); then enable branch protection requiring the `verify` check on `development` + `master` (GitHub UI).
- Branch 2 `feature/09-pre-2-edge-function-auth` — C1 `translate` JWT verify, C2 `notify_owner` relay, C3 `notify_submitter`, H2 `submit_suggestion` validation, H3 `subscribers` write; adds shared `_shared/auth.ts` + `_shared/cors.ts`.
- Then Stage 8.5 book-first refactor ([spec](specs/2026-08-07-stage-8.5-book-first-design.md) + [plan](plans/2026-08-07-stage-8.5-book-first-implementation.md)), then 9b.

---

## Last session — 2026-07-21 (Stage 8 — notify submitter on promote)

**Status:** Shipped end-to-end on staging on 2026-07-21. Branch `feature/08-newsletter-confirmation` ready to merge to `development`. Branch name kept for git-history continuity; actual scope pivoted from "newsletter double-opt-in" to "transactional notification when a suggestion is promoted" during brainstorming.

### What landed

- **Migration `0010_stage8_notify_submitter.sql`** — `suggestions` gains three columns: `locale` (submitter language), `promoted_author_id` (FK back to the created author, populated by the RPC), `notified_at` (idempotency marker for the send). The `promote_suggestion` RPC now writes `promoted_author_id` inside its existing resolve-suggestion UPDATE.
- **`supabase/functions/notify_submitter/`** — new Edge Function pair: `email.ts` (inlined ES/EN strings + `renderEmail()`) and `index.ts` (webhook handler: auth check, load, idempotent claim, Resend POST, revert-on-failure).
- **`submit_suggestion`** extended: now stores `locale` on the suggestion insert (previously only on the deprecated `subscribers` upsert).
- **i18n copy:** opt-in checkbox label tightened ("Avísame cuando añada esta autora al mapa" / "Let me know when I add this writer to the map"). Privacy policy reframed — 5 `privacy.*_body` strings in each locale no longer reference a newsletter that doesn't exist.
- **`.env.example`** documents `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SITE_URL`. `RESEND_AUDIENCE_ID` removed as intentionally out-of-scope.
- **Docs:** spec at [docs/specs/2026-07-20-stage-8-notify-submitter-design.md](specs/2026-07-20-stage-8-notify-submitter-design.md), plan at [docs/plans/2026-07-20-stage-8-notify-submitter-implementation.md](plans/2026-07-20-stage-8-notify-submitter-implementation.md), debug runbook at [docs/30-ops/notify-submitter-debug.md](30-ops/notify-submitter-debug.md), Stage 8 section rewritten in `01-implementation-plan.md`, item 3 rewritten in `50-launch-checklist.md`, `RAG.md` updated.

### Ops setup on staging Supabase (`kkdjrzuewnwrlokhemnl`)

- Resend account provisioned via GitHub OAuth (free tier; `alejandrourroz86@gmail.com` is the account-owner address, and thus the only recipient Resend will deliver to until domain auth lands in 9b).
- `notify_submitter` deployed via `supabase functions deploy notify_submitter --project-ref kkdjrzuewnwrlokhemnl --use-api` — the `--use-api` flag is required on Windows CLI 2.102 (default Deno-bundling path hangs silently).
- Three function secrets set in the dashboard: `RESEND_API_KEY`, `RESEND_FROM_EMAIL=onboarding@resend.dev`, `SITE_URL=https://staging.mapadeautoras.com`.
- Supabase Database Webhook `notify_submitter_on_promote` configured (Integrations → Database Webhooks): `suggestions UPDATE` → POST to function URL with `Authorization: Bearer <service_role>`. Current dashboard UI does not expose conditional filters — function's internal guards handle the filtering.

### Verified (2026-07-21)

- Opt-in submission via `/suggest` → admin promote → email arrived at `alejandrourroz86@gmail.com` within seconds. `suggestions.notified_at` populated. Author on map.
- (Regression to run on the next test session, or trust construction: opt-out submission → no email fires; the function guard `if (sug.accepted_newsletter !== true) return ... "not_opted_in"` covers it.)

### Debug notes worth keeping

- **Auth check relaxed.** Original design required exact-string match between the webhook Authorization header and `SUPABASE_SERVICE_ROLE_KEY`. JWT paste in the webhook UI is fragile (whitespace/truncation); Supabase's platform-level `verify_jwt=true` already validates JWTs before the handler runs. The in-function check now only requires a Bearer token is present. See [debug runbook § Auth 401](30-ops/notify-submitter-debug.md).
- **Root-cause diagnostic:** `select * from net._http_response order by created desc limit 5;` in Supabase SQL editor shows the actual HTTP outcome of each webhook fire (status code + body + error message). More useful than the Edge Functions logs UI, which does not currently show request/response detail — only Boot/Shutdown lifecycle events.
- **Windows deploy quirk:** always append `--use-api` to `supabase functions deploy`. Non-obvious silent hang otherwise.

### Pending for Stage 9b

- Resend domain auth on `mapadeautoras.com` (SPF/DKIM/DMARC via Cloudflare DNS — same account, one-click). Swap `RESEND_FROM_EMAIL` to `hola@mapadeautoras.com` when domain is verified.
- Recreate the Database Webhook + three function secrets on the prod Supabase project. Function code carries over unchanged (relaxed auth pattern is compatible).

### Follow-up decisions (evening of 2026-07-21)

Post-shipping conversation surfaced a data-model bug we've been living with since Stage 4:

- **The `/suggest` form is author-centric, but the natural unit of curation is a book.** The visualization hierarchy (country → author → books) got copied into the _input_ direction, which is inverted from how a library actually grows.
- **Concrete symptoms in the current code:** (a) suggestions naming an author already in `authors` raise `duplicate_author` in the promote RPC and can't be processed; (b) `authors.status` is set at promote time and never updated — the map's "Leídas / Leyendo / Sugerencias" filters lie the moment Danny actually reads a promoted `discovery` book; (c) the notify_submitter email can only carry one outcome per suggestion because a suggestion covers one author with N books.
- **The refactor:** move state to `books.status` (`to_read` → `reading` → `read`), drop `authors.status`, switch `/suggest` to a book-first form (multi-book UI submits N atomic one-book suggestions server-side), add `disposition` on `suggestions` (`pending` / `added` / `already_present` / `rejected`), enumerate per-book outcomes in notify_submitter emails.

**Two stages added to the pre-launch path:**

1. **Stage 8.4 — Page-pair DRY refactor** (~3.5h). Consolidate the 10 duplicated ES/EN page files into 5 shared components. Cheaper 8.5 afterwards (form/UI edits touch one file per page instead of two). Branch: `feature/08.4-page-pair-dry` (already created).
2. **Stage 8.5 — Book-first refactor** (~5.5 days). Requires its own brainstorm + spec + plan cycle. Branch: `feature/08.5-book-first-refactor` (future).

**Revised pre-launch runway:** 8.4 → 8.5 → 9b → 10 launch polish → live. ~2 weeks of session-work. Meaningful delay but the model reflects how library curation actually works.

Details captured in [docs/50-launch-checklist.md](50-launch-checklist.md) §5.5 and §5.6.

### Stage 8.4 also shipped this session (2026-07-21 late night)

Merged to `development` via PR #14. Two slices, one branch (`feature/08.4-page-pair-dry`):

**Slice 1 — Shared page components.** Consolidated the 5 ES/EN page pairs (index, about, suggest, thanks, privacy — 10 delegate files) into 5 shared components under `src/components/pages/*Page.astro`. Each page pair's route file became a 3-line delegate importing the shared component.

**Slice 2 — Dynamic routes + always-prefix locale URLs.** Went further than the original 8.4 scope after realising the two-file-per-URL pattern doesn't scale beyond 2 languages. Switched from `/thanks` + `/en/thanks` (default-locale-hidden) to `/es/thanks` + `/en/thanks` (always-prefix) using dynamic routes:

- `astro.config.mjs` — flipped `prefixDefaultLocale: true`, added top-level `redirects: { "/": "/es/" }` (the Astro-native `redirectToDefaultLocale: true` was incompatible with our `[lang]` dynamic-index pattern — required a physical `src/pages/index.astro` anchor page that would fight the dynamic route).
- New `src/i18n/locales.ts` — single source of truth for supported locales (`LOCALES = ["es", "en"] as const`). Adding a new language = one entry here.
- `src/pages/[lang]/{index,about,suggest,thanks,privacy}.astro` — 5 dynamic-route files, each ~11 lines using `getStaticPaths()` over `LOCALES` to emit both variants.
- Deleted all 10 legacy delegate files at `src/pages/*.astro` and `src/pages/en/*.astro`.
- Updated `src/layouts/Base.astro` language-switch logic to swap `/es/*` ↔ `/en/*` instead of adding/stripping `/en`. Admin pages (`/admin/*`) stay outside the locale scheme; language switch on admin defaults to the OTHER locale's home.
- Updated internal-link hardcodes in `SuggestPage.astro` (`thanksUrl`), `ThanksPage.astro` (`homeHref`), and `PromoteForm.tsx` (3 back-to-site refs from `/` → `/es/`).

**Diff impact:** 21 files, +171 / −310 lines. Net −139. More important than the line count: adding a language is now one line, editing shared markup is one file, new pages are one shared component instead of two.

**Verified on staging:** language switch works from every page; `/es/*` and `/en/*` both render; `/` redirects to `/es/`. Vitest 28/28 still green.

### Lessons learned (2026-07-21 late night)

Worth remembering for future sessions:

1. **Astro v5 `redirectToDefaultLocale: true` requires a physical root `src/pages/index.astro` anchor page** — dynamic `[lang]/index.astro` doesn't satisfy the check. Use top-level `redirects:` config instead. Error surface: `MissingIndexForInternationalizationError`.
2. **Windows + Supabase CLI 2.102 needs `--use-api` for `supabase functions deploy`** (already in the notify_submitter debug runbook, worth re-flagging).
3. **Supabase Database Webhook auth: don't strict-match the service_role key inside the function** — the platform-level `verify_jwt=true` already validates. JWT paste in the webhook UI is fragile (whitespace/truncation kills strict matching). Already applied in `notify_submitter/index.ts`.
4. **Console warnings on staging** (from Alejandro's DevTools inspection, worth filing under Stage 10 polish):
   - `OTS parsing error: Size of decompressed WOFF 2.0 is less than compressed size` — likely Cloudflare Pages double-compressing WOFF2 files. Fix in `_headers` if fonts render but noise appears.
   - `WebGL: INVALID_ENUM: getInternalformatParameter` + `powerPreference option ignored on Windows` + `No available adapters` — Turnstile bot-fingerprinting probes. Harmless per Turnstile docs; only appears on `/suggest` pages where Turnstile loads.

---

## Last session — 2026-07-01 (Stage 9a-ii — realtime map data)

**Status:** Merged into `development` on 2026-07-01; migrations 0008 + 0009 pushed to staging; verified live (two-tab realtime demo) on `staging.mapadeautoras.com`.

### Architecture flip

- Public map data flow changed from Astro build-time fetch to client-side fetch + Supabase Realtime subscription with granular patching. See [ADR 0005](adr/0005-realtime-map-data.md).
- `<MapSection>` now owns the catalog: fetches on mount, subscribes to `postgres_changes` on `public.authors` + `public.books`, patches local state in place (reducers in `src/lib/realtime-reducers.ts`), resyncs via `getCatalog()` on reconnect.
- `src/pages/index.astro` + `src/pages/en/index.astro` no longer call `getCatalog()` at build time — the build is data-independent (no more `[authors] getCatalog() failed` noise when local Supabase is off).

### Migrations

- `0008_realtime_authors.sql` — add `authors` + `books` to the `supabase_realtime` publication.
- `0009_iso_columns_to_text.sql` — **bug fix.** Supabase Realtime truncates `char(3)`/`bpchar` columns to one character in `postgres_changes` payloads, so `country_iso_a3` arrived as `"A"` not `"AUS"` and live-promoted authors never matched a map country (REST/`getCatalog` decoded correctly, so only reloads worked). Converted the three ISO columns to `text`. Confirmed with an anon Realtime probe.

### Tests (first in the repo)

- Added Vitest. `src/lib/map-state.test.ts` (13) + `src/lib/realtime-reducers.test.ts` (15) = **28 passing**. Scripts: `npm test`, `npm run test:watch`.

### Env / local

- `supabase/config.toml` `[db].major_version` 15 → 17. The Supabase CLI (≥ 2.102) initialises local volumes with PG 17.x; a leftover PG15 volume made `supabase start` crash-loop. Fix: `supabase stop --no-backup` → `npm run dev:db` → `npm run dev:db:reset` (wipes local data; re-bootstrap admin). Staging is PG `17.6.1.127` — **parity confirmed**; dashboard offers a patch upgrade to `.141`, deferred to 9b.

### Verified

- Two-tab browser demo: insert/promote a published author → the country paints live on another open tab within ~1s, no reload.

### Out of scope / next

- **Staging (Task A2):** `supabase db push` applies 0008 + 0009, then merge → `development` auto-deploys, then run the staging two-tab demo.
- Realtime admin inbox + pending-count badge → **Stage 9a-iii** (design brainstormed; spec pending).
- `notify_owner` deep-link points at `/admin/suggestions/:id` (404); should be `/admin/suggestion?id=` — small separate fix.

---

## Last session — 2026-06-18 (Stage 9a — staging deployment)

**Branch in progress:** `feature/09a-staging-deploy` (not yet merged).

### Hosted Supabase

- Provisioned `mapa-staging` (region `eu-west-1`, project ref `kkdjrzuewnwrlokhemnl`). All 7 migrations applied (0001-0007). 249-country seed run manually via Studio SQL (hosted projects don't auto-run `[db.seed].sql_paths`). Admin user bootstrapped.
- Three edge functions deployed: `submit_suggestion`, `notify_owner`, `translate`. `TURNSTILE_SECRET_KEY` + `DEEPL_API_KEY` set in function secrets. `RESEND_API_KEY` intentionally unset → `notify_owner` stays console-log only on staging (deferred to 9b).
- New migration `0007_fix_notify_url_setting.sql` — updates the notify trigger to read `app.settings.functions_url` instead of `app.functions_url`. Turns out **hosted Supabase blocks user-defined GUCs entirely**, including the `app.settings.*` namespace. Trigger writes harmless rows to `net._http_response`; 9b will pivot to Supabase Database Webhooks.
- Auth `site_url` + redirect URLs configured for `https://staging.mapadeautoras.com`. Magic-link emails route via Supabase's built-in mailer (4/hour limit on free tier).

### Cloudflare Pages + DNS

- Pages project `mapa-de-autoras` connected to GitHub repo, production branch = `development`, auto-deploys on every push.
- Env vars set in **Production scope** (not Preview — important): `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`, `NODE_VERSION=22`.
- `staging.mapadeautoras.com` mapped as custom domain (one-click since Cloudflare is both registrar + DNS host).
- Real Turnstile widget created (`mapa-de-autoras`) with 5 allowed hostnames covering local dev + staging + future production. Both local `.env` and the widget use the real keys (no more test keys).

### Heartbeat + docs

- New migration `0006_heartbeat_rpc.sql` adds `public.heartbeat()` — no-op SQL function called weekly to prevent free-tier auto-pause.
- New GitHub Actions workflow `.github/workflows/heartbeat.yml` (matrix-ready for 9b). Live-trigger verification deferred to post-merge (GitHub Actions only indexes workflows from the default branch).
- `STAGING_SUPABASE_URL` + `STAGING_SUPABASE_ANON_KEY` set as GitHub Actions repo secrets.
- New runbook `docs/30-ops/staging-deploy.md` documents env vars locations, key rotation, rollback, auto-pause recovery, and 10+ gotchas surfaced during the deploy.
- `docs/01-implementation-plan.md` updated — Stage 9 split into 9a (done) + 9b (pending).

### Gotchas surfaced (full list in the runbook)

- Cloudflare Pages env vars are scope-specific (Production vs Preview). Setting only one breaks builds for the other.
- Node 20 is EOL + breaks `@supabase/realtime-js` (needs native WebSocket). `NODE_VERSION=22` minimum.
- `verify_jwt = true` on hosted Edge Functions blocks CORS preflight (browser strips Authorization from OPTIONS → 401 → no CORS headers → POST blocked). Fix: `verify_jwt = false` in config.toml + dashboard toggle OFF + in-function `decodeJwtPayload` admin check.
- `supabase functions deploy` doesn't always sync verify_jwt — use `--no-verify-jwt` explicitly OR flip the dashboard toggle.
- CORS `Access-Control-Allow-Headers` must include `apikey, x-client-info` (sent by supabase-js). Updated in `translate/index.ts`.
- Hosted Supabase rejects user-defined GUCs entirely. Notify trigger URL approach must move to Supabase Database Webhooks in 9b.
- New Supabase anon key format is `sb_publishable_...` (replacing JWT-style `eyJ...`).
- GitHub Actions UI only shows workflows from the default branch.

### Out of scope (lives in 9b)

- Production Supabase project `mapa-prod` + production Pages project + apex + www custom domains
- Resend domain auth + real notify emails + HTML template
- Database Webhooks pivot for the notify trigger

---

## Last session — 2026-06-10 (Stage 7b-i)

**Branch in progress:** `feature/07b-promote-and-crud` (six commits, not yet merged).

### DB

- Migration `0004_promote_prep.sql`: `unaccent` extension, `public.slugify(text)` helper, `author_status` enum extended with `currently_reading`.
- Migration `0005_promote_suggestion_rpc.sql`: atomic `promote_suggestion(p_suggestion_id uuid, p_author jsonb, p_books jsonb[]) returns uuid`. `SECURITY DEFINER` + `is_admin()` gate. Server-generates the slug as `slugify(name) || '-' || lower(iso_a3)` with collision-suffix fallback. Duplicate guard by `(lower(name), country_iso_a3)`. When `p_suggestion_id` non-null, flips the suggestion to `approved` + sets `reviewed_at` + `reviewer_notes`.
- ADR `docs/adr/0004-translation-strategy.md` accepted — DeepL via admin-only Edge Function, owner reviews before save.

### Map state model

- Third state `currently_reading` (sage `#7a9b82`) added alongside read (penguin) and discovery (oxblood).
- Filter row went from 3 → 4 buttons: `Todas / Sugerencias / Leyendo / Leídas`.
- Semantic CSS aliases (`--c-state-read`, `--c-state-currently-reading`, `--c-state-discovery`) in `tokens.css` so palette swaps later are one-line edits.
- i18n label rename only — "Descubrimientos" → "Sugerencias" in ES (`Discoveries` → `Suggestions` in EN). DB enum stays `discovery`.

### Admin UX

- Route restructure: `/admin` is now the login form, `/admin/inbox` is the list, `/admin/promote` is the form.
- `<AdminAwareNav>` island mounted in `Base.astro` renders public nav for anon, admin nav for authenticated admin (3 icons + tooltip + pending-count badge, 60s polling).
- Skeleton placeholder during the ~150ms session check — no content flicker.
- `<SuggestionReview>` page replaces the 7a placeholder: Promotar + Rechazar buttons; Rechazar uses an inline reason textarea + plain PostgREST update.

### Promote

- `<PromoteForm>` handles both entry points — from suggestion (prefilled, suggestion context column on the left, reviewer notes) or from scratch (`+ Añadir` icon in admin nav, empty form).
- Atomic save via `promote_suggestion()` RPC; redirects to `/admin/inbox` (suggestion mode) or `/` (scratch mode).
- Country dropdown loads from `public.countries` via a new `getCountriesBilingual()` helper (the Stage 6 `getCountries(lang)` stayed intact).

### Translation

- `supabase/functions/translate/index.ts` — admin-only DeepL proxy. `verify_jwt = true` plus a defence-in-depth `app_metadata.role === 'admin'` check inside the handler.
- `<TranslateButton>` per bilingual field pair (bio + book description) with confirm modal when the target field is non-empty.
- `.env.example` adds `DEEPL_API_KEY` (free tier, 500k chars/month).

### Gotchas surfaced

- `dev:functions` reads `--env-file .env` only at startup; restart needed after adding env vars.
- PowerShell + `curl.exe` mangles single-quoted JSON bodies → use `Invoke-RestMethod` or file-based `--data-binary "@body.json"`.
- Vite's `node_modules/.vite/deps/` cache can go stale across long dev sessions or after `dev:types` regen → fix with `Remove-Item -Recurse -Force node_modules\.vite` + restart `npm run dev`. Production unaffected (Vite produces static hashed bundles).
- Supabase TS generator emits `p_suggestion_id: string` (non-nullable) for the RPC even though Postgres accepts null — `promote.ts` uses a `as unknown as string` cast as workaround. Cleaner fix is `default null` in the migration; revisit if it becomes a pattern.

### Out of scope (lives in 7b-ii)

- Edit existing author (bio, dates, photo, status, published).
- Add more books to an existing author (post-promotion).
- Edit existing books and `book_links`.
- Delete actions (with confirmation modal).

---

## Last session — 2026-06-05 (Stage 7a)

**Branch in progress:** `feature/07a-notify-and-auth` (not yet merged).

### Notify path

- New migration `0003_notify_owner_trigger.sql` — AFTER INSERT trigger on `public.suggestions` fires `pg_net.http_post` to `notify_owner` asynchronously; failed POSTs do not block inserts.
- New Edge Function `supabase/functions/notify_owner/index.ts` — env-var-toggled: no `RESEND_API_KEY` → logs payload to console (dev); key present → POSTs to Resend using `RESEND_FROM_EMAIL` → `OWNER_NOTIFICATION_EMAIL`.
- `dev:functions` script now runs without an explicit function name, serving all functions registered in `config.toml`.

### Auth shell

- `/admin/login` — magic-link form using `signInWithOtp({ shouldCreateUser: false })`. Local emails land in Mailpit (`http://127.0.0.1:54324`).
- `<AdminGate>` React component — wraps protected admin content; redirects unauthenticated users to `/admin/login`.
- `<AdminLoginForm>` React component — handles OTP request + confirmation feedback.

### Inbox

- `/admin` — lists `pending` suggestions newest-first (authenticated, service-role query).
- `/admin/suggestions/[id]` — static placeholder; promote/reject actions deferred to Stage 7b.

### Config gotchas surfaced

- `auth.email.enable_signup = true` is required for OTP to work at all in GoTrue — even for existing users. `shouldCreateUser: false` blocks net-new signups client-side.
- `site_url` must use `localhost` (not `127.0.0.1`); GoTrue rejects magic-link redirects that don't match exactly.
- `additional_redirect_urls` needs explicit `/admin` paths listed alongside root paths.
- `enabled = true` is **not** a valid key for `[auth.email]` in Supabase CLI v2.102 — omit it entirely.

---

## Project facts worth remembering

- **Production domain:** `mapadeautoras.com` — acquired from Cloudflare Registrar on 2026-06-04. Same vendor as the planned hosting (Cloudflare Pages) and CAPTCHA (Turnstile) — collapses DNS, Resend domain auth (Stage 8), and OG canonical URLs (Stage 10) into one account.
- **Staging URL:** `https://staging.mapadeautoras.com` — live since 2026-06-18; auto-deploys from every push to `development` via Cloudflare Pages.
- **Supabase region:** `eu-west-1` (Ireland) for both staging (`mapa-staging`) and future production (`mapa-prod`).
- **Turnstile widget:** one shared widget (`mapa-de-autoras`) covering localhost, 127.0.0.1, staging.mapadeautoras.com, mapadeautoras.com, and www.mapadeautoras.com. Both local `.env` and Cloudflare Pages Production scope use the real keys (no more always-passing test keys).
- **Map UX baseline:** dusty-blue ocean + three-color state hierarchy — penguin (read), sage (currently_reading), oxblood (discovery). The original two-color hierarchy was owner-approved 2026-05-30; the sage third state was added in Stage 7b-i (2026-06-10) and **needs owner review before merging 9a → development → master**.
- **Branching convention:** `master` ← `development` ← `feature/NN-slug` (or `NNa`, `NNb` sub-stages). Alejandro commits + pushes + merges manually — Claude never runs `git commit`/`push`/`merge`.
- **Bilingual content:** Resolved by [ADR 0004](adr/0004-translation-strategy.md). DeepL via admin-only Edge Function at `/functions/v1/translate`; owner reviews/edits both versions before save. Free-tier headroom ~12× MVP volume. Works on staging (`verify_jwt = false` + in-function admin check).

---

## Open items pending decision before Stage 7b-ii starts

1. **`book_links` shape** — the implementation plan flags this; recommendation (b) one link per book per locale. Decision needs to land before 7b-ii's "edit book links" UI.
2. **`SUPABASE_SERVICE_ROLE` env var rename** — currently in `.env.example` from Stage 3. Local Edge Function gets the right key (`SUPABASE_SERVICE_ROLE_KEY`) injected automatically. If 7b-ii needs server-side queries from Astro, rename to match the canonical name and update consumers.
3. **Icon library** — 7b-i used 3 inline SVGs (inbox / plus / logout). 7b-ii will add at least edit / delete / save icons. Consider adding `lucide-react` if inline SVGs become painful (~5+ icons).
4. **Owner review of the three-color map** — the sage `currently_reading` state evolves the owner-approved two-color baseline. Quick visual review with the project owner before merging 9a (which carries 7b-i) to `master`.

## Open items before Stage 9b starts

1. **Resend account + domain auth** — create Resend account, authenticate `mapadeautoras.com` (SPF/DKIM/DMARC). Allow ~24h DNS propagation buffer before relying on real email delivery.
2. **Pivot notify trigger to Supabase Database Webhooks** — no committed code change needed; configured via the Supabase dashboard per environment. Unblocks real `notify_owner` emails in production (hosted Supabase blocks the pg_net GUC approach).
3. **HTML email template for `notify_owner`** — deeplink to admin inbox, country flag, formatted submitter info. Small follow-up; can land in 9b or as a phase-2 polish item (see `docs/40-phase2-backlog.md`).

---

## How to resume tomorrow

**Next up: Stage 9a-iii — realtime admin inbox + pending-count badge.** Design brainstormed (spec not yet written). Locked decisions:

- **Scope:** inbox list (`<AdminInbox>`) + nav badge (`<AdminAwareNav>`).
- **Approach:** refetch-on-change (admin-only, low volume — not granular patching).
- **Migration 0010:** `alter publication supabase_realtime add table public.suggestions;`
- **Shared hook** `src/lib/use-suggestions-realtime.ts` (subscribe + `onChange` + reconnect resync); replaces the 60s poll in `<AdminAwareNav>`.
- **DE-RISK FIRST:** probe that an _admin-JWT_ subscriber receives `postgres_changes` on the RLS-gated `suggestions` table (the map used anon/public rows; this is admin-only). If not, call `supabase.realtime.setAuth(session.access_token)` before subscribing.
- **First move:** write `docs/specs/2026-07-02-stage-9a-iii-realtime-inbox-design.md`, then the plan.

```sh
git checkout development
git pull
git checkout -b feature/09a-iii-realtime-inbox

# Local stack — see supabase/README.md for full quickstart
npm run dev:db
npm run dev:db:reset      # applies 0001-0009 + seeds
npm run dev:functions
npm run dev
npm test                 # 28-test baseline (map-state + realtime-reducers)
# Re-bootstrap the admin user locally (reset wipes auth.users — see supabase/README.md)
```

**Loose ends (small, optional, any time):**

- Cloudflare Pages: disable preview deployments OR add Preview-scope env vars — stops the red preview check on every PR.
- `notify_owner` deep-link: `/admin/suggestions/:id` → `/admin/suggestion?id=` (the owner email's "Revisar" link 404s).
