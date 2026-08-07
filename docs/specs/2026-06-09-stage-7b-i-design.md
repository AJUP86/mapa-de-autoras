# Stage 7b-i — Promote suggestion + atomic author/book write + map state expansion

**Date:** 2026-06-09
**Branch:** `feature/07b-promote-and-crud`
**Status:** Design approved, ready to implement.

> Companion to [docs/01-implementation-plan.md § Stage 7](../01-implementation-plan.md) and [docs/specs/2026-06-05-stage-7a-design.md](2026-06-05-stage-7a-design.md). Stage 7 was split into 7a (notify + auth + read-only inbox, shipped) and 7b (promote + CRUD). This document covers **7b-i — close the suggestion loop**. The remaining work (CRUD on existing authors/books) becomes 7b-ii.

---

## Scope

**In (7b-i):**

- Promote a pending suggestion to a real author with at least one book, **atomically** (one Postgres transaction).
- Admin can also add an author from scratch via the same form, no suggestion required.
- Reject a pending suggestion with an optional reason note.
- Map gains a third state: `currently_reading` (sage color).
- Filter UI gains a fourth button: `Todas / Sugerencias / Leyendo / Leídas`.
- i18n label rename only: `"Descubrimientos"` → `"Sugerencias"`. DB enum stays `discovery`.
- Translation infrastructure: DeepL via admin-only Edge Function, per-field "Traducir" button in the form.
- Unified admin UX: the public homepage `/` shows admin-flavored nav when authenticated (icon nav with tooltips + pending-count badge).
- Route restructure: `/admin` = login form, `/admin/inbox` = pending list, `/admin/promote` = promote form.

**Out (7b-ii):**

- Edit existing author (bio, dates, photo, status changes).
- Add more books to an existing author (post-promotion).
- Edit existing books and book_links.
- Delete actions.

**Out (Phase 2):** see [docs/40-phase2-backlog.md](../40-phase2-backlog.md).

---

## Decisions

| #   | Decision                            | Choice                                                                                                                   | Rationale                                                                        |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 1   | Atomic multi-table write            | Postgres RPC `promote_suggestion()` with `SECURITY DEFINER` + `is_admin()` gate                                          | All-or-nothing in one transaction; no client-side multi-step risk                |
| 2   | Slug visibility                     | Hidden completely; server-generated as `slugify(name) + "-" + iso_a3.lower()`; collisions auto-resolved with `-N` suffix | Slug is a developer concern, not a UX one — admin works with authors, not URLs   |
| 3   | Duplicate detection                 | By `(lower(name), country_iso_a3)`, not by slug                                                                          | Real semantic uniqueness for a person                                            |
| 4   | Promote form scope                  | Narrow: NEW author + ≥1 book required. Existing-author = friendly error pointing to 7b-ii edit page                      | Keeps 7b-i contained; "add book to existing author" lives in 7b-ii               |
| 5   | Default author status               | `discovery`                                                                                                              | Matches current DB default; admin flips after research                           |
| 6   | Map third state color               | Sage `#7a9b82`                                                                                                           | Cool color separates cleanly from warm penguin/oxblood; already in brand palette |
| 7   | Token layering                      | Semantic state aliases (`--c-state-read`, `--c-state-currently-reading`, `--c-state-discovery`) → base palette tokens    | One-line palette swaps at end of MVP                                             |
| 8   | Filter order (LTR)                  | `Todas / Sugerencias / Leyendo / Leídas`                                                                                 | Future → present → past of Danny's reading journey                               |
| 9   | Mixed-country fill priority         | `read > currently_reading > discovery` for default; active filter overrides                                              | Preserves "no blended middle" baseline from Stage 4b                             |
| 10  | i18n rename                         | UI labels only: ES "Sugerencias", EN "Suggestions". DB enum stays `discovery`                                            | Avoids migration churn for a display-only change                                 |
| 11  | Translation provider                | DeepL via Supabase Edge Function (`verify_jwt = true`)                                                                   | Free tier sufficient; review-before-save mitigates flat tone; swappable later    |
| 12  | Translate UX                        | Per-field-pair button; confirm modal when target field is non-empty                                                      | Optional — manual entry always works                                             |
| 13  | Suggestion duplicates from visitors | Allowed (different visitors → same author). Danny rejects extras manually for 7b-i                                       | Visitors have no session — blocking would be bad UX                              |
| 14  | Admin nav pattern                   | `<AdminAwareNav>` island on every page; inline SVG icons + tooltips + pending-count badge; skeleton during auth check    | Unified UX across `/` and `/admin/*`; skeleton hides the ~150ms session-check    |
| 15  | Route restructure                   | `/admin` = login (was `/admin/login`); `/admin/inbox` = list (was `/admin`); new `/admin/promote`                        | Cleaner URL for the admin entry point                                            |
| 16  | Session lifecycle                   | Default Supabase (1h JWT, ~30d refresh, auto-renew)                                                                      | Single-admin laptop; low risk for MVP                                            |
| 17  | After promote-from-suggestion       | Redirect to `/admin/inbox`                                                                                               | Continue reviewing                                                               |
| 18  | After promote-from-scratch          | Redirect to `/` (home with admin nav)                                                                                    | Came from there, return there                                                    |
| 19  | Icon library                        | Inline SVG                                                                                                               | No new dependency; 3 icons (inbox, plus, logout) are trivial                     |

