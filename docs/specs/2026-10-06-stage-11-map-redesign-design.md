# Stage 11 — New home + full-screen map (design)

- **Date:** 2026-10-06
- **Status:** For review
- **Depends on:** Stage 8.6 (merged, PR #19) and the magic-link redirect fix (PR #20). Independent of Stage 12 (waitlist): this stage ships the waitlist card UI against a stub; Stage 12 connects it.
- **Branch:** `feature/11-map-redesign`
- **Design reference:** the clickable prototype Danny approved on 2026-10-06 — <https://claude.ai/artifact/JeK7bmc7p7cpzfGPx24Yin> (private; ask Alejandro for access). It uses the dev-seed sample data and is the visual source of truth for this stage.

## 1. Context & motivation

Danny reviewed staging on her phone and did not approve going to production. Measured at 375 × 812:

- The map is about **345 × 170 px**. Germany, Costa Rica and Japan are a few pixels wide, far smaller than a finger.
- It sits **below the fold**, after the hero, the intro and three rows of controls (filter, six continent buttons wrapping onto two lines, zoom).
- The public nav does not fit on a phone (the "ENGLISH" pill is cut off).

Her direction, which the prototype captures:

1. The landing page should not carry the map. It becomes an **introduction + waitlist** to build expectation before release (Danny has ~50k Instagram followers).
2. The map gets **its own full-viewport route** with **floating controls**, like Funda or Google Maps.
3. The **list view** (the part she values most right now) is **one tap away** through a Map | List switch.
4. Suggesting a book is available from the map.

## 2. Goals (in scope)

1. **New home** `/[lang]/` — a pure landing page: intro in Danny's voice, waitlist card (before release) or "Abrir el mapa" (after), a static picture of the map, about Danny, how it works. **Revised 2026-10-07 (owner):** no live mini-map, legend or suggest band — see §5.1.
2. **New map page** `/[lang]/map` — full-screen map, floating search + filter chips, zoom + "starting view" controls, Map | List switch, suggest button, country panel (bottom sheet on phones, side panel on desktop), book view inside the panel.
3. **List view** on the same page (`/[lang]/map?view=list`) sharing search and filters with the map. Replaces the `/books` table.
4. **Phone-first map behavior** — opens on the visitor's region (time zone), dots on small countries, pinch/drag without fighting page scroll.
5. **"Map closed" switch** — one build-time setting hides the map, list and book pages until release day.
6. **Phone nav fix** for the remaining pages.
7. **Filter fix** — a country lights up under a filter only if it really has a book with that status (today a "mixed" country lights up under every filter).

## 3. Out of scope

- Waitlist storage, confirmation email, unsubscribe → **Stage 12**.
- Reader accounts / magic-link sign-up → **Stage 13**.
- Opening the map and emailing the waitlist → **Stage 14**.
- Installable web app (PWA) + push, personal maps, store apps → backlog.
- Per-book SEO pages (`books.slug` + prerender) → launch checklist §7.
- Keyboard navigation of individual country shapes. Search and the list view are the keyboard and screen-reader path (same as today: shapes have `tabIndex={-1}`).
- The Realtime scaling decision (see §10) → Stage 9b.

## 4. Decisions

| #   | Decision             | Choice                                                                                                                                                                                                                       | Why                                                                                                                                                                                                                                                                                                        |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Map URL              | `/[lang]/map`; list view at `/[lang]/map?view=list`                                                                                                                                                                          | Matches the existing English slugs (`/es/books`, `/es/suggest`). One page keeps search and filters shared; the query param makes the list shareable.                                                                                                                                                       |
| 2   | Old `/[lang]/books`  | Redirect to `/[lang]/map?view=list`                                                                                                                                                                                          | One list, not two. The admin book-status editor keeps using `BookFilters` + `book-list.ts`.                                                                                                                                                                                                                |
| 3   | Book detail          | Compact book view **inside the panel** on `/map`, plus the existing full page `/[lang]/book?id=` (linked from the panel) for sharing                                                                                         | Readers stay on the map; shared links keep working.                                                                                                                                                                                                                                                        |
| 4   | Map renderer         | **`d3-geo` + `d3-zoom` directly**; drop `@vnedyalk0v/react19-simple-maps`                                                                                                                                                    | The prototype needs animated fly-to, counter-scaled dots, viewport fitting and pan limits. The wrapper hides `d3-zoom`, so we would fight it; it already depends on `d3-geo`/`d3-zoom`, so the bundle barely changes.                                                                                      |
| 5   | First view           | Phones (portrait): the visitor's region, guessed from the browser time zone (`Europe/Amsterdam` → Europe). Desktop: the whole world. Unknown time zone: Atlantic view (Americas + Europe + Africa).                          | No permission prompt, nothing leaves the device. Region-level is enough to frame the map. A one-time hint ("Te muestro Europa. Pellizca el mapa para ver más.") explains it. **Updated 2026-10-07 (owner):** the re-center button returns to this starting view; there is no whole-world button on phones. |
| 6   | Small countries      | A **dot** in the country's color when its on-screen area is under ~900 px² (about fingertip size) **and** it has a color under the current filter. 40 px tap area.                                                           | Makes Portugal, Korea or most of Europe at world zoom tappable. Disappears when zoomed in or filtered out, so dot and color always match.                                                                                                                                                                  |
| 7   | Filter semantics     | Exact: under "Por leer"/"Leyendo"/"Leídas" a country lights up only if it has ≥1 book with that status. "Todas" keeps the current priority (read > reading > to_read).                                                       | Fixes the "mixed" collapse in `computeCountryStates` + `fillFor`, which loses which statuses a country has.                                                                                                                                                                                                |
| 8   | Country names        | Localized names from the `countries` table (`getCountries(lang)` at build time, passed to the island)                                                                                                                        | The current panel shows the English `world-atlas` name on the Spanish site.                                                                                                                                                                                                                                |
| 9   | Map-closed switch    | Build-time env var **`PUBLIC_MAP_OPEN`** (`"true"` / `"false"`), required by the existing env guard. Staging `true`; production `false` until Stage 14 flips it.                                                             | No date logic; if release moves, nothing changes. Flipping it is a Pages env change + redeploy (~2 min).                                                                                                                                                                                                   |
| 10  | What "closed" hides  | `/map`, the list, `/books` and `/book` render an "Abre pronto" page with the waitlist card. Nav and home CTAs to the map are hidden; the home preview stays as a non-clickable teaser. Suggest, About and Privacy stay open. | Builds expectation while still collecting suggestions. Not secrecy: published rows stay readable through the public API (anon RLS). **Revised 2026-10-07 (owner): stricter — see §5.5, rewritten before Task 7.**                                                                                          |
| 11  | Suggest from the map | A sheet wrapping the existing `SuggestionForm`; Turnstile script loaded when the sheet first opens; success shows an inline thank-you instead of navigating to `/thanks`                                                     | Reuses the anti-bot check, validation and Edge Function.                                                                                                                                                                                                                                                   |
| 12  | Waitlist card        | Built here with a typed `joinWaitlist()` client stub that resolves `not_available`; Stage 12 replaces the stub (**2026-10-07:** plus the optional news checkbox, §5.1.1)                                                     | Stages 11 and 12 can proceed in parallel. Staging is not public, so the stub is harmless there.                                                                                                                                                                                                            |
| 13  | Antarctica           | Removed from the map geometry                                                                                                                                                                                                | No authors; gains vertical space on phones.                                                                                                                                                                                                                                                                |

## 5. Pages and layout

The prototype is the visual reference. This section records structure and behavior.

### 5.1 Home `/[lang]/`

**Revised 2026-10-07 (owner):** the home is a pure landing page — informational, promotes Danny, one action per phase. The map lives on `/map`; the home no longer carries a live map, legend or suggest band.

In order:

1. **Nav** (see §5.4).
2. **Hero** — eyebrow, H1 "Mujeres que escriben el mundo.", lead paragraph in Danny's first person. Next to it on desktop, below on phones: **before release** the **waitlist card** (§5.1.1); **after release** an "Abrir el mapa" button instead.
3. **Map picture** — a static, non-interactive picture of the map rendered at build time (no JavaScript): world outline with each country colored from the catalog as it was at build time, inside a rounded card (the prototype's preview look), with a caption of the counts ("16 países · 29 autoras · 36 libros"). Links to `/map` only after release.
4. **About Danny** — photo (placeholder until Danny sends one), a short text in her voice, "Más de 50.000 lectoras me siguen en Instagram" and a link to her profile (shown only when the profile URL is set), link to the About page.
5. **How it works** — three short steps.
6. **Closing band** — before release: "¿Quieres enterarte el primer día?" + a button that jumps to the waitlist card (one form per page); after release: "Abrir el mapa".
7. **Footer** — Conóceme · Privacidad · Instagram (when set).

All copy is new i18n keys under `home.*` in ES and EN. Danny's voice pass happens in Stage 10. "Before / after release" is the `PUBLIC_MAP_OPEN` switch (decision 9).

#### 5.1.1 Waitlist card

"Abre pronto" pulse, title, one line, email field + "Avísame", an **optional, unticked** checkbox "Quiero recibir novedades de Danny", and fine print naming both purposes (launch email; news only with the box) with a link to the privacy page. States: idle / submitting / done / error. Built against the `joinWaitlist()` stub (decision 12); Stage 12 stores the entry, the news choice, the date and the consent text version.

### 5.2 Map page `/[lang]/map`

Full viewport (`100dvh`), no site nav, page never scrolls. Floating UI over the map:

- **Top bar** — round "m" button (home), search field, language button (EN/ES). Below it, the **filter chips** (Todas · Por leer · Leyendo · Leídas, with color dots), one horizontally scrollable row.
- **Search** — focus with an empty field shows region shortcuts (Mundo, Europa, Américas, África, Asia, Oceanía). Typing shows up to four countries (with or without writers), writers and books, accent-insensitive. Picking a country or writer flies to the country and opens its panel; picking a book opens the book view.
- **Controls** — zoom in/out (desktop only; phones pinch) and a re-center button that returns to the starting view (the visitor's region on phones, the whole world on desktop). Owner decision 2026-10-07: a whole-world view on a phone is a thin strip with no use.
- **Bottom** — Map | List switch centered; suggest button bottom-right (icon-only on phones). Both hide on phones while the panel is open.
- **Country panel** — bottom sheet on phones (about 56% height, handle expands it to full height), 400 px side panel on desktop. Shows the country name, writer and book counts, each writer with years and book rows (cover color block, title, year, status pill). Empty country: "Todavía no hay autoras de {país}" + "Sugerir una autora de {país}", which opens the suggest sheet with the country prefilled. Tapping water closes the panel; Esc closes the topmost layer.
- **Book view** (inside the panel) — back to the country, cover, title, writer, country · year, status, Danny's synopsis, quotes, buy links with the affiliate disclosure (real Stage 8.6 data via `getBookDetail`), and a link to the full book page.
- **Fly-to** — opening a country zooms it into the part of the screen the panel leaves free. `prefers-reduced-motion` jumps without animation.

### 5.3 List view `/[lang]/map?view=list`

Same top bar on a solid background. The search field filters the list live; chips filter by status. Books are grouped by country (localized, alphabetical) with a count and a "Ver en el mapa" link that switches to the map and opens that country. A summary line reads "36 libros de 29 autoras en 16 países". Tapping a row opens the book view in the panel. No results: a suggest button.

### 5.4 Nav on the other pages

Simplified so it fits at 360 px: logo, "Mapa" (only when open), "Conóceme", "Sugerir", a short "EN"/"ES" pill. The admin nav is unchanged.

### 5.5 Closed mode (`PUBLIC_MAP_OPEN=false`)

> **Revised 2026-10-07 (owner), details before Task 7:** new visitors get only home, About, Privacy and the club page (Stage 12b); map, list, book pages and suggest show "Abre pronto"; a signed-in admin can open every route. The bullets below are the original version.

- `/[lang]/map`, `/[lang]/book` and the `/books` redirect target render an "Abre pronto" page: short text + the waitlist card + link home.
- Home: no "Explorar el mapa" button; the preview is a teaser image without a link.
- Nav: no "Mapa" link.
- Sitemap: excludes `/map` and `/book`.

## 6. Architecture

### 6.1 Components

| Unit                                                       | Purpose                                                                                                                                                                                                                                                            | Depends on                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `src/pages/[lang]/map.astro` → `MapPage.astro`             | Route + static skeleton (water background, top-bar placeholder); loads countries at build time; mounts `MapApp` with `client:only="react"`; renders the closed page when the switch is off                                                                         | `getCountries`, i18n                                                 |
| `MapApp.tsx`                                               | Owns UI state (filter, view, selected country, book, query); composes everything below; syncs `?view=`                                                                                                                                                             | `useCatalog`, pure libs                                              |
| `useCatalog()` hook                                        | Initial `getCatalog()` + Realtime subscription + reconnect resync, moved out of `MapSection.tsx` unchanged; `{ realtime: false }` option for the home preview                                                                                                      | `authors.ts`, `realtime-reducers.ts`                                 |
| `WorldMap.tsx`                                             | d3 renderer. Props: country colors, selected country, `onSelectCountry`. Imperative handle: `flyToCountry`, `flyToRegion`, `showStart` (returns to the starting view), `zoomBy`. Applies the zoom transform through a ref (no React render per frame). Draws dots. | `d3-geo`, `d3-zoom`, `world-atlas`                                   |
| `MapTopBar.tsx` + `SearchResults.tsx`                      | Search field, chips, language button, results dropdown                                                                                                                                                                                                             | `map-search.ts`                                                      |
| `MapControls.tsx`, `ViewSwitch.tsx`                        | Zoom + re-center buttons; Map / List switch                                                                                                                                                                                                                        | —                                                                    |
| `CountrySheet.tsx` (replaces `CountryPanel.tsx`)           | Bottom sheet / side panel shell + country content + book view                                                                                                                                                                                                      | `getBookDetail`                                                      |
| `MapList.tsx`                                              | List view                                                                                                                                                                                                                                                          | `map-search.ts`                                                      |
| `SuggestSheet.tsx`                                         | Sheet around `SuggestionForm`; lazy-loads Turnstile                                                                                                                                                                                                                | `SuggestionForm` (+ `initialCountry`, `onSuccess` props)             |
| `MapPicture.astro` (replaces `MapPreview.tsx`, 2026-10-07) | Home map picture + counts, rendered at build time, no JavaScript                                                                                                                                                                                                   | `fetchCatalog`, `countryStatuses`/`countryColor`, `world-atlas` 110m |
| `WaitlistCard.tsx` + `src/lib/waitlist.ts`                 | Waitlist UI (idle / submitting / done / error) + `joinWaitlist()` stub                                                                                                                                                                                             | —                                                                    |

### 6.2 Pure logic (Vitest)

- `src/lib/map-region.ts` — `regionFromTimeZone(tz)` → `"europe" | "americas" | "africa" | "asia" | "oceania" | null`, and the region bounding boxes.
- `src/lib/map-state.ts` — replace the "mixed" collapse with per-country status sets: `countryStatuses(catalog)` and `countryColor(statuses, filter)`. Update the existing tests.
- `src/lib/map-search.ts` — accent-insensitive `fold()`, `searchCatalog(query, catalog, countries)` → `{ countries, authors, books }`, and `groupBooksByCountry(...)` for the list.
- `src/lib/map-markers.ts` — `showDot(areaPx, zoom, hasColor)`.

### 6.3 Removed

`AuthorsMap.tsx`, `ContinentNav.tsx`, `MapFilter.tsx`, `CountryPanel.tsx`, `MapSection.tsx`, the public `BookList.tsx`, and the `@vnedyalk0v/react19-simple-maps` dependency. `BookFilters.tsx` and `book-list.ts` stay for the admin.

### 6.4 Data flow

No backend change. `MapApp` reads the published catalog with the anon client (RLS-gated), patches it from Realtime exactly as today (ADR 0005), and fetches book detail on demand. Country names come from the build-time countries list.

### 6.5 Config

- `PUBLIC_MAP_OPEN` added to the `astro.config.mjs` env guard, `.env.example` and Cloudflare Pages (Production scope on the staging project: `true`).
- Redirect `/[lang]/books` → `/[lang]/map?view=list`.
- Dependencies: add `d3-geo`, `d3-zoom`, `d3-selection`, `d3-transition` (+ `@types/*`); remove `@vnedyalk0v/react19-simple-maps`.

## 7. States and errors

| Situation                  | Behavior                                                                |
| -------------------------- | ----------------------------------------------------------------------- |
| Catalog loading            | Map draws uncolored with a small "Cargando…" pill                       |
| Catalog failed             | Map stays usable; pill "No he podido cargar las autoras" + "Reintentar" |
| Book detail failed (panel) | Short message + link to the full book page                              |
| Search without results     | "No encuentro «…»" + "Sugerir esa autora"                               |
| Time zone unknown          | Atlantic view, no hint                                                  |
| Realtime disconnect        | Existing resync on reconnect                                            |
| Reduced motion             | Fly-to and sheet animations disabled                                    |

## 8. Accessibility

- Every control is a labeled button; visible focus ring; Esc closes the topmost layer; the panel is a dialog with a label.
- Touch targets ≥ 44 px; dot tap area 40 px.
- Inputs at 16 px so iOS Safari does not zoom on focus.
- Search and the list view give keyboard and screen-reader users the full content; shapes stay out of the tab order.

## 9. Verification

1. `npm test` — new pure-logic tests + updated `map-state` tests pass.
2. `astro check` 0 errors; `npm run build` passes with `PUBLIC_MAP_OPEN=true` and with `false`.
3. Browser at 375 × 812 and 360 × 740: the map fills the screen; dragging/pinching never scrolls the page; Portugal and South Korea are tappable through their dots; the panel opens, expands and closes; Map ↔ List keeps filter and search; the book view shows real synopsis/quotes/links; the suggest sheet submits through Turnstile and shows the inline thank-you; both locales.
4. Time zone: `Europe/Amsterdam` opens on Europe with the hint; the re-center button returns to Europe after panning away.
5. Desktop 1280 wide: side panel, zoom buttons, whole-world first view.
6. Closed mode build: map/list/book show "Abre pronto"; nav and home have no map links; suggest still works.
7. Real devices before merge: iOS Safari + Android Chrome (Danny's phone included).

## 10. Risks and open points

- **Realtime ceiling.** Every `/map` visitor opens one Realtime connection; the free plan allows 200 at once. The map still works without Realtime (it loads the catalog first). Decide in Stage 9b: paid plan before the announcement, or public Realtime off.
- **Size.** Larger than the ~300-line guideline. Delivered as separate commits on one branch (§11); split into 11a/11b if review gets heavy.
- **`client:only` first paint.** The island renders nothing on the server; the Astro skeleton covers the gap.
- **Wrong region guess** (VPN, travelers) is harmless: pinch out or search another country.
- **Copy** is a first draft; Danny's voice pass is Stage 10.
- **Closed mode is not secrecy** (decision 10).

## 11. Sequencing (one commit each)

1. Pure logic + tests: region, search, dots, exact filter.
2. `WorldMap` (d3) + `useCatalog` hook; swap the dependency.
3. `/map` page: top bar, chips, controls, switch, country sheet + empty country, first view by time zone + hint.
4. List view + search results + `/books` redirect.
5. Book view in the panel + suggest sheet (`SuggestionForm` props).
6. Home as a landing page: hero, `WaitlistCard` (stub, news checkbox), build-time map picture + counts, about Danny, how it works; phone nav fix; remove the old map (revised 2026-10-07).
7. `PUBLIC_MAP_OPEN` switch + closed states + sitemap; remove old components; docs (STATUS, plan, RAG).