---

## Architecture

### File additions / changes

```
supabase/
  migrations/
    0004_promote_prep.sql              # unaccent extension, slugify(), enum extension
    0005_promote_suggestion_rpc.sql    # promote_suggestion() RPC
  functions/
    translate/
      index.ts                         # DeepL proxy, verify_jwt = true
  README.md                            # update with translate function + RPC notes

src/
  components/
    AdminAwareNav.tsx                  # session-aware nav with badge + skeleton
    AdminNavIcon.tsx                   # icon + tooltip wrapper
    PromoteForm.tsx                    # the form (author + books + validation)
    BookFields.tsx                     # one book sub-form (used inside PromoteForm)
    TranslateButton.tsx                # per-field-pair translate
    SuggestionReview.tsx               # replaces SuggestionDetailPlaceholder
  lib/
    promote.ts                         # promoteSuggestion() RPC wrapper
    translate.ts                       # translateText() function wrapper
    countries.ts                       # country dropdown data source
    map-state.ts                       # extended types + fillFor() updates
  pages/
    admin/
      index.astro                      # was login.astro — magic-link form
      inbox.astro                      # was index.astro — pending list
      suggestion.astro                 # review one suggestion (real, not placeholder)
      promote.astro                    # form, ?suggestion=<id> optional
  layouts/
    Base.astro                         # mount AdminAwareNav
  styles/
    tokens.css                         # state aliases + sage tokens
  i18n/
    es.json                            # rename + new admin namespaces + map labels
    en.json                            # same

docs/
  adr/
    0004-translation-strategy.md       # ADR (written in Slice A)
  specs/
    2026-06-09-stage-7b-i-design.md    # this file
  40-phase2-backlog.md                 # phase 2 deferred items
  STATUS.md                            # updated end-of-stage
  RAG.md                               # updated
```

### Data flow — promote (from suggestion)

```
Admin clicks "Promotar" on a suggestion
  └─► /admin/promote?suggestion=<uuid>
        └─► PromoteForm fetches the suggestion (PostgREST + admin JWT, RLS-gated)
              └─► Form prefilled with name + country
                    └─► Admin reviews, fills bio + ≥1 book, optionally translates
                          └─► supabase.rpc('promote_suggestion', { p_suggestion_id, p_author, p_books })
                                └─► Postgres function (SECURITY DEFINER):
                                      ├─ assert is_admin()
                                      ├─ validate p_author, p_books
                                      ├─ check (lower(name), country_iso_a3) duplicate → friendly raise
                                      ├─ compute base_slug + resolve collisions
                                      ├─ insert author
                                      ├─ insert books in order
                                      └─ update suggestion: status='approved', reviewed_at, reviewer_notes
                                └─► returns new author_id
                          └─► redirect to /admin/inbox with success toast
```

### Data flow — promote (from scratch)

```
Admin clicks "+ Añadir" icon in admin nav
  └─► /admin/promote (no query param)
        └─► PromoteForm renders empty (no suggestion column)
              └─► Admin fills all fields manually
                    └─► supabase.rpc('promote_suggestion', { p_suggestion_id: null, ... })
                          └─► Same RPC; suggestion update is skipped (id is null)
                    └─► redirect to / with success toast
```

### Data flow — translate

```
Admin clicks "Traducir →" on bio_es field
  └─► If bio_en non-empty → confirm modal: "Esto reemplazará el texto en EN."
        └─► On confirm (or no target content):
              └─► POST /functions/v1/translate
                    headers: Authorization: Bearer <admin JWT>
                    body: { text: bio_es, target_lang: "EN" }
                    └─► Edge function:
                          ├─ verify_jwt = true → Supabase validates admin JWT
                          ├─ POST api-free.deepl.com/v2/translate with DEEPL_API_KEY
                          └─ return { text }
                    └─► fill bio_en field
```

### Data flow — reject

```
Admin clicks "Rechazar" on suggestion review page
  └─► Inline form: textarea for "Motivo (opcional)"
        └─► supabase.from('suggestions').update({ status: 'rejected', reviewed_at, reviewer_notes })
              └─► PostgREST + admin JWT → RLS "admins manage suggestions" → row updated
        └─► redirect to /admin/inbox with toast
```

### Data flow — admin-aware nav

```
Page loads on any route (/, /admin/*, /suggest, ...)
  └─► <AdminAwareNav client:load /> mounts
        └─► render <NavSkeleton /> immediately
        └─► supabase.auth.getSession()
              ├─ session + role='admin' → render admin nav (3 icons + badge)
              └─ otherwise → render public nav (logo + Sugerir link)
        └─► subscribe to onAuthStateChange for cross-tab signout

If admin:
  └─► query select count(*) from suggestions where status='pending' on mount
        └─► render badge if count > 0
        └─► re-poll every 60 seconds  (refine to Realtime in Phase 2 if needed)
```

---

## Component contracts

### `promote_suggestion()` RPC

Defined in `supabase/migrations/0005_promote_suggestion_rpc.sql`.

```
promote_suggestion(
  p_suggestion_id uuid,           -- nullable: null = promote-from-scratch
  p_author        jsonb,          -- author fields (NO slug; server generates)
  p_books         jsonb[]         -- min 1, max 50
) returns uuid                    -- new author id
```

Expected `p_author` shape:

```jsonc
{
  "name": "Gabriela Mistral",        // required
  "country_iso_a3": "CHL",            // required
  "status": "discovery",              // required: 'read' | 'currently_reading' | 'discovery'
  "bio_es": "...",                    // optional
  "bio_en": "...",                    // optional
  "photo_url": "...",                 // optional
  "birth_year": 1889,                 // optional, smallint
  "death_year": 1957,                 // optional
  "published": true,                  // optional, default true
  "reviewer_notes": "..."             // optional, used only when p_suggestion_id != null
}
```

Expected `p_books[i]` shape:

```jsonc
{
  "title": "Desolación",              // required per book
  "year": 1922,                       // optional
  "original_language": "ES",          // optional
  "cover_url": "...",                 // optional
  "description_es": "...",            // optional
  "description_en": "..."             // optional
}
```

**Behavior:**

1. Assert `is_admin()` else raise `unauthorized: admin only`.
2. Validate `p_author.name` non-empty, `p_author.country_iso_a3` valid, `array_length(p_books, 1) >= 1`.
3. Check duplicate via `(lower(name), country_iso_a3)` → `raise exception 'duplicate_author: ...'`.
4. Generate `base_slug = slugify(name) || '-' || lower(iso_a3)`; resolve collisions by appending `-N`.
5. Insert into `authors` with computed slug.
6. Insert each book into `books` preserving `display_order` from array index.
7. If `p_suggestion_id` is not null: update suggestion to `status='approved'`, set `reviewed_at = now()`, set `reviewer_notes`.
8. Return new author id.

**Errors the UI handles:**

- `unauthorized: admin only` → should never happen behind `<AdminGate>`; if it does, force re-login.
- `validation: <field>` → form highlights the offending field.
- `duplicate_author: <name> already exists in <country>` → form shows: _"Ya existe una autora con este nombre en este país. Edita su perfil para añadir más libros."_ (Link is for 7b-ii; harmless now.)
- Postgres-level errors propagate as-is; UI shows generic _"No se pudo guardar. Inténtalo de nuevo."_

**Atomicity:** the function body runs in an implicit transaction; any error rolls back all writes.

---

### `<PromoteForm>`

```ts
interface Props {
  suggestionId?: string;     // when present, prefill + show context column + capture reviewer notes
  labels: { /* i18n */ };
}
```

State machine: `idle → loading-suggestion (if suggestionId) → ready → submitting → success | error`.

Rendered fields:

- `name` (required, 1–200)
- `country_iso_a3` (required, dropdown)
- `status` (radio, default `discovery`)
- `birth_year`, `death_year` (optional, 1000–2100)
- `photo_url` (optional, URL)
- `bio_es`, `bio_en` (optional, with `<TranslateButton>` between)
- books array (min 1, max 50), each rendered as `<BookFields>`:
  - `title` (required, 1–500)
  - `year` (optional, 1000–2100)
  - `original_language` (optional)
  - `cover_url` (optional)
  - `description_es`, `description_en` (optional, with `<TranslateButton>`)
- `published` checkbox (default checked)
- `reviewer_notes` (only when `suggestionId` present, max 2000)

Submit handler: builds the RPC payload, calls `promoteSuggestion(...)`, on success redirects per scope (inbox or `/`), on error keeps state + shows the failure.

---

### `<TranslateButton>`

```ts
interface Props {
  sourceText: string;
  hasTargetContent: boolean;
  targetLang: "EN" | "ES";
  direction: "ltr" | "rtl";   // for arrow rendering
  onTranslated: (text: string) => void;
  labels: { /* i18n */ };
}
```

Behavior:

- Disabled when `sourceText` is empty (after trim).
- Click → if `hasTargetContent`, open a small confirm modal first.
- On confirm (or empty target): POST `/functions/v1/translate` with `{ text, target_lang }`; on response, call `onTranslated(text)`.
- Spinner during request (~1–2 sec); error toast on failure.

---

### `<AdminAwareNav>`

```ts
interface Props {
  labels: {
    publicNav: { mapa: string; sugerir: string };
    adminNav: { sugerencias: string; anadir: string; salir: string };
  };
}
```

States rendered:

- `loading` → `<NavSkeleton />` (placeholder shapes matching nav size, no content swap)
- `anon` → public nav: logo + "Sugerir" link
- `admin` → admin nav: logo + three icon buttons (inbox / plus / logout) with tooltips
- Admin nav also renders a badge next to the inbox icon if `pending_count > 0`

Polling: pending count is queried on mount and every 60 seconds. Realtime upgrade is Phase 2.

---

### `translate` Edge Function

```
POST /functions/v1/translate
Authorization: Bearer <JWT>            # required (verify_jwt = true)
Content-Type: application/json

Request body:
  { "text": "...", "target_lang": "EN" | "ES" }

Response (success): 200
  { "text": "..." }

Response (errors):
  400  { "error": "invalid_input" }
  401  (handled by Supabase before reaching the function)
  502  { "error": "translation_failed" | "translation_rate_limited" }
```

Env vars (new): `DEEPL_API_KEY`. Empty in dev = button works only when key is set; missing key returns 502 with `translation_failed`.

Internals: thin proxy that POSTs `{ text, target_lang }` to `https://api-free.deepl.com/v2/translate` with the `DeepL-Auth-Key` header.

---

## Map state model

### Token layer (added to `src/styles/tokens.css`)

```css
:root {
  /* Base palette */
  --c-penguin:   #e87722;
  --c-sage:      #7a9b82;
  --c-sage-line: #4d6651;    /* NEW: darker sage for strokes */
  --c-oxblood:   #7a1f2e;

  /* Map state aliases — change ONLY these to repaint without touching map code */
  --c-state-read:              var(--c-penguin);
  --c-state-currently-reading: var(--c-sage);
  --c-state-discovery:         var(--c-oxblood);

  --c-state-read-line:              var(--c-penguin-line);
  --c-state-currently-reading-line: var(--c-sage-line);
  --c-state-discovery-line:         var(--c-oxblood-line);
}
```

### Type extensions (in `src/lib/map-state.ts`)

```ts
export type AuthorStatus = "read" | "currently_reading" | "discovery";

export type CountryState =
  | "read"
  | "currently_reading"
  | "discovery"
  | "mixed"
  | "empty";

export type Filter = "all" | "read" | "currently_reading" | "discovery";
```

### Mixed-country fill priority

When `filter = "all"`:

1. Country has any `read` author → `--c-state-read`
2. Else if `currently_reading` → `--c-state-currently-reading`
3. Else if `discovery` → `--c-state-discovery`

When a specific filter is active:

- Country has author matching the filter → fill that state color
- Else → dimmed (existing empty treatment)

No blended fills — every country picks exactly one color.

### Filter UI

Order LTR: `Todas / Sugerencias / Leyendo / Leídas`.

Active button shows underline in its state color.

### i18n labels (relevant entries)

```jsonc
// es.json
"map.filter.all":               "Todas",
"map.filter.read":              "Leídas",
"map.filter.currently_reading": "Leyendo",
"map.filter.discovery":         "Sugerencias",         // renamed from "Descubrimientos"

"author.status.read":              "Leída",
"author.status.currently_reading": "Leyendo",
"author.status.discovery":         "Sugerencia"
```

EN mirrors with `"Read"`, `"Currently reading"`, `"Suggestions"`. DB enum value is `'discovery'` regardless of locale.

---

## Translation strategy

See [docs/adr/0004-translation-strategy.md](../adr/0004-translation-strategy.md) (written as part of Slice A).

Short version: DeepL via admin-only Edge Function; owner reviews/edits both versions before save. Manual entry always works as fallback. Provider is swappable by rewriting the Edge Function body (UI unchanged).

---

## Incremental delivery

Six slices on `feature/07b-promote-and-crud`. Each ends in a clean pause point for review + manual commit. All slices ship together in one PR at end of stage.

### Slice A — DB foundation (~250 LOC)

- `supabase/migrations/0004_promote_prep.sql`: `create extension unaccent`, `slugify(text)`, `alter type author_status add value 'currently_reading'`.
- `supabase/migrations/0005_promote_suggestion_rpc.sql`: full `promote_suggestion(...)` function + grant.
- `docs/adr/0004-translation-strategy.md`: ADR.
- Regenerate `src/types/supabase.ts`.

**Verify:**

1. `npm run dev:db:reset` — migrations apply cleanly.
2. In Studio SQL console, call:
   ```sql
   select promote_suggestion(
     null,
     '{"name":"Test Autora","country_iso_a3":"CHL","status":"discovery","published":true}'::jsonb,
     ARRAY['{"title":"Libro Test","year":2020}'::jsonb]
   );
   ```
3. Verify: 1 row in `authors` with slug `test-autora-chl`, 1 row in `books`.
4. Call again with same name+country → `duplicate_author` error.

**Pause for review.**

### Slice B — Map state model (~150 LOC)

- `src/styles/tokens.css`: state aliases + sage tokens.
- `src/lib/map-state.ts`: extend types, update `fillFor()`, update mixed logic.
- `src/components/MapFilter.tsx`: 4-button segmented control.
- `src/i18n/{es,en}.json`: rename + add `currently_reading` label.
- `src/components/CountryPanel.tsx`: render currently_reading tag with sage.
- `src/pages/styleguide.astro`: add sage swatch + 3-state sample.
- `supabase/seeds/dev-authors.sql`: add one currently_reading author for testing.

**Verify:**

1. Load `/` → at least one sage country visible.
2. Cycle 4 filter buttons → each highlights only its state.
3. Click a country with multiple statuses → CountryPanel shows correct tag color per author.
4. `/styleguide` shows all three state colors.

**Pause for project-owner review** (this changes the owner-approved baseline from two-color hierarchy to three).

### Slice C — Unified admin UX (~250 LOC)

- Route rename:
  - `src/pages/admin/login.astro` → `src/pages/admin/index.astro` (login form lives here now).
  - Current `src/pages/admin/index.astro` (inbox) → `src/pages/admin/inbox.astro`.
- `src/components/AdminAwareNav.tsx` + `src/components/AdminNavIcon.tsx`: nav with SVG icons, tooltips, badge, skeleton.
- Mount in `src/layouts/Base.astro` with `client:load`.
- Update `<AdminGate>` redirect target from `/admin/login` → `/admin`.
- Update `<AdminLoginForm>` redirect target from `/admin` → `/`.
- `src/components/SuggestionReview.tsx` (replaces `SuggestionDetailPlaceholder.tsx`): full review page with Promotar / Rechazar buttons; Rechazar opens inline reason form.
- `supabase/config.toml`: add `http://localhost:4321/admin`, `http://localhost:4321/admin/inbox`, etc. to `additional_redirect_urls`.
- i18n: add `admin.nav.*`, `admin.review.*`.

**Verify:**

1. Anon at `/` → public nav, "Sugerir" → `/suggest`.
2. Type `/admin` → login form.
3. Click magic-link → land on `/` with admin nav (3 icons + tooltip on hover + badge).
4. Click inbox icon → `/admin/inbox` (the list).
5. Click suggestion → review page → "Rechazar" → enter reason → suggestion `status='rejected'`, redirect to inbox.
6. Sign out → back to `/admin`.
7. Skeleton briefly visible on every page load while session checks; no content swap.

**Pause for review.**

### Slice D — Translate Edge Function (~80 LOC)

- `supabase/functions/translate/index.ts` — DeepL proxy.
- `supabase/config.toml`: register `[functions.translate]` with `verify_jwt = true`.
- `.env.example`: add `DEEPL_API_KEY=` with comment.
- `supabase/README.md`: short section on the translate function.

**Verify (no UI yet — just the bare service):**

1. `npm run dev:functions` serves the new function.
2. Grab an admin JWT from a logged-in browser (`localStorage["sb-...-auth-token"]`).
3. `curl -X POST http://localhost:54321/functions/v1/translate -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" -d '{"text":"Hola mundo","target_lang":"EN"}'`.
4. Expect: `{ "text": "Hello world" }` (or close).
5. Without JWT → 401. With invalid `target_lang` → 400.

**Pause for review.**

### Slice E1 — Promote-from-scratch (~250 LOC)

- `src/pages/admin/promote.astro` (no query param → empty form).
- `src/components/PromoteForm.tsx` (empty-form mode for this slice).
- `src/components/BookFields.tsx`.
- `src/components/TranslateButton.tsx`.
- `src/lib/promote.ts`.
- `src/lib/translate.ts`.
- `src/lib/countries.ts`.
- Wire "+ Añadir" icon in admin nav.
- i18n: `admin.promote.*` strings, validation messages.

**Verify:**

1. Click "+ Añadir" icon → empty form at `/admin/promote`.
2. Fill name + country + status + at least 1 book title → click Save.
3. Author + book(s) appear in DB; redirect to `/`; new country tinted with the chosen state color.
4. Try same name + country again → friendly duplicate error; form keeps state.
5. Click Translate on bio_es with bio_en empty → bio_en filled.
6. Click Translate with bio_en non-empty → confirm modal appears.

**Pause for review.**

### Slice E2 — Promote-from-suggestion + reviewer notes (~250 LOC)

- Add `?suggestion=<uuid>` handling to `PromoteForm` (loads suggestion via PostgREST, prefills name + country).
- Render suggestion context column (read-only) on the left when present.
- Add `reviewer_notes` textarea below the form.
- Submit passes `p_suggestion_id` to the RPC; RPC marks suggestion `approved`.
- Wire "Promotar" button on suggestion review page → `/admin/promote?suggestion=<id>`.

**Verify:**

1. Submit a public suggestion as anon visitor.
2. Log in as admin → inbox badge shows count.
3. Click inbox icon → "Revisar" → "Promotar".
4. Form prefilled with name + country; suggestion context column visible.
5. Fill bio + book + save → redirect to `/admin/inbox`; suggestion no longer pending; badge decrements.
6. Visit `/` → new author on the map.

**Pause for final review.** End of Stage 7b-i.

---

## Verification (end of stage)

1. **End-to-end promote-from-suggestion:** anon submit → email/log → admin login → inbox badge → review → promote → author with book(s) on map → suggestion `approved`.
2. **Promote-from-scratch:** "+ Añadir" → fill form → save → author on map → inbox unchanged.
3. **Translate:** with `DEEPL_API_KEY` set, click translate → target field filled in ~1 second; with key unset, button errors gracefully.
4. **Reject:** pending suggestion → review → reject with notes → `status='rejected'`, `reviewer_notes` saved, badge decrements.
5. **Map states:** seed authors with each of 3 states → cycle 4 filter buttons → correct highlight per state; mixed countries pick priority color.
6. **Duplicate guard:** try to promote same `(name, country)` twice → friendly error; admin can adjust and retry.
7. **Unified UX:** anon at `/` sees public nav; admin at `/` sees admin nav + badge; skeleton, not content swap, during auth check.
8. **Type-check + build:** `npm run build` passes.

---

## Open items deferred to Stage 7b-ii

- Edit existing author (bio, dates, photo, status, published).
- Add books to existing author (page or modal).
- Edit existing books and book_links.
- Delete actions (with confirmation modal).
- Consider adding Lucide React if SVG inlining becomes painful past ~5 icons.

## Open items deferred to Stage 8

- Real DeepL API key from a free/paid DeepL account.
- Resend production setup for `notify_owner` + double-opt-in newsletter.

## Open items deferred to Stage 9

- SSR via Cloudflare adapter to eliminate `<AdminAwareNav>` skeleton entirely.
- Real `PUBLIC_SITE_URL` + production secrets.

## Open items deferred to Phase 2

See [docs/40-phase2-backlog.md](../40-phase2-backlog.md).
