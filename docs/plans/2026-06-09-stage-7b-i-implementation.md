# Stage 7b-i Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the suggestion review loop — admin can promote a pending suggestion (or add an author from scratch) to a real author with at least one book, atomically. Add `currently_reading` map state. Wire translation infrastructure (DeepL). Unify the admin UX so admin features appear inline on the public homepage.

**Architecture:** Single Postgres RPC `promote_suggestion()` for atomic multi-table write. Map state model extended with one enum value + one semantic-aliased CSS token + a fourth filter button. Admin-only Edge Function proxies to DeepL. `<AdminAwareNav>` React island mounted on every page renders public-or-admin nav based on session.

**Tech Stack:** Astro 5 (static output), React 19 islands, Tailwind 4, Supabase (Postgres 15 + GoTrue + PostgREST + Deno Edge Runtime), DeepL API.

**Spec:** [docs/specs/2026-06-09-stage-7b-i-design.md](../specs/2026-06-09-stage-7b-i-design.md) — read this first.

---

## Working conventions for this plan

1. **No test framework in this repo.** TDD-style "write the test first" doesn't apply. Each task adapts to: write the code → run `npm run build` for type-check → run the manual verification step from the spec → STOP for user review + commit.
2. **Alejandro commits manually.** Do NOT run `git commit`, `git push`, or `git merge`. End each slice with a STOP marker; the user reads the diff and commits when satisfied.
3. **Branch:** `feature/07b-promote-and-crud` is already checked out. All slices land here. One PR at end of stage.
4. **Naming alignment:** the existing `Filter` type uses `"discoveries"` (plural) and `AuthorStatus` uses `"discovery"` (singular). Preserve that. Add `"currently_reading"` to both. New i18n keys use the same convention: `map.filter.currently_reading`, `map.status.currently_reading`.
5. **i18n: ES is the source of truth.** EN is filled with empty strings for new keys (matches the existing `admin.*` namespace pattern from 7a). User fills EN manually or via translation later.
6. **Each slice ends with STOP — Slice X complete.** That is the user-commit pause point. Do not move to the next slice until the user confirms.

---

# Slice A — DB foundation

**Goal:** Migrations + RPC + ADR + regenerated TS types. No UI changes.

## Task A1 — Migration `0004_promote_prep.sql`

**Files:**

- Create: `supabase/migrations/0004_promote_prep.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Stage 7b-i — Promote-suggestion prep.
--
-- 1. unaccent extension — needed by slugify() to fold accents in author
--    names ("Gabriela Mistral" → "gabriela-mistral", "María José" →
--    "maria-jose"). Standard Supabase extension; no auth changes.
-- 2. public.slugify(text) helper — pure function. Lowercase, strip accents,
--    replace non-alphanumeric runs with single dashes, trim leading/trailing
--    dashes. Used by promote_suggestion() to generate author slugs.
-- 3. author_status enum gains 'currently_reading'. The existing values
--    'read' and 'discovery' are unchanged. Postgres requires adding enum
--    values outside a transaction, hence ALTER TYPE ... ADD VALUE here
--    (no BEGIN/COMMIT around it).

create extension if not exists unaccent with schema extensions;

create or replace function public.slugify(input text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(extensions.unaccent(input)), '[^a-z0-9]+', '-', 'g'),
      '-+', '-', 'g'
    )
  );
$$;

comment on function public.slugify(text) is
  'URL-safe slug from arbitrary text. Lowercases, folds accents via unaccent, collapses non-alphanumerics to single dashes, trims edge dashes.';

alter type public.author_status add value if not exists 'currently_reading';
```

- [ ] **Step 2: Apply the migration**

Run: `npm run dev:db:reset`

Expected: migrations apply cleanly, no errors. The reset reapplies all migrations + the dev-authors seed.

- [ ] **Step 3: Verify in Studio SQL editor (`http://127.0.0.1:54323`)**

Run:

```sql
select public.slugify('Gabriela Mistral');                 -- 'gabriela-mistral'
select public.slugify('María José Ñandutí — Test!');       -- 'maria-jose-nanduti-test'
select unnest(enum_range(null::public.author_status));     -- read, discovery, currently_reading
```

Expected: three outputs as commented.

- [ ] **Step 4: STOP — verify, do not commit yet (Task A4 commits the whole slice)**

---

## Task A2 — Migration `0005_promote_suggestion_rpc.sql`

**Files:**

- Create: `supabase/migrations/0005_promote_suggestion_rpc.sql`

- [ ] **Step 1: Write the RPC**

```sql
-- Stage 7b-i — promote_suggestion() RPC.
--
-- Atomic write of one author + ≥1 books, optionally resolving a pending
-- suggestion. Postgres wraps the function body in an implicit transaction;
-- any raise rolls back all inserts/updates.
--
-- SECURITY DEFINER lets the function bypass RLS for the multi-table writes,
-- but the first thing it does is assert is_admin() — so only admins can
-- effectively call it.
--
-- Slug strategy: base_slug = slugify(name) || '-' || lower(iso_a3). If a
-- row with that slug exists, append '-2', '-3', ... until unique. The
-- caller never sees or supplies the slug — it's pure server bookkeeping.
--
-- Duplicate guard: (lower(name), country_iso_a3) is the semantic uniqueness
-- check. The slug uniqueness handled by the WHILE-loop is a defence-in-depth
-- for case differences and accents that map to the same slug.

create or replace function public.promote_suggestion(
  p_suggestion_id uuid,
  p_author        jsonb,
  p_books         jsonb[]
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_author_id uuid;
  base_slug     text;
  final_slug    text;
  collision_n   int := 1;
  book_json     jsonb;
  book_order    int := 0;
  name_in       text;
  iso_in        text;
begin
  -- Authn / authz gate
  if not public.is_admin() then
    raise exception 'unauthorized: admin only';
  end if;

  -- Server-side validation (UI also validates; this is defence in depth)
  name_in := nullif(trim(p_author->>'name'), '');
  iso_in  := nullif(trim(p_author->>'country_iso_a3'), '');

  if name_in is null then
    raise exception 'validation: name required';
  end if;
  if iso_in is null or length(iso_in) <> 3 then
    raise exception 'validation: country_iso_a3 invalid';
  end if;
  if (p_author->>'status') is null
     or (p_author->>'status') not in ('read', 'currently_reading', 'discovery') then
    raise exception 'validation: status invalid';
  end if;
  if p_books is null or array_length(p_books, 1) is null or array_length(p_books, 1) < 1 then
    raise exception 'validation: at least one book required';
  end if;

  -- Semantic duplicate check
  if exists (
    select 1 from public.authors
    where lower(name) = lower(name_in)
      and country_iso_a3 = iso_in
  ) then
    raise exception 'duplicate_author: % already exists in %', name_in, iso_in;
  end if;

  -- Slug with collision resolution
  base_slug := public.slugify(name_in) || '-' || lower(iso_in);
  final_slug := base_slug;
  while exists (select 1 from public.authors where slug = final_slug) loop
    collision_n := collision_n + 1;
    final_slug := base_slug || '-' || collision_n::text;
  end loop;

  -- Insert author
  insert into public.authors (
    name, slug, country_iso_a3, status, bio_es, bio_en, photo_url,
    birth_year, death_year, published
  )
  values (
    name_in,
    final_slug,
    iso_in,
    (p_author->>'status')::public.author_status,
    nullif(p_author->>'bio_es', ''),
    nullif(p_author->>'bio_en', ''),
    nullif(p_author->>'photo_url', ''),
    nullif(p_author->>'birth_year', '')::smallint,
    nullif(p_author->>'death_year', '')::smallint,
    coalesce((p_author->>'published')::boolean, true)
  )
  returning id into new_author_id;

  -- Insert books in order
  foreach book_json in array p_books loop
    if coalesce(trim(book_json->>'title'), '') = '' then
      raise exception 'validation: book title required (index %)', book_order;
    end if;
    insert into public.books (
      author_id, title, year, original_language, cover_url,
      description_es, description_en, display_order
    )
    values (
      new_author_id,
      book_json->>'title',
      nullif(book_json->>'year', '')::smallint,
      nullif(book_json->>'original_language', ''),
      nullif(book_json->>'cover_url', ''),
      nullif(book_json->>'description_es', ''),
      nullif(book_json->>'description_en', ''),
      book_order
    );
    book_order := book_order + 1;
  end loop;

  -- Resolve suggestion if linked
  if p_suggestion_id is not null then
    update public.suggestions
    set status         = 'approved',
        reviewed_at    = now(),
        reviewer_notes = nullif(p_author->>'reviewer_notes', '')
    where id = p_suggestion_id;
  end if;

  return new_author_id;
end;
$$;

grant execute on function public.promote_suggestion(uuid, jsonb, jsonb[]) to authenticated;

comment on function public.promote_suggestion(uuid, jsonb, jsonb[]) is
  'Stage 7b-i — atomic author + books write with optional suggestion resolution. SECURITY DEFINER; gated on is_admin(). Returns the new author id.';
```

- [ ] **Step 2: Apply the migration**

Run: `npm run dev:db:reset`

Expected: both 0004 and 0005 apply without errors.

- [ ] **Step 3: Verify the RPC in Studio SQL editor**

First, ensure your admin user exists and has `app_metadata.role = 'admin'` (see `supabase/README.md` for the bootstrap snippet — this gets wiped on every reset).

Then run as the admin role (in Studio's SQL editor, set the role via the dropdown above the editor — Authenticated, then paste an admin JWT, OR use the impersonate helper if available; alternative: call from a logged-in browser via `supabase.rpc(...)` in devtools console):

```sql
select public.promote_suggestion(
  null,
  '{"name":"Test Autora","country_iso_a3":"CHL","status":"discovery","published":true}'::jsonb,
  ARRAY['{"title":"Libro Test","year":2020}'::jsonb]
);
```

Expected: returns a UUID. Verify the inserts:

```sql
select id, name, slug, status from public.authors where slug = 'test-autora-chl';
select title, year, display_order from public.books where author_id = (select id from public.authors where slug = 'test-autora-chl');
```

Expected: one author with slug `test-autora-chl`, one book `Libro Test`, year 2020, display_order 0.

- [ ] **Step 4: Verify duplicate guard**

Call the RPC again with the same name + country:

```sql
select public.promote_suggestion(
  null,
  '{"name":"Test Autora","country_iso_a3":"CHL","status":"discovery"}'::jsonb,
  ARRAY['{"title":"Otro Libro"}'::jsonb]
);
```

Expected: error `duplicate_author: Test Autora already exists in CHL`. No new rows in `authors` or `books`.

- [ ] **Step 5: Verify slug collision handling**

```sql
-- Different name that slugifies the same way (with accent folding)
select public.promote_suggestion(
  null,
  '{"name":"Tést Autora","country_iso_a3":"CHL","status":"discovery"}'::jsonb,
  ARRAY['{"title":"Another"}'::jsonb]
);
```

Wait — this triggers the duplicate guard first (same lowercased name). Skip; the collision suffix is exercised when a real duplicate slug appears (e.g., two different names that slugify identically). It's there as defence in depth — no need to force a manual test.

- [ ] **Step 6: Clean up test data before continuing**

```sql
delete from public.authors where slug = 'test-autora-chl';
```

Expected: cascade deletes the book row too (books has `on delete cascade`).

---

## Task A3 — ADR 0004 — Translation strategy

**Files:**

- Create: `docs/adr/0004-translation-strategy.md`

- [ ] **Step 1: Write the ADR**

```markdown
# ADR 0004 — Translation strategy

Status: Accepted (2026-06-09)

## Context

The site is bilingual: Spanish (default at `/`) + English (at `/en/`). Per `adr/0003-data-model.md`, every author has `bio_es` and `bio_en`; every book has `description_es` and `description_en`. A single owner (Hayde) writes content. Writing both versions by hand is 2× the effort and would block launch.

## Decision

LLM-assisted translation in the admin promote/edit form, with owner review before save.

- The promote form (Stage 7b-i) renders bilingual fields as ES/EN pairs with a "Traducir" button between them.
- The button POSTs the source text + target language to a new Supabase Edge Function `/functions/v1/translate`.
- The Edge Function is `verify_jwt = true` (admin-only via the JWT carried by `supabase-js`).
- The function proxies to DeepL's free tier (`api-free.deepl.com/v2/translate`) using `DEEPL_API_KEY`.
- The translated text fills the target field; the owner reviews and edits before clicking Save.
- DB stores both versions; the site renders the right one per locale at build time.

## Alternatives considered

- **Manual bilingual writing** — rejected: 2× effort, launch-blocking.
- **LLM provider (Claude Haiku / GPT-4o-mini)** — rejected for MVP: better tone but requires another account, paid by default, and DeepL is "good enough" given the review-before-save step. Easy to swap later (the Edge Function abstracts the provider).
- **Auto-translate at read time** — rejected: bad UX (jank on page load), cost scales with traffic, lock-in.
- **Skip EN until post-MVP** — rejected: bilingualism is an MVP promise.

## Consequences

- **Quality:** DeepL is fluent but somewhat flat in tone. Owner editing is the mitigation. Acceptable trade-off for MVP volume.
- **Cost:** DeepL free tier = 500,000 characters/month. MVP estimate (~200 chars/bio × 2 directions × ~100 authors) = 40k chars/month. ~12× headroom.
- **Provider lock-in:** Low. The Edge Function is ~20 lines of proxy code. Swap by replacing the inner `fetch()` body. UI unchanged.
- **Operational risk:** DeepL outage means the Traducir button errors. Manual entry of EN/ES is always available — never a blocker.
- **Privacy:** Bio content is public-by-design; sending it to DeepL is acceptable. No PII in the translated text.

## Future work (phase 2)

- Formality toggle (DeepL supports `formality=more|less`).
- Provider swap to an LLM if tone becomes a complaint.
- Translation memory: hash source + target_lang as cache key, store translations in a `translations` table to avoid re-paying for identical text.

See [docs/40-phase2-backlog.md](../40-phase2-backlog.md) for the full deferred list.
```

- [ ] **Step 2: Update [docs/RAG.md](../RAG.md) to index the ADR**

Edit `docs/RAG.md`. Add this row right below the `adr/0003-data-model.md` row:

```markdown
| `adr/0004-translation-strategy.md` | Decision record for the LLM-assisted translation flow in the admin form: DeepL via admin-only Edge Function, owner reviews/edits before save. Alternatives considered (LLM providers, auto-translate, manual). | Use when changing translation provider, adding a new bilingual field, or extending the Edge Function (e.g., formality toggle, translation memory). |
```

---

## Task A4 — Regenerate Supabase TS types

**Files:**

- Modify: `src/types/supabase.ts` (regenerated)

- [ ] **Step 1: Regenerate the types**

Run: `npm run dev:types`

This dumps the updated schema (including the new `currently_reading` enum value AND the `promote_suggestion` RPC signature) into `src/types/supabase.ts`.

- [ ] **Step 2: Run type-check**

Run: `npm run build`

Expected: build passes. The map code currently destructures `"read" | "discovery"` — the new enum value is `"currently_reading"`, but no existing code references it yet, so this still compiles.

- [ ] **Step 3: Spot-check the diff**

In `src/types/supabase.ts`, confirm the changes:

```ts
// Around the Enums section:
author_status: "read" | "discovery" | "currently_reading"

// And the Functions section now includes:
promote_suggestion: {
  Args: { p_suggestion_id: string; p_author: Json; p_books: Json[] }
  Returns: string
}
```

- [ ] **Step 4: STOP — Slice A complete**

User actions:

1. Review the diff: `git status` + `git diff supabase/migrations/0004_promote_prep.sql supabase/migrations/0005_promote_suggestion_rpc.sql docs/adr/0004-translation-strategy.md docs/RAG.md src/types/supabase.ts`
2. Stage and commit. Suggested message: `feat(stage-7b-i,db): unaccent + slugify(), currently_reading enum, promote_suggestion() RPC, ADR 0004`

Resume at Slice B after commit confirms.

---

# Slice B — Map state model

**Goal:** Add `currently_reading` color + state + filter button. Rename "Descubrimientos" → "Sugerencias" in i18n only. Add semantic state aliases for one-line palette swaps later.

## Task B1 — Extend tokens.css

**Files:**

- Modify: `src/styles/tokens.css`

- [ ] **Step 1: Add sage stroke token + semantic state aliases**

Replace the entire `:root { ... }` block in [src/styles/tokens.css](../../src/styles/tokens.css) with:

```css
:root {
  --c-ink: #1b2a41;
  --c-parchment: #f5efe6;
  --c-bone: #faf6ee;
  --c-oxblood: #7a1f2e;
  --c-oxblood-2: #9c3a47;
  --c-oxblood-3: #c97f87;
  --c-ochre: #c68b3c;
  --c-penguin: #e87722;
  --c-sage: #7a9b82;
  --c-shadow: rgba(27, 42, 65, 0.1);

  /* Map palette — Stage 4b
   * The world map encodes read/discovery/currently_reading on a dusty-blue
   * ocean using three brand colors. Countries with multiple states pick a
   * single side based on the priority hierarchy (read > currently_reading >
   * discovery), or based on the active filter. Each fill is paired with a
   * darker stroke of itself so adjacent same-state countries keep a visible
   * boundary against the ocean. */
  --c-water: #b5cfd2;
  --c-penguin-line: #9c4e10;
  --c-oxblood-line: #4a0d18;
  --c-sage-line: #4d6651; /* Stage 7b-i — darker sage for currently_reading strokes */
  --c-paper-line: #7a5a3a; /* sepia for empty-country borders */

  /* Map state aliases — Stage 7b-i.
   * Change the right-hand side here to repaint the map without touching
   * any TS/component code. The state-driven fills in src/lib/map-state.ts
   * reference these aliases, never the base palette directly. */
  --c-state-read: var(--c-penguin);
  --c-state-read-line: var(--c-penguin-line);
  --c-state-currently-reading: var(--c-sage);
  --c-state-currently-reading-line: var(--c-sage-line);
  --c-state-discovery: var(--c-oxblood);
  --c-state-discovery-line: var(--c-oxblood-line);

  --font-display: "Fraunces Variable", Georgia, serif;
  --font-body: "Inter Variable", system-ui, sans-serif;
}
```

- [ ] **Step 2: Type-check (sanity)**

Run: `npm run build`

Expected: build passes (CSS tokens don't affect TS type-check, but this confirms nothing else regressed).

---

## Task B2 — Extend map-state.ts

**Files:**

- Modify: `src/lib/map-state.ts`

- [ ] **Step 1: Replace the entire file contents**

Replace [src/lib/map-state.ts](../../src/lib/map-state.ts) with:

```ts
// Domain types + pure helpers for the map.
// Kept apart from the React components so they're easy to unit-test later.
// The shapes match what `src/lib/authors.ts::getCatalog()` returns at build
// time — same structure as the Stage-4 mock, just sourced from Postgres.

export type AuthorStatus = "read" | "currently_reading" | "discovery";

export type Filter = "all" | "read" | "currently_reading" | "discoveries";

export type CountryState = "read" | "currently_reading" | "discovery" | "mixed" | "empty";

export interface Book {
  title: string;
  year?: number;
}

export interface Author {
  id: string;
  name: string;
  status: AuthorStatus;
  birth_year?: number;
  death_year?: number;
  books: Book[];
}

export interface CountryEntry {
  iso_a3: string;
  authors: Author[];
}

export interface MapLabels {
  filter: {
    all: string;
    read: string;
    currently_reading: string;
    discoveries: string;
  };
  panel: { close: string; empty: string; suggest: string; booksLabel: string };
  status: { read: string; currently_reading: string; discovery: string };
}

/**
 * Reduce a list of country entries into a state-per-country map.
 * O(n) over authors; safe to memoize at the caller.
 *
 * Mixed = country has 2+ distinct statuses among its authors. The exact
 * fill color for mixed is decided in fillFor() based on the active filter.
 */
export function computeCountryStates(
  entries: ReadonlyArray<CountryEntry>,
): Record<string, CountryState> {
  const result: Record<string, CountryState> = {};
  for (const entry of entries) {
    let hasRead = false;
    let hasCurrent = false;
    let hasDiscovery = false;
    for (const author of entry.authors) {
      if (author.status === "read") hasRead = true;
      else if (author.status === "currently_reading") hasCurrent = true;
      else hasDiscovery = true;
      if (hasRead && hasCurrent && hasDiscovery) break;
    }
    const distinct = (hasRead ? 1 : 0) + (hasCurrent ? 1 : 0) + (hasDiscovery ? 1 : 0);
    if (distinct === 0) continue;
    if (distinct >= 2) result[entry.iso_a3] = "mixed";
    else if (hasRead) result[entry.iso_a3] = "read";
    else if (hasCurrent) result[entry.iso_a3] = "currently_reading";
    else result[entry.iso_a3] = "discovery";
  }
  return result;
}

export interface CountryStyle {
  fill: string;
  stroke: string;
}

// Three-color hierarchy — Stage 7b-i (evolves the Stage 4b two-color baseline).
// Fills reference the semantic state aliases in tokens.css, never the base
// palette tokens directly.
const READ_STYLE: CountryStyle = {
  fill: "var(--c-state-read)",
  stroke: "var(--c-state-read-line)",
};
const CURRENT_STYLE: CountryStyle = {
  fill: "var(--c-state-currently-reading)",
  stroke: "var(--c-state-currently-reading-line)",
};
const DISCOVERY_STYLE: CountryStyle = {
  fill: "var(--c-state-discovery)",
  stroke: "var(--c-state-discovery-line)",
};
const EMPTY_STYLE: CountryStyle = {
  fill: "var(--c-parchment)",
  stroke: "var(--c-paper-line)",
};

/**
 * Resolve a country's {fill, stroke} from its state and the active filter.
 *
 *   filter             | mixed country shows as
 *   ───────────────────┼───────────────────────────────────────────────
 *   all                | priority: read > currently_reading > discovery
 *   read               | penguin (it has a read author) — else empty
 *   currently_reading  | sage    (it has a current author) — else empty
 *   discoveries        | oxblood (it has a discovery author) — else empty
 *
 * No blended fills — every country picks one color.
 */
export function fillFor(state: CountryState, filter: Filter): CountryStyle {
  if (state === "empty") return EMPTY_STYLE;

  if (filter === "read") {
    return state === "read" || state === "mixed" ? READ_STYLE : EMPTY_STYLE;
  }
  if (filter === "currently_reading") {
    return state === "currently_reading" || state === "mixed" ? CURRENT_STYLE : EMPTY_STYLE;
  }
  if (filter === "discoveries") {
    return state === "discovery" || state === "mixed" ? DISCOVERY_STYLE : EMPTY_STYLE;
  }

  // filter === "all" — priority for mixed and the per-state shortcuts
  if (state === "read" || state === "mixed") {
    // Mixed: pick by priority. computeCountryStates collapses 2+ statuses
    // to "mixed" without telling us which; we re-derive from the entry at
    // the call site, OR we accept the simple rule: any country labelled
    // "mixed" surfaces as read (the highest-priority signal).
    return READ_STYLE;
  }
  if (state === "currently_reading") return CURRENT_STYLE;
  return DISCOVERY_STYLE; // state === "discovery"
}
```

- [ ] **Step 2: Run type-check**

Run: `npm run build`

Expected: build passes. Several call sites of `MapLabels` and `Filter` will now need to provide the new keys/values; the type-check fails will name them. Fix in the following tasks.

If the build errors out on `MapLabels` missing keys → go to Task B3 to update the i18n + MapFilter consumers; the cascading TS errors resolve as their props become aware of the new keys.

---

## Task B3 — Update MapFilter component

**Files:**

- Modify: `src/components/MapFilter.tsx`

- [ ] **Step 1: Replace OPTIONS array with the four-button order**

Replace the contents of [src/components/MapFilter.tsx](../../src/components/MapFilter.tsx) with:

```tsx
import type { Filter, MapLabels } from "~/lib/map-state";

interface Props {
  value: Filter;
  onChange: (next: Filter) => void;
  labels: MapLabels["filter"];
}

// Visitor → present → past of Danny's reading journey.
const OPTIONS: Filter[] = ["all", "discoveries", "currently_reading", "read"];

export default function MapFilter({ value, onChange, labels }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Map filter"
      className="inline-flex items-center rounded-full border border-ink/15 bg-bone p-1 text-sm font-body shadow-[0_1px_0_var(--c-shadow)]"
    >
      {OPTIONS.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option)}
            className={
              "rounded-full px-4 py-1.5 transition-colors " +
              (active ? "bg-oxblood text-parchment shadow-sm" : "text-ink/70 hover:text-ink")
            }
          >
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}
```

The TS error from B2 (`MapLabels["filter"]` missing `currently_reading`) will persist until B4 fills the i18n.

---

## Task B4 — Update i18n catalogs

**Files:**

- Modify: `src/i18n/es.json`
- Modify: `src/i18n/en.json`

- [ ] **Step 1: Update `map.filter` and `map.status` in ES**

In [src/i18n/es.json](../../src/i18n/es.json), replace the `"map"` block's `"filter"` and `"status"` sub-objects:

```json
    "filter": {
      "all": "Todas",
      "read": "Leídas",
      "currently_reading": "Leyendo",
      "discoveries": "Sugerencias"
    },
```

```json
    "status": {
      "read": "Leída",
      "currently_reading": "Leyendo",
      "discovery": "Sugerencia"
    },
```

Also update the `map.subhead` string (referenced from the homepage) to reflect three states. Replace:

```json
    "subhead": "Cada tinte marca un estado distinto: autoras leídas, por descubrir, o una mezcla.",
```

with:

```json
    "subhead": "Cada tinte marca un estado distinto: autoras leídas, las que está leyendo, sugerencias por descubrir, o una mezcla.",
```

- [ ] **Step 2: Update the same keys in EN**

In [src/i18n/en.json](../../src/i18n/en.json):

```json
    "filter": {
      "all": "All",
      "read": "Read",
      "currently_reading": "Currently reading",
      "discoveries": "Suggestions"
    },
```

```json
    "status": {
      "read": "Read",
      "currently_reading": "Currently reading",
      "discovery": "Suggestion"
    },
```

And update `subhead`:

```json
    "subhead": "Each tint marks a different state: authors I've read, currently reading, suggestions to discover, or a mix.",
```

- [ ] **Step 3: Run type-check**

Run: `npm run build`

Expected: passes. The previously-failing TS error about missing `currently_reading` key resolves now that the type and the i18n agree.

---

## Task B5 — Update CountryPanel to render the third status

**Files:**

- Modify: `src/components/CountryPanel.tsx`

- [ ] **Step 1: Replace the StatusBadge component**

In [src/components/CountryPanel.tsx](../../src/components/CountryPanel.tsx), find the `StatusBadge` function at the bottom and replace it with:

```tsx
function StatusBadge({
  status,
  labels,
}: {
  status: Author["status"];
  labels: MapLabels["status"];
}) {
  // Mirrors the map encoding: read = penguin, currently_reading = sage,
  // discovery = oxblood. Keeps the panel visually in sync with the country
  // fill the user just clicked.
  const palette =
    status === "read"
      ? "bg-penguin/15 text-penguin"
      : status === "currently_reading"
        ? "bg-sage/15 text-sage"
        : "bg-oxblood/10 text-oxblood";
  const label =
    status === "read"
      ? labels.read
      : status === "currently_reading"
        ? labels.currently_reading
        : labels.discovery;
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium font-body shrink-0 " +
        palette
      }
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Run type-check**

Run: `npm run build`

Expected: passes.

---

## Task B6 — Add a `currently_reading` dev-seed author

**Files:**

- Modify: `supabase/seeds/dev-authors.sql`

- [ ] **Step 1: Add a new author block before the final `commit;`**

Open [supabase/seeds/dev-authors.sql](../../supabase/seeds/dev-authors.sql), find the last author block (`ITA — discovery only`), and add this new block right after it, before `commit;`:

```sql
-- PRT — currently_reading (Stage 7b-i smoke test for the new state)
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Lídia Jorge', 'dev-lidia-jorge', 'PRT', 1946, 'currently_reading', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'Misericordia', 2022, 0 from a;

-- USA already mixed (read + discovery). Add a currently_reading author to
-- make it three-state mixed for the priority-rule smoke test.
with a as (
  insert into public.authors (name, slug, country_iso_a3, birth_year, status, published)
  values ('Tara Westover', 'dev-tara-westover', 'USA', 1986, 'currently_reading', true)
  returning id
)
insert into public.books (author_id, title, year, display_order)
select a.id, 'Educated', 2018, 0 from a;
```

- [ ] **Step 2: Reset the DB so the seed runs**

Run: `npm run dev:db:reset`

- [ ] **Step 3: Re-bootstrap admin (reset wipes auth.users)**

Follow `supabase/README.md`'s admin bootstrap snippet — log into Studio at http://127.0.0.1:54323, add a user, set `raw_app_meta_data` to include `"role":"admin"`.

- [ ] **Step 4: Run the dev server**

Run: `npm run dev`

- [ ] **Step 5: Visit the homepage at http://localhost:4321**

Expected:

- Portugal (PRT) is filled in sage (the new `currently_reading` color).
- USA shows mixed-with-read priority: still penguin (read wins over currently_reading + discovery).
- The filter row has 4 buttons: `Todas / Sugerencias / Leyendo / Leídas`.
- Click "Leyendo" → only PRT and USA highlight (USA has a currently_reading author); other countries fade to parchment.
- Click "Leídas" → all originally-read countries highlight; PRT fades out.
- Click "Sugerencias" → discovery-only and mixed countries highlight.
- Click a sage country → CountryPanel opens, the `Lídia Jorge` row shows a sage-tinted "Leyendo" badge.

---

## Task B7 — Update styleguide

**Files:**

- Modify: `src/pages/styleguide.astro`

- [ ] **Step 1: Add a sage swatch + three-state explanation**

Open [src/pages/styleguide.astro](../../src/pages/styleguide.astro). Find the map-palette section (around line 50, after the `<p>` describing the two-color hierarchy). Update the paragraph text to describe three colors. Search for the line containing:

```html
<p class="text-ink/70 max-w-prose font-body">
  Two fill colors total. Countries with both read and discovery authors pick a side based on the
  active filter — read wins by default; the <em>Discoveries</em> filter is the exception that
  surfaces the discovery side. Each fill has a paired darker stroke so adjacent same-state countries
  keep a visible boundary. The map sits on a dusty-blue water backdrop.
</p>
```

Replace it with:

```html
<p class="text-ink/70 max-w-prose font-body">
  Three fill colors total. Countries with multiple states pick one side based on the priority
  hierarchy (read &gt; currently_reading &gt; discovery) or the active filter. Each fill has a
  paired darker stroke so adjacent same-state countries keep a visible boundary. The map sits on a
  dusty-blue water backdrop.
</p>
```

Then find the swatch grid (the row that renders the existing `--c-penguin` and `--c-oxblood` swatches). Add a sage swatch between them or at the end of the row. The existing swatch pattern looks like:

```html
<div class="rounded p-4 text-white" style="background: var(--c-penguin)">
  <code>--c-penguin</code><br />
  <small>read</small>
</div>
```

Add immediately after the penguin swatch:

```html
<div class="rounded p-4 text-white" style="background: var(--c-sage)">
  <code>--c-sage</code><br />
  <small>currently_reading</small>
</div>
```

(If the styleguide layout is different from this exact snippet, follow the existing pattern of the file — the goal is one new visible swatch labelled "currently_reading" with the sage fill.)

- [ ] **Step 2: Type-check + visual verify**

Run: `npm run build`. Visit `/styleguide` in the dev server. Expected: three map-state swatches visible (penguin, sage, oxblood) with labels.

---

## Task B8 — STOP — Slice B complete

- [ ] **Pause for project-owner review** — this is the slice that changes the owner-approved baseline (two-color hierarchy → three colors). Show the project owner the homepage with the new sage state + the styleguide before committing.

- [ ] User actions:
  1. Review the diff (`git diff` over `src/styles/tokens.css`, `src/lib/map-state.ts`, `src/components/MapFilter.tsx`, `src/components/CountryPanel.tsx`, `src/i18n/es.json`, `src/i18n/en.json`, `supabase/seeds/dev-authors.sql`, `src/pages/styleguide.astro`).
  2. Stage and commit. Suggested message: `feat(stage-7b-i,map): currently_reading state — sage color, 4-button filter, label rename, semantic state aliases`

Resume at Slice C after commit.

---

# Slice C — Unified admin UX

**Goal:** Route restructure (`/admin` = login, `/admin/inbox` = list, `/admin/promote` = empty form). New `<AdminAwareNav>` island mounted on every page. Real `<SuggestionReview>` page with Promotar + Rechazar buttons.

## Task C1 — Rename admin routes

**Files:**

- Delete: `src/pages/admin/login.astro` (content moves to `index.astro`)
- Modify/Create: `src/pages/admin/index.astro` (becomes the login form)
- Create: `src/pages/admin/inbox.astro` (the inbox, was `index.astro`)

- [ ] **Step 1: Save the current `admin/index.astro` content to use in `inbox.astro`**

Read the current [src/pages/admin/index.astro](../../src/pages/admin/index.astro). The content (with `<AdminInbox>` and inbox labels) is what we want at `/admin/inbox`.

- [ ] **Step 2: Create `src/pages/admin/inbox.astro` with the old admin/index.astro content**

Create the file with:

```astro
---
// src/pages/admin/inbox.astro — Stage 7b-i (was admin/index.astro in 7a)
import Base from "~/layouts/Base.astro";
import AdminGate from "~/components/AdminGate";
import AdminInbox from "~/components/AdminInbox";
import { t } from "~/i18n/t";

const lang = "es" as const;
const notAdminLabel = t(lang, "admin.login.error_not_admin");
const inboxLabels = {
  title: t(lang, "admin.inbox.title"),
  empty: t(lang, "admin.inbox.empty"),
  loading: t(lang, "admin.inbox.loading"),
  error: t(lang, "admin.inbox.error"),
  col_date: t(lang, "admin.inbox.col_date"),
  col_author: t(lang, "admin.inbox.col_author"),
  col_country: t(lang, "admin.inbox.col_country"),
  col_email: t(lang, "admin.inbox.col_email"),
  view: t(lang, "admin.inbox.view"),
};
---

<Base lang={lang} title={inboxLabels.title}>
  <main class="min-h-screen bg-parchment p-6">
    <AdminGate client:load loginUrl="/admin" notAdminLabel={notAdminLabel}>
      <AdminInbox client:load labels={inboxLabels} />
    </AdminGate>
  </main>
</Base>
```

Note `loginUrl="/admin"` (was `/admin/login`).

- [ ] **Step 3: Overwrite `src/pages/admin/index.astro` to be the login form**

Replace [src/pages/admin/index.astro](../../src/pages/admin/index.astro) entirely with the old `admin/login.astro` content, updated to redirect to `/`:

```astro
---
// src/pages/admin/index.astro — Stage 7b-i (login form; was admin/login.astro in 7a)
import Base from "~/layouts/Base.astro";
import AdminLoginForm from "~/components/AdminLoginForm";
import { t } from "~/i18n/t";

const lang = "es" as const;
const labels = {
  title: t(lang, "admin.login.title"),
  subtitle: t(lang, "admin.login.subtitle"),
  email_label: t(lang, "admin.login.email_label"),
  submit: t(lang, "admin.login.submit"),
  submitting: t(lang, "admin.login.submitting"),
  success: t(lang, "admin.login.success"),
  error_generic: t(lang, "admin.login.error_generic"),
};
---

<Base lang={lang} title={labels.title}>
  <main class="min-h-screen bg-parchment">
    <AdminLoginForm client:load redirectTo="/" labels={labels} />
  </main>
</Base>
```

Note `redirectTo="/"` (was `/admin`).

- [ ] **Step 4: Delete the old `admin/login.astro` file**

In PowerShell: `Remove-Item src\pages\admin\login.astro`

- [ ] **Step 5: Type-check**

Run: `npm run build`. Expected: passes.

---

## Task C2 — Update Supabase auth redirect URLs

**Files:**

- Modify: `supabase/config.toml`

- [ ] **Step 1: Add new redirect URLs**

Open [supabase/config.toml](../../supabase/config.toml). Find the `additional_redirect_urls` array under `[auth]`. Replace it with:

```toml
additional_redirect_urls = [
  "http://127.0.0.1:4321",
  "http://127.0.0.1:4321/",
  "http://127.0.0.1:4321/admin",
  "http://127.0.0.1:4321/admin/inbox",
  "http://localhost:4321",
  "http://localhost:4321/",
  "http://localhost:4321/admin",
  "http://localhost:4321/admin/inbox",
]
```

- [ ] **Step 2: Restart Supabase**

Run: `npm run dev:db:stop && npm run dev:db && npm run dev:db:reset`

(or restart just the auth container if available — the redirect URLs are read at startup).

After reset, re-bootstrap the admin user per `supabase/README.md`.

---

## Task C3 — Create `<AdminAwareNav>` component

**Files:**

- Create: `src/components/AdminAwareNav.tsx`
- Create: `src/components/AdminNavIcon.tsx`

- [ ] **Step 1: Create `AdminNavIcon.tsx` — a reusable icon button with tooltip**

```tsx
// AdminNavIcon.tsx — Stage 7b-i
//
// Icon-only button with a hover/focus tooltip. Used by AdminAwareNav for
// the inbox / + / logout actions. Inline SVG children keep us free of
// external icon dependencies.

import type { ReactNode } from "react";

interface Props {
  label: string;
  href?: string;
  onClick?: () => void;
  badge?: number;
  children: ReactNode;
}

export default function AdminNavIcon({ label, href, onClick, badge, children }: Props) {
  const inner = (
    <>
      <span className="sr-only">{label}</span>
      <span aria-hidden className="block h-5 w-5 text-ink">
        {children}
      </span>
      {badge && badge > 0 ? (
        <span
          aria-hidden
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-oxblood px-1 text-[10px] font-medium text-parchment leading-[18px] text-center"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      <span
        role="tooltip"
        className="
          pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2
          whitespace-nowrap rounded bg-ink px-2 py-1 text-xs text-parchment
          opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100
        "
      >
        {label}
        {badge && badge > 0 ? ` (${badge})` : ""}
      </span>
    </>
  );

  const className =
    "group relative inline-flex items-center justify-center w-10 h-10 rounded-full hover:bg-ink/5 focus:outline-none focus:ring-2 focus:ring-oxblood/40";

  if (href) {
    return (
      <a href={href} className={className} aria-label={label}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} aria-label={label}>
      {inner}
    </button>
  );
}
```

- [ ] **Step 2: Create `AdminAwareNav.tsx`**

```tsx
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
  sugerir: string;
  sugerencias: string;
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
      <a href="/" className="font-display text-lg font-semibold text-ink no-underline">
        {labels.mapa}
      </a>
      {state.kind === "admin" ? (
        <div className="flex items-center gap-1">
          <AdminNavIcon label={labels.sugerencias} href="/admin/inbox" badge={pendingCount}>
            <InboxIcon />
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
        <a href="/suggest" className="text-sm text-ink/80 underline hover:text-oxblood">
          {labels.sugerir}
        </a>
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
```

---

## Task C4 — Mount `<AdminAwareNav>` in Base.astro

**Files:**

- Modify: `src/layouts/Base.astro`

- [ ] **Step 1: Wire the island + labels**

Replace [src/layouts/Base.astro](../../src/layouts/Base.astro) with:

```astro
---
import "../styles/global.css";
import AdminAwareNav from "~/components/AdminAwareNav";
import { t } from "~/i18n/t";

interface Props {
  title?: string;
  description?: string;
  lang?: "es" | "en";
}

const {
  title = "mapa de autoras",
  description = "Un mapa mundial de escritoras: autoras leídas y descubrimientos por descubrir.",
  lang = "es",
} = Astro.props;

const path = Astro.url.pathname;
const esPath = path.replace(/^\/en(\/|$)/, "/");
const enPath = esPath === "/" ? "/en/" : `/en${esPath}`;

const site = Astro.site ?? new URL("http://localhost:4321/");
const esUrl = new URL(esPath, site).href;
const enUrl = new URL(enPath, site).href;

const navLabels = {
  mapa: t(lang, "nav.home"),
  sugerir: t(lang, "nav.suggest"),
  sugerencias: t(lang, "admin.nav.sugerencias"),
  anadir: t(lang, "admin.nav.anadir"),
  salir: t(lang, "admin.nav.salir"),
};
---

<!doctype html>
<html lang={lang}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="generator" content={Astro.generator} />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="alternate" hreflang="es" href={esUrl} />
    <link rel="alternate" hreflang="en" href={enUrl} />
    <link rel="alternate" hreflang="x-default" href={esUrl} />
  </head>
  <body class="font-body bg-parchment text-ink">
    <AdminAwareNav client:load labels={navLabels} />
    <slot />
  </body>
</html>
```

- [ ] **Step 2: Add the missing i18n keys**

In [src/i18n/es.json](../../src/i18n/es.json), inside the `"admin"` object, add a new `"nav"` sub-object:

```json
    "nav": {
      "sugerencias": "Sugerencias pendientes",
      "anadir": "Añadir autora",
      "salir": "Cerrar sesión"
    },
```

(Place it between `"login"` and `"common"`.)

In [src/i18n/en.json](../../src/i18n/en.json), add the same shape with empty values:

```json
    "nav": {
      "sugerencias": "",
      "anadir": "",
      "salir": ""
    },
```

- [ ] **Step 3: Type-check**

Run: `npm run build`. Expected: passes. (The `t()` function returns the key itself for missing entries, so empty EN strings won't crash; the EN nav will display empty labels until filled.)

- [ ] **Step 4: Visual verify**

Run `npm run dev`. Visit `/` as anon — nav shows "mapa de autoras" + "Sugerir" link. Log in via `/admin` — back at `/`, the nav now shows the three icon buttons with tooltips on hover. The badge appears next to the inbox icon if there are pending suggestions.

---

## Task C5 — Update redirect targets

**Files:**

- Modify: `src/components/AdminGate.tsx` — already accepts `loginUrl` prop; just the consumer pages need updating, which we did in Task C1. No code change here, but confirm:

- [ ] **Step 1: Verify all `<AdminGate>` usages point to `/admin`**

Run: `grep -rn "loginUrl" src/pages/admin/`

Expected: only `src/pages/admin/inbox.astro` and (later) `src/pages/admin/suggestion.astro` and `src/pages/admin/promote.astro`, all with `loginUrl="/admin"`.

If any still says `loginUrl="/admin/login"`, update to `"/admin"`.

- [ ] **Step 2: Run type-check**

Run: `npm run build`. Expected: passes.

---

## Task C6 — Real `<SuggestionReview>` page (replaces placeholder)

**Files:**

- Delete: `src/components/SuggestionDetailPlaceholder.tsx`
- Create: `src/components/SuggestionReview.tsx`
- Modify: `src/pages/admin/suggestion.astro` (swap the placeholder for the real component)
- Create: `src/lib/suggestions-detail.ts` (data fetcher)

- [ ] **Step 1: Create `src/lib/suggestions-detail.ts`**

```ts
// suggestions-detail.ts — Stage 7b-i
//
// Read + write helpers for a single suggestion (the admin review page).
// Uses the authed supabase client; RLS gates everything via is_admin().

import { supabase } from "./supabase";

export interface SuggestionDetail {
  id: string;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  submitter_email: string;
  submitter_name: string | null;
  proposed_author_name: string;
  proposed_country_iso_a3: string;
  proposed_books_text: string | null;
  note: string | null;
  reviewer_notes: string | null;
}

export async function getSuggestion(id: string): Promise<SuggestionDetail | null> {
  const { data, error } = await supabase
    .from("suggestions")
    .select(
      "id, created_at, status, submitter_email, submitter_name, proposed_author_name, proposed_country_iso_a3, proposed_books_text, note, reviewer_notes",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[suggestions-detail] get failed:", error.message);
    throw error;
  }
  return (data as SuggestionDetail) ?? null;
}

export async function rejectSuggestion(id: string, reviewerNotes: string): Promise<void> {
  const { error } = await supabase
    .from("suggestions")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewer_notes: reviewerNotes.trim() || null,
    })
    .eq("id", id);
  if (error) {
    console.error("[suggestions-detail] reject failed:", error.message);
    throw error;
  }
}
```

- [ ] **Step 2: Create `src/components/SuggestionReview.tsx`**

```tsx
// SuggestionReview.tsx — Stage 7b-i (replaces SuggestionDetailPlaceholder)
//
// Renders one suggestion's full data, plus Promotar / Rechazar actions.
// Promotar navigates to /admin/promote?suggestion=<id> (the form handles
// prefilling + the RPC call in Slice E2). Rechazar opens an inline reason
// form right here and writes status=rejected via PostgREST.

import { useEffect, useState } from "react";
import { getSuggestion, rejectSuggestion, type SuggestionDetail } from "~/lib/suggestions-detail";

interface Labels {
  title: string;
  loading: string;
  error: string;
  not_found: string;
  proposed_author: string;
  country: string;
  books_text: string;
  note: string;
  submitter: string;
  submitted_on: string;
  status: string;
  status_pending: string;
  status_approved: string;
  status_rejected: string;
  promote: string;
  reject: string;
  reject_reason_label: string;
  reject_confirm: string;
  reject_cancel: string;
  reject_success: string;
  back_to_inbox: string;
}

interface Props {
  labels: Labels;
}

type State =
  | { kind: "loading" }
  | { kind: "error"; msg: string }
  | { kind: "not_found" }
  | { kind: "loaded"; suggestion: SuggestionDetail };

function formatDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export default function SuggestionReview({ labels }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectStatus, setRejectStatus] = useState<"idle" | "submitting" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (!id) {
      if (!cancelled) setState({ kind: "not_found" });
      return;
    }
    getSuggestion(id)
      .then((s) => {
        if (cancelled) return;
        if (!s) setState({ kind: "not_found" });
        else setState({ kind: "loaded", suggestion: s });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ kind: "error", msg: String(e?.message ?? e) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return <p className="text-ink/60">{labels.loading}</p>;
  }
  if (state.kind === "error") {
    return (
      <p className="text-oxblood">
        {labels.error}: {state.msg}
      </p>
    );
  }
  if (state.kind === "not_found") {
    return (
      <div className="space-y-2">
        <p className="text-ink/60">{labels.not_found}</p>
        <a href="/admin/inbox" className="text-oxblood underline">
          ← {labels.back_to_inbox}
        </a>
      </div>
    );
  }

  const s = state.suggestion;
  const statusLabel =
    s.status === "pending"
      ? labels.status_pending
      : s.status === "approved"
        ? labels.status_approved
        : labels.status_rejected;

  async function onConfirmReject() {
    setRejectStatus("submitting");
    try {
      await rejectSuggestion(s.id, rejectReason);
      window.location.href = "/admin/inbox";
    } catch {
      setRejectStatus("error");
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div>
        <a href="/admin/inbox" className="text-sm text-ink/70 underline">
          ← {labels.back_to_inbox}
        </a>
        <h1 className="mt-2 font-serif text-2xl text-ink">{labels.title}</h1>
        <p className="text-xs text-ink/50">
          {labels.submitted_on}: {formatDate(s.created_at)}
        </p>
        <p className="text-xs text-ink/50">
          {labels.status}: <span className="font-medium">{statusLabel}</span>
        </p>
      </div>

      <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <dt className="text-ink/60">{labels.proposed_author}</dt>
        <dd className="text-ink">{s.proposed_author_name}</dd>

        <dt className="text-ink/60">{labels.country}</dt>
        <dd className="text-ink">{s.proposed_country_iso_a3}</dd>

        <dt className="text-ink/60">{labels.books_text}</dt>
        <dd className="text-ink whitespace-pre-wrap">{s.proposed_books_text ?? "—"}</dd>

        <dt className="text-ink/60">{labels.note}</dt>
        <dd className="text-ink whitespace-pre-wrap">{s.note ?? "—"}</dd>

        <dt className="text-ink/60">{labels.submitter}</dt>
        <dd className="text-ink">
          {s.submitter_name ?? "—"} &lt;{s.submitter_email}&gt;
        </dd>
      </dl>

      {s.status === "pending" && (
        <div className="flex items-center gap-3 pt-2 border-t border-ink/10">
          <a
            href={`/admin/promote?suggestion=${s.id}`}
            className="rounded bg-oxblood px-4 py-2 text-parchment text-sm"
          >
            {labels.promote}
          </a>
          {!rejecting && (
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="rounded border border-ink/30 px-4 py-2 text-sm text-ink"
            >
              {labels.reject}
            </button>
          )}
        </div>
      )}

      {rejecting && (
        <div className="space-y-3 rounded border border-ink/10 bg-bone p-4">
          <label className="block text-sm">
            <span className="text-ink/80">{labels.reject_reason_label}</span>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              maxLength={2000}
              className="mt-1 block w-full rounded border border-ink/20 bg-parchment p-2"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onConfirmReject}
              disabled={rejectStatus === "submitting"}
              className="rounded bg-oxblood px-4 py-2 text-parchment text-sm disabled:opacity-50"
            >
              {rejectStatus === "submitting" ? "…" : labels.reject_confirm}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejecting(false);
                setRejectReason("");
                setRejectStatus("idle");
              }}
              className="text-sm text-ink/70 underline"
            >
              {labels.reject_cancel}
            </button>
            {rejectStatus === "error" && (
              <span className="text-sm text-oxblood">{labels.error}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Replace the page wiring at `src/pages/admin/suggestion.astro`**

Open [src/pages/admin/suggestion.astro](../../src/pages/admin/suggestion.astro) (created in 7a as a placeholder). Replace its contents entirely with:

```astro
---
// src/pages/admin/suggestion.astro — Stage 7b-i (real review page)
import Base from "~/layouts/Base.astro";
import AdminGate from "~/components/AdminGate";
import SuggestionReview from "~/components/SuggestionReview";
import { t } from "~/i18n/t";

const lang = "es" as const;
const notAdminLabel = t(lang, "admin.login.error_not_admin");
const labels = {
  title: t(lang, "admin.review.title"),
  loading: t(lang, "admin.inbox.loading"),
  error: t(lang, "admin.inbox.error"),
  not_found: t(lang, "admin.review.not_found"),
  proposed_author: t(lang, "admin.review.proposed_author"),
  country: t(lang, "admin.review.country"),
  books_text: t(lang, "admin.review.books_text"),
  note: t(lang, "admin.review.note"),
  submitter: t(lang, "admin.review.submitter"),
  submitted_on: t(lang, "admin.review.submitted_on"),
  status: t(lang, "admin.review.status"),
  status_pending: t(lang, "admin.review.status_pending"),
  status_approved: t(lang, "admin.review.status_approved"),
  status_rejected: t(lang, "admin.review.status_rejected"),
  promote: t(lang, "admin.review.promote"),
  reject: t(lang, "admin.review.reject"),
  reject_reason_label: t(lang, "admin.review.reject_reason_label"),
  reject_confirm: t(lang, "admin.review.reject_confirm"),
  reject_cancel: t(lang, "admin.review.reject_cancel"),
  reject_success: t(lang, "admin.review.reject_success"),
  back_to_inbox: t(lang, "admin.review.back_to_inbox"),
};
---

<Base lang={lang} title={labels.title}>
  <main class="min-h-screen bg-parchment p-6">
    <AdminGate client:load loginUrl="/admin" notAdminLabel={notAdminLabel}>
      <SuggestionReview client:load labels={labels} />
    </AdminGate>
  </main>
</Base>
```

- [ ] **Step 4: Delete the placeholder component**

In PowerShell: `Remove-Item src\components\SuggestionDetailPlaceholder.tsx`

- [ ] **Step 5: Add the `admin.review.*` i18n keys**

In [src/i18n/es.json](../../src/i18n/es.json), inside the `"admin"` object, REPLACE the existing `"detail"` block with this `"review"` block (and keep everything else):

```json
    "review": {
      "title": "Revisar sugerencia",
      "not_found": "Sugerencia no encontrada.",
      "proposed_author": "Autora propuesta",
      "country": "País",
      "books_text": "Libros (texto del usuario)",
      "note": "Nota",
      "submitter": "Enviado por",
      "submitted_on": "Recibida",
      "status": "Estado",
      "status_pending": "Pendiente",
      "status_approved": "Aprobada",
      "status_rejected": "Rechazada",
      "promote": "Promotar",
      "reject": "Rechazar",
      "reject_reason_label": "Motivo (opcional)",
      "reject_confirm": "Confirmar rechazo",
      "reject_cancel": "Cancelar",
      "reject_success": "Sugerencia rechazada.",
      "back_to_inbox": "Volver a sugerencias pendientes"
    }
```

(That is, delete the `"detail"` sub-object and replace it with `"review"`.)

In [src/i18n/en.json](../../src/i18n/en.json), do the same with empty values:

```json
    "review": {
      "title": "",
      "not_found": "",
      "proposed_author": "",
      "country": "",
      "books_text": "",
      "note": "",
      "submitter": "",
      "submitted_on": "",
      "status": "",
      "status_pending": "",
      "status_approved": "",
      "status_rejected": "",
      "promote": "",
      "reject": "",
      "reject_reason_label": "",
      "reject_confirm": "",
      "reject_cancel": "",
      "reject_success": "",
      "back_to_inbox": ""
    }
```

- [ ] **Step 6: Type-check**

Run: `npm run build`. Expected: passes.

---

## Task C7 — Update AdminInbox row links to `/admin/promote?suggestion=...`

**Files:**

- Modify: `src/components/AdminInbox.tsx`

- [ ] **Step 1: Inspect the existing link**

Open [src/components/AdminInbox.tsx](../../src/components/AdminInbox.tsx). The `<a>` tag points to `/admin/suggestion?id=${row.id}`. That's still correct for the review page — keep it. (The promote URL is reached via the "Promotar" button inside the review page, not from the inbox row directly.)

No code change needed in this task. Just confirm by reading the file.

---

## Task C8 — Verify the end-to-end auth + reject flow

- [ ] **Step 1: Restart the dev stack**

Run: `npm run dev:db:reset` (re-bootstrap admin per `supabase/README.md`) → `npm run dev:functions` → `npm run dev` (3 terminals).

- [ ] **Step 2: Submit a public suggestion as anon**

Browse to `/suggest`, fill the form, submit. (Or run the existing Stage 6 flow.) Expected: row in `suggestions` with `status='pending'`.

- [ ] **Step 3: Log in as admin**

Browse to `/admin`. Submit your admin email. Open Mailpit (`http://127.0.0.1:54324`) → click the magic link.

Expected: lands on `/` (the homepage). The nav now shows the three admin icons. Hover the inbox icon → tooltip "Sugerencias pendientes (1)" with a red badge showing "1".

- [ ] **Step 4: Click the inbox icon**

Expected: lands on `/admin/inbox`, shows the pending suggestion in the list.

- [ ] **Step 5: Click "Revisar"**

Expected: lands on `/admin/suggestion?id=<uuid>`, shows the suggestion details + "Promotar" + "Rechazar" buttons.

- [ ] **Step 6: Click "Rechazar", enter a reason, confirm**

Expected: redirects to `/admin/inbox`; the inbox now shows zero pending. The nav badge updates to no badge.

In Studio SQL editor, verify:

```sql
select id, status, reviewed_at, reviewer_notes from public.suggestions order by created_at desc limit 1;
```

Expected: `status = 'rejected'`, `reviewed_at` set, `reviewer_notes` matches your input.

- [ ] **Step 7: Sign out**

Click the logout icon. Expected: redirected to `/admin` (login form). The nav back at `/` (if you navigate there) shows the public nav with "Sugerir" link.

---

## Task C9 — STOP — Slice C complete

- [ ] User actions:
  1. Review the diff. Lots of files changed: `src/pages/admin/index.astro` (rewrite), `src/pages/admin/inbox.astro` (new), `src/pages/admin/login.astro` (deleted), `src/pages/admin/suggestion.astro` (rewrite), `src/components/AdminAwareNav.tsx` (new), `src/components/AdminNavIcon.tsx` (new), `src/components/SuggestionReview.tsx` (new), `src/components/SuggestionDetailPlaceholder.tsx` (deleted), `src/lib/suggestions-detail.ts` (new), `src/layouts/Base.astro` (mount nav), `src/i18n/es.json`, `src/i18n/en.json`, `supabase/config.toml`.
  2. Commit. Suggested message: `feat(stage-7b-i,admin): unified UX — route restructure, AdminAwareNav, real SuggestionReview with reject flow`

Resume at Slice D after commit.

---

# Slice D — Translate Edge Function

**Goal:** Create the DeepL proxy Edge Function. No UI consumer yet (that's E1). End the slice by verifying the function with `curl`.

## Task D1 — Create the Edge Function

**Files:**

- Create: `supabase/functions/translate/index.ts`

- [ ] **Step 1: Write the function**

```ts
// translate — Stage 7b-i
//
// Admin-only DeepL proxy. With `verify_jwt = true` in config.toml, Supabase
// validates the JWT before our handler runs — so we can assume the caller
// is authenticated. We still check the app_metadata.role for admin-ness in
// case a non-admin authed user reaches us.
//
// Body: { text: string, target_lang: "EN" | "ES" }
// Out:  { text: string }  | error JSON
//
// Env: DEEPL_API_KEY (required for real calls; missing → 502).

const DEEPL_URL = "https://api-free.deepl.com/v2/translate";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface Body {
  text: string;
  target_lang: "EN" | "ES";
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    // base64url → base64 → utf-8 JSON
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Extra defence: confirm the JWT belongs to an admin even though
  // verify_jwt = true already ensured it's a valid session.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const payload = decodeJwtPayload(jwt);
  const role = (payload?.app_metadata as Record<string, unknown> | undefined)?.role;
  if (role !== "admin") {
    return json({ error: "unauthorized" }, 401);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const text = body.text?.trim() ?? "";
  const target = body.target_lang;
  if (!text || (target !== "EN" && target !== "ES")) {
    return json({ error: "invalid_input" }, 400);
  }

  const deeplKey = Deno.env.get("DEEPL_API_KEY") ?? "";
  if (!deeplKey) {
    console.error("[translate] DEEPL_API_KEY not set");
    return json({ error: "translation_failed" }, 502);
  }

  const resp = await fetch(DEEPL_URL, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${deeplKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ text, target_lang: target }),
  });

  if (resp.status === 429) {
    return json({ error: "translation_rate_limited" }, 502);
  }
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.error(`[translate] deepl failed (${resp.status}):`, errText);
    return json({ error: "translation_failed" }, 502);
  }

  const data = (await resp.json()) as {
    translations: { text: string; detected_source_language?: string }[];
  };
  const translated = data?.translations?.[0]?.text ?? "";
  return json({ text: translated }, 200);
});
```

---

## Task D2 — Register the function in config.toml

**Files:**

- Modify: `supabase/config.toml`

- [ ] **Step 1: Add the `[functions.translate]` block**

Open [supabase/config.toml](../../supabase/config.toml). Find the existing `[functions.notify_owner]` block. Add immediately after it:

```toml
# Stage 7b-i — admin-only translate proxy to DeepL. `verify_jwt = true`
# means Supabase validates the bearer JWT before our handler runs. The
# function then double-checks the role inside the JWT.
[functions.translate]
enabled = true
verify_jwt = true
```

- [ ] **Step 2: Restart functions serve**

If `npm run dev:functions` is running, restart it (`Ctrl+C`, then re-run). The CLI picks up new functions on restart.

---

## Task D3 — Update env files

**Files:**

- Modify: `.env.example`
- (You manually edit `.env` to add a real DeepL key for local testing — `.env` is gitignored)

- [ ] **Step 1: Add `DEEPL_API_KEY` to `.env.example`**

Open [.env.example](../../.env.example). Add a new section at the bottom:

```env

# -----------------------------------------------------------------------------
# DeepL (Stage 7b-i)
# -----------------------------------------------------------------------------
# Used by supabase/functions/translate to power the "Traducir" button in the
# admin promote form. Free tier = 500k chars/month at api-free.deepl.com.
# Sign up at https://www.deepl.com/pro-api — pick the FREE plan.
# Without a key set, the button errors gracefully ("translation_failed") and
# the owner can type EN manually.

DEEPL_API_KEY=
```

- [ ] **Step 2: Manually copy your real key into `.env`**

(Optional for the slice's verify step — without it, the curl in Task D4 returns 502 instead of a translated string, which is also valid behavior to confirm.)

---

## Task D4 — Update supabase/README.md

**Files:**

- Modify: `supabase/README.md`

- [ ] **Step 1: Add a short section on the translate function**

Append this section near the existing `Suggestion notifications + admin auth (Stage 7a)` section. Use the same heading style as the other Stage sections.

````markdown
## Translate (Stage 7b-i)

Admin-only Edge Function proxying to DeepL. Lives at `supabase/functions/translate/index.ts`.

- **Auth:** `verify_jwt = true` in `config.toml`. Supabase validates the bearer JWT before the handler runs; the handler then asserts `app_metadata.role === 'admin'` as defence in depth.
- **Env:** `DEEPL_API_KEY` (free tier from https://www.deepl.com/pro-api). When unset, the function returns 502 — the UI surfaces a graceful error and manual entry still works.
- **Free-tier limit:** 500,000 characters/month. Sufficient for ~12× MVP volume.

Smoke test (PowerShell):

```powershell
$jwt = "<paste an admin JWT from devtools localStorage>"
curl.exe -X POST http://127.0.0.1:54321/functions/v1/translate `
  -H "Authorization: Bearer $jwt" `
  -H "Content-Type: application/json" `
  -d '{"text":"Hola mundo","target_lang":"EN"}'
```
````

Expected with a valid `DEEPL_API_KEY`: `{"text":"Hello world"}` (or close).
Expected without a key: `{"error":"translation_failed"}`.

````

---

## Task D5 — Verify with curl

- [ ] **Step 1: Get an admin JWT**

Log into `/admin` in the browser. Once on `/`, open devtools → Application → Local Storage → `http://localhost:4321`. Find the key starting with `sb-...-auth-token`. Its value is a JSON; copy the `access_token` field.

- [ ] **Step 2: curl with the JWT (PowerShell)**

```powershell
$jwt = "<paste the access_token>"
curl.exe -X POST http://127.0.0.1:54321/functions/v1/translate `
  -H "Authorization: Bearer $jwt" `
  -H "Content-Type: application/json" `
  -d '{"text":"Hola mundo","target_lang":"EN"}'
````

Expected (with `DEEPL_API_KEY` set in `.env`):

```json
{ "text": "Hello world" }
```

or similar.

Expected (without key):

```json
{ "error": "translation_failed" }
```

Either is a pass for this slice — the contract works; the key just gates real translations.

- [ ] **Step 3: curl without JWT**

```powershell
curl.exe -X POST http://127.0.0.1:54321/functions/v1/translate `
  -H "Content-Type: application/json" `
  -d '{"text":"Hola","target_lang":"EN"}'
```

Expected: 401 from Supabase (before our handler runs).

- [ ] **Step 4: curl with invalid body**

```powershell
curl.exe -X POST http://127.0.0.1:54321/functions/v1/translate `
  -H "Authorization: Bearer $jwt" `
  -H "Content-Type: application/json" `
  -d '{"text":"","target_lang":"FR"}'
```

Expected: `{"error":"invalid_input"}` with 400.

---

## Task D6 — STOP — Slice D complete

- [ ] User actions:
  1. Review diff over `supabase/functions/translate/index.ts`, `supabase/config.toml`, `.env.example`, `supabase/README.md`.
  2. Commit. Suggested message: `feat(stage-7b-i,fns): translate Edge Function — admin-only DeepL proxy`

Resume at Slice E1.

---

# Slice E1 — Promote-from-scratch

**Goal:** `/admin/promote` (no query param) renders an empty form. Admin fills it, saves, RPC creates the author + books, redirect to `/`. The translate button works end-to-end.

## Task E1.1 — Helper libs

**Files:**

- Create: `src/lib/countries.ts`
- Create: `src/lib/translate.ts`
- Create: `src/lib/promote.ts`

- [ ] **Step 1: `src/lib/countries.ts`**

```ts
// countries.ts — Stage 7b-i
//
// Loads the ISO-3166-1 country list from public.countries (seeded in Stage 3).
// RLS allows anon read.

import { supabase } from "./supabase";

export interface CountryRow {
  iso_a3: string;
  name_es: string;
  name_en: string;
}

let cache: CountryRow[] | null = null;

export async function getCountries(): Promise<CountryRow[]> {
  if (cache) return cache;
  const { data, error } = await supabase
    .from("countries")
    .select("iso_a3, name_es, name_en")
    .order("name_es", { ascending: true });
  if (error) {
    console.error("[countries] load failed:", error.message);
    throw error;
  }
  cache = (data ?? []) as CountryRow[];
  return cache;
}
```

- [ ] **Step 2: `src/lib/translate.ts`**

```ts
// translate.ts — Stage 7b-i
//
// Browser-side wrapper around the /functions/v1/translate Edge Function.
// Sends the admin JWT (managed by supabase-js) via the supabase.functions
// helper, which adds the Authorization header automatically.

import { supabase } from "./supabase";

export type TargetLang = "EN" | "ES";

export async function translateText(text: string, target_lang: TargetLang): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>(
    "translate",
    { body: { text, target_lang } },
  );
  if (error) {
    throw new Error(error.message || "translation_failed");
  }
  if (!data || data.error) {
    throw new Error(data?.error || "translation_failed");
  }
  return data.text ?? "";
}
```

- [ ] **Step 3: `src/lib/promote.ts`**

```ts
// promote.ts — Stage 7b-i
//
// Browser-side wrapper around the promote_suggestion() RPC. The RPC handles
// atomicity, the duplicate check, and (optionally) marking the linked
// suggestion as approved.

import { supabase } from "./supabase";
import type { AuthorStatus } from "./map-state";

export interface PromoteAuthorInput {
  name: string;
  country_iso_a3: string;
  status: AuthorStatus;
  bio_es?: string;
  bio_en?: string;
  photo_url?: string;
  birth_year?: number;
  death_year?: number;
  published: boolean;
  reviewer_notes?: string;
}

export interface PromoteBookInput {
  title: string;
  year?: number;
  original_language?: string;
  cover_url?: string;
  description_es?: string;
  description_en?: string;
}

export type PromoteError =
  | { kind: "duplicate" }
  | { kind: "validation"; message: string }
  | { kind: "unauthorized" }
  | { kind: "unknown"; message: string };

export type PromoteResult = { ok: true; authorId: string } | { ok: false; error: PromoteError };

export async function promoteSuggestion(
  suggestionId: string | null,
  author: PromoteAuthorInput,
  books: PromoteBookInput[],
): Promise<PromoteResult> {
  const { data, error } = await supabase.rpc("promote_suggestion", {
    p_suggestion_id: suggestionId,
    p_author: author as unknown as Record<string, unknown>,
    p_books: books as unknown as Record<string, unknown>[],
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.startsWith("duplicate_author:")) return { ok: false, error: { kind: "duplicate" } };
    if (msg.startsWith("validation:"))
      return { ok: false, error: { kind: "validation", message: msg } };
    if (msg.startsWith("unauthorized:")) return { ok: false, error: { kind: "unauthorized" } };
    return { ok: false, error: { kind: "unknown", message: msg } };
  }
  return { ok: true, authorId: data as string };
}
```

- [ ] **Step 4: Type-check**

Run: `npm run build`. Expected: passes.

---

## Task E1.2 — `<TranslateButton>` component

**Files:**

- Create: `src/components/TranslateButton.tsx`

- [ ] **Step 1: Write the component**

```tsx
// TranslateButton.tsx — Stage 7b-i
//
// Per-field-pair translate button. Reads the source value (handled by the
// parent via `getSourceText`), calls the translate Edge Function, fills the
// target via `onTranslated`. When the target field already has content,
// shows a small confirm modal first.

import { useState } from "react";
import { translateText, type TargetLang } from "~/lib/translate";

interface Labels {
  button: string; // e.g. "Traducir →" or "← Traducir"
  confirm_title: string; // e.g. "Reemplazar texto"
  confirm_body: string; // e.g. "Esto reemplazará el texto actual."
  confirm_ok: string;
  confirm_cancel: string;
  translating: string;
  error: string;
}

interface Props {
  sourceText: string;
  hasTargetContent: boolean;
  targetLang: TargetLang;
  onTranslated: (text: string) => void;
  labels: Labels;
}

export default function TranslateButton({
  sourceText,
  hasTargetContent,
  targetLang,
  onTranslated,
  labels,
}: Props) {
  const [status, setStatus] = useState<"idle" | "confirm" | "loading" | "error">("idle");

  const disabled = !sourceText.trim() || status === "loading";

  async function runTranslate() {
    setStatus("loading");
    try {
      const text = await translateText(sourceText, targetLang);
      onTranslated(text);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  function onClick() {
    if (disabled) return;
    if (hasTargetContent) {
      setStatus("confirm");
    } else {
      runTranslate();
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="rounded border border-ink/20 bg-bone px-3 py-1 text-xs text-ink disabled:opacity-40"
      >
        {status === "loading" ? labels.translating : labels.button}
      </button>
      {status === "error" && <span className="ml-2 text-xs text-oxblood">{labels.error}</span>}
      {status === "confirm" && (
        <div className="absolute z-10 mt-2 w-64 rounded border border-ink/20 bg-parchment p-3 shadow">
          <p className="text-sm font-medium text-ink">{labels.confirm_title}</p>
          <p className="mt-1 text-xs text-ink/70">{labels.confirm_body}</p>
          <div className="mt-3 flex justify-end gap-2 text-xs">
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="rounded border border-ink/20 px-2 py-1"
            >
              {labels.confirm_cancel}
            </button>
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                runTranslate();
              }}
              className="rounded bg-oxblood px-2 py-1 text-parchment"
            >
              {labels.confirm_ok}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Task E1.3 — `<BookFields>` component

**Files:**

- Create: `src/components/BookFields.tsx`

- [ ] **Step 1: Write the component**

```tsx
// BookFields.tsx — Stage 7b-i
//
// One book's worth of fields, used N times inside PromoteForm. The parent
// owns the array of book values + updates one by index via `onChange`.

import TranslateButton from "./TranslateButton";

export interface BookValue {
  title: string;
  year: string; // string in the form; coerced to number at submit
  original_language: string;
  cover_url: string;
  description_es: string;
  description_en: string;
}

export const EMPTY_BOOK: BookValue = {
  title: "",
  year: "",
  original_language: "",
  cover_url: "",
  description_es: "",
  description_en: "",
};

interface Labels {
  title_label: string;
  year_label: string;
  language_label: string;
  cover_label: string;
  description_es_label: string;
  description_en_label: string;
  remove: string;
  translate_to_en: TranslateLabels;
  translate_to_es: TranslateLabels;
}

interface TranslateLabels {
  button: string;
  confirm_title: string;
  confirm_body: string;
  confirm_ok: string;
  confirm_cancel: string;
  translating: string;
  error: string;
}

interface Props {
  index: number;
  value: BookValue;
  onChange: (next: BookValue) => void;
  onRemove?: () => void;
  labels: Labels;
}

export default function BookFields({ index, value, onChange, onRemove, labels }: Props) {
  return (
    <div className="space-y-3 rounded border border-ink/10 bg-bone/40 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">Libro {index + 1}</span>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-oxblood underline">
            {labels.remove}
          </button>
        )}
      </div>

      <label className="block text-sm">
        <span className="text-ink/80">{labels.title_label} *</span>
        <input
          type="text"
          required
          maxLength={500}
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink/80">{labels.year_label}</span>
          <input
            type="number"
            min={1000}
            max={2100}
            value={value.year}
            onChange={(e) => onChange({ ...value, year: e.target.value })}
            className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink/80">{labels.language_label}</span>
          <input
            type="text"
            value={value.original_language}
            onChange={(e) => onChange({ ...value, original_language: e.target.value })}
            className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-ink/80">{labels.cover_label}</span>
        <input
          type="url"
          value={value.cover_url}
          onChange={(e) => onChange({ ...value, cover_url: e.target.value })}
          className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="text-ink/80">{labels.description_es_label}</span>
          <textarea
            rows={3}
            value={value.description_es}
            onChange={(e) => onChange({ ...value, description_es: e.target.value })}
            className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink/80">{labels.description_en_label}</span>
          <textarea
            rows={3}
            value={value.description_en}
            onChange={(e) => onChange({ ...value, description_en: e.target.value })}
            className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <TranslateButton
          sourceText={value.description_es}
          hasTargetContent={value.description_en.trim().length > 0}
          targetLang="EN"
          onTranslated={(text) => onChange({ ...value, description_en: text })}
          labels={labels.translate_to_en}
        />
        <TranslateButton
          sourceText={value.description_en}
          hasTargetContent={value.description_es.trim().length > 0}
          targetLang="ES"
          onTranslated={(text) => onChange({ ...value, description_es: text })}
          labels={labels.translate_to_es}
        />
      </div>
    </div>
  );
}
```

---

## Task E1.4 — `<PromoteForm>` component (empty-mode only for now)

**Files:**

- Create: `src/components/PromoteForm.tsx`

- [ ] **Step 1: Write the component**

```tsx
// PromoteForm.tsx — Stage 7b-i
//
// The form that promotes a suggestion (or creates an author from scratch).
// In E1 this slice is "promote-from-scratch" only — no suggestion context
// column, no reviewer notes. E2 extends with suggestionId prefill.

import { useEffect, useState } from "react";
import TranslateButton from "./TranslateButton";
import BookFields, { EMPTY_BOOK, type BookValue } from "./BookFields";
import { getCountries, type CountryRow } from "~/lib/countries";
import { promoteSuggestion, type PromoteError } from "~/lib/promote";
import type { AuthorStatus } from "~/lib/map-state";

interface TranslateLabels {
  button: string;
  confirm_title: string;
  confirm_body: string;
  confirm_ok: string;
  confirm_cancel: string;
  translating: string;
  error: string;
}

export interface PromoteFormLabels {
  title_new: string;
  name_label: string;
  country_label: string;
  status_label: string;
  status_read: string;
  status_currently_reading: string;
  status_discovery: string;
  birth_year_label: string;
  death_year_label: string;
  photo_label: string;
  bio_es_label: string;
  bio_en_label: string;
  books_section: string;
  add_book: string;
  publish_now_label: string;
  save: string;
  saving: string;
  cancel: string;
  error_duplicate: string;
  error_validation: string;
  error_unknown: string;
  back: string;
  translate_to_en: TranslateLabels;
  translate_to_es: TranslateLabels;
  book: {
    title_label: string;
    year_label: string;
    language_label: string;
    cover_label: string;
    description_es_label: string;
    description_en_label: string;
    remove: string;
  };
}

interface Props {
  labels: PromoteFormLabels;
}

interface AuthorValue {
  name: string;
  country_iso_a3: string;
  status: AuthorStatus;
  birth_year: string;
  death_year: string;
  photo_url: string;
  bio_es: string;
  bio_en: string;
  published: boolean;
}

const EMPTY_AUTHOR: AuthorValue = {
  name: "",
  country_iso_a3: "",
  status: "discovery",
  birth_year: "",
  death_year: "",
  photo_url: "",
  bio_es: "",
  bio_en: "",
  published: true,
};

export default function PromoteForm({ labels }: Props) {
  const [author, setAuthor] = useState<AuthorValue>(EMPTY_AUTHOR);
  const [books, setBooks] = useState<BookValue[]>([{ ...EMPTY_BOOK }]);
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<PromoteError | null>(null);

  useEffect(() => {
    getCountries()
      .then(setCountries)
      .catch((e) => console.error(e));
  }, []);

  function update<K extends keyof AuthorValue>(key: K, val: AuthorValue[K]) {
    setAuthor((a) => ({ ...a, [key]: val }));
  }
  function updateBook(i: number, next: BookValue) {
    setBooks((bs) => bs.map((b, idx) => (idx === i ? next : b)));
  }
  function addBook() {
    setBooks((bs) => [...bs, { ...EMPTY_BOOK }]);
  }
  function removeBook(i: number) {
    setBooks((bs) => bs.filter((_, idx) => idx !== i));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "saving") return;
    setStatus("saving");
    setError(null);
    const result = await promoteSuggestion(
      null,
      {
        name: author.name.trim(),
        country_iso_a3: author.country_iso_a3,
        status: author.status,
        bio_es: author.bio_es.trim() || undefined,
        bio_en: author.bio_en.trim() || undefined,
        photo_url: author.photo_url.trim() || undefined,
        birth_year: author.birth_year ? Number(author.birth_year) : undefined,
        death_year: author.death_year ? Number(author.death_year) : undefined,
        published: author.published,
      },
      books.map((b) => ({
        title: b.title.trim(),
        year: b.year ? Number(b.year) : undefined,
        original_language: b.original_language.trim() || undefined,
        cover_url: b.cover_url.trim() || undefined,
        description_es: b.description_es.trim() || undefined,
        description_en: b.description_en.trim() || undefined,
      })),
    );
    if (result.ok) {
      window.location.href = "/";
    } else {
      setStatus("error");
      setError(result.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <a href="/" className="text-sm text-ink/70 underline">
          ← {labels.back}
        </a>
        <h1 className="mt-2 font-serif text-2xl text-ink">{labels.title_new}</h1>
      </div>

      <fieldset className="space-y-4">
        <label className="block text-sm">
          <span className="text-ink/80">{labels.name_label} *</span>
          <input
            type="text"
            required
            maxLength={200}
            value={author.name}
            onChange={(e) => update("name", e.target.value)}
            className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
          />
        </label>

        <label className="block text-sm">
          <span className="text-ink/80">{labels.country_label} *</span>
          <select
            required
            value={author.country_iso_a3}
            onChange={(e) => update("country_iso_a3", e.target.value)}
            className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
          >
            <option value="" disabled>
              —
            </option>
            {countries.map((c) => (
              <option key={c.iso_a3} value={c.iso_a3}>
                {c.name_es}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className="text-sm text-ink/80">{labels.status_label} *</legend>
          <div className="mt-1 flex gap-4 text-sm">
            {(["read", "currently_reading", "discovery"] as const).map((s) => (
              <label key={s} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="status"
                  value={s}
                  checked={author.status === s}
                  onChange={() => update("status", s)}
                />
                {s === "read"
                  ? labels.status_read
                  : s === "currently_reading"
                    ? labels.status_currently_reading
                    : labels.status_discovery}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-ink/80">{labels.birth_year_label}</span>
            <input
              type="number"
              min={1000}
              max={2100}
              value={author.birth_year}
              onChange={(e) => update("birth_year", e.target.value)}
              className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink/80">{labels.death_year_label}</span>
            <input
              type="number"
              min={1000}
              max={2100}
              value={author.death_year}
              onChange={(e) => update("death_year", e.target.value)}
              className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-ink/80">{labels.photo_label}</span>
          <input
            type="url"
            value={author.photo_url}
            onChange={(e) => update("photo_url", e.target.value)}
            className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
          />
        </label>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-ink/80">{labels.bio_es_label}</span>
            <textarea
              rows={4}
              value={author.bio_es}
              onChange={(e) => update("bio_es", e.target.value)}
              className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink/80">{labels.bio_en_label}</span>
            <textarea
              rows={4}
              value={author.bio_en}
              onChange={(e) => update("bio_en", e.target.value)}
              className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-1.5"
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <TranslateButton
            sourceText={author.bio_es}
            hasTargetContent={author.bio_en.trim().length > 0}
            targetLang="EN"
            onTranslated={(text) => update("bio_en", text)}
            labels={labels.translate_to_en}
          />
          <TranslateButton
            sourceText={author.bio_en}
            hasTargetContent={author.bio_es.trim().length > 0}
            targetLang="ES"
            onTranslated={(text) => update("bio_es", text)}
            labels={labels.translate_to_es}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-ink">{labels.books_section}</legend>
        {books.map((b, i) => (
          <BookFields
            key={i}
            index={i}
            value={b}
            onChange={(next) => updateBook(i, next)}
            onRemove={books.length > 1 ? () => removeBook(i) : undefined}
            labels={{
              ...labels.book,
              translate_to_en: labels.translate_to_en,
              translate_to_es: labels.translate_to_es,
            }}
          />
        ))}
        <button
          type="button"
          onClick={addBook}
          className="rounded border border-ink/20 px-3 py-1 text-sm text-ink"
        >
          {labels.add_book}
        </button>
      </fieldset>

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={author.published}
          onChange={(e) => update("published", e.target.checked)}
        />
        {labels.publish_now_label}
      </label>

      {status === "error" && error && (
        <div
          role="alert"
          className="rounded border border-oxblood/40 bg-oxblood/5 p-3 text-sm text-oxblood"
        >
          {error.kind === "duplicate"
            ? labels.error_duplicate
            : error.kind === "validation"
              ? labels.error_validation
              : labels.error_unknown}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded bg-oxblood px-4 py-2 text-parchment text-sm disabled:opacity-50"
        >
          {status === "saving" ? labels.saving : labels.save}
        </button>
        <a href="/" className="text-sm text-ink/70 underline">
          {labels.cancel}
        </a>
      </div>
    </form>
  );
}
```

---

## Task E1.5 — Create `/admin/promote` page

**Files:**

- Create: `src/pages/admin/promote.astro`

- [ ] **Step 1: Write the page**

```astro
---
// src/pages/admin/promote.astro — Stage 7b-i (E1: empty form only; E2 adds suggestion mode)
import Base from "~/layouts/Base.astro";
import AdminGate from "~/components/AdminGate";
import PromoteForm from "~/components/PromoteForm";
import { t } from "~/i18n/t";

const lang = "es" as const;
const notAdminLabel = t(lang, "admin.login.error_not_admin");

const tx = {
  button: t(lang, "admin.promote.translate.button_to_en"),
  confirm_title: t(lang, "admin.promote.translate.confirm_title"),
  confirm_body: t(lang, "admin.promote.translate.confirm_body"),
  confirm_ok: t(lang, "admin.promote.translate.confirm_ok"),
  confirm_cancel: t(lang, "admin.promote.translate.confirm_cancel"),
  translating: t(lang, "admin.promote.translate.translating"),
  error: t(lang, "admin.promote.translate.error"),
};
const txEs = { ...tx, button: t(lang, "admin.promote.translate.button_to_es") };

const labels = {
  title_new: t(lang, "admin.promote.title_new"),
  name_label: t(lang, "admin.promote.name_label"),
  country_label: t(lang, "admin.promote.country_label"),
  status_label: t(lang, "admin.promote.status_label"),
  status_read: t(lang, "admin.promote.status_read"),
  status_currently_reading: t(lang, "admin.promote.status_currently_reading"),
  status_discovery: t(lang, "admin.promote.status_discovery"),
  birth_year_label: t(lang, "admin.promote.birth_year_label"),
  death_year_label: t(lang, "admin.promote.death_year_label"),
  photo_label: t(lang, "admin.promote.photo_label"),
  bio_es_label: t(lang, "admin.promote.bio_es_label"),
  bio_en_label: t(lang, "admin.promote.bio_en_label"),
  books_section: t(lang, "admin.promote.books_section"),
  add_book: t(lang, "admin.promote.add_book"),
  publish_now_label: t(lang, "admin.promote.publish_now_label"),
  save: t(lang, "admin.promote.save"),
  saving: t(lang, "admin.promote.saving"),
  cancel: t(lang, "admin.promote.cancel"),
  error_duplicate: t(lang, "admin.promote.error_duplicate"),
  error_validation: t(lang, "admin.promote.error_validation"),
  error_unknown: t(lang, "admin.promote.error_unknown"),
  back: t(lang, "admin.promote.back"),
  translate_to_en: tx,
  translate_to_es: txEs,
  book: {
    title_label: t(lang, "admin.promote.book.title_label"),
    year_label: t(lang, "admin.promote.book.year_label"),
    language_label: t(lang, "admin.promote.book.language_label"),
    cover_label: t(lang, "admin.promote.book.cover_label"),
    description_es_label: t(lang, "admin.promote.book.description_es_label"),
    description_en_label: t(lang, "admin.promote.book.description_en_label"),
    remove: t(lang, "admin.promote.book.remove"),
  },
};
---

<Base lang={lang} title={labels.title_new}>
  <main class="min-h-screen bg-parchment p-6">
    <AdminGate client:load loginUrl="/admin" notAdminLabel={notAdminLabel}>
      <PromoteForm client:load labels={labels} />
    </AdminGate>
  </main>
</Base>
```

---

## Task E1.6 — Add the `admin.promote.*` i18n keys

**Files:**

- Modify: `src/i18n/es.json`
- Modify: `src/i18n/en.json`

- [ ] **Step 1: Insert the `promote` block into ES, after `review`**

```json
    "promote": {
      "title_new": "Añadir autora",
      "title_review": "Promotar sugerencia",
      "name_label": "Nombre",
      "country_label": "País",
      "status_label": "Estado",
      "status_read": "Leída",
      "status_currently_reading": "Leyendo",
      "status_discovery": "Sugerencia",
      "birth_year_label": "Año de nacimiento",
      "death_year_label": "Año de defunción",
      "photo_label": "URL de foto",
      "bio_es_label": "Bio (ES)",
      "bio_en_label": "Bio (EN)",
      "books_section": "Libros (mínimo uno)",
      "add_book": "+ Añadir otro libro",
      "publish_now_label": "Publicar inmediatamente",
      "save": "Guardar y publicar",
      "saving": "Guardando…",
      "cancel": "Cancelar",
      "back": "Volver",
      "error_duplicate": "Ya existe una autora con este nombre en este país. Edita su perfil para añadir más libros.",
      "error_validation": "Revisa los campos marcados.",
      "error_unknown": "No se pudo guardar. Inténtalo de nuevo.",
      "translate": {
        "button_to_en": "Traducir a EN →",
        "button_to_es": "← Traducir a ES",
        "confirm_title": "Reemplazar texto",
        "confirm_body": "Esto reemplazará el texto actual.",
        "confirm_ok": "Reemplazar",
        "confirm_cancel": "Cancelar",
        "translating": "Traduciendo…",
        "error": "Error al traducir"
      },
      "book": {
        "title_label": "Título",
        "year_label": "Año",
        "language_label": "Idioma original",
        "cover_label": "URL de portada",
        "description_es_label": "Descripción (ES)",
        "description_en_label": "Description (EN)",
        "remove": "Eliminar"
      }
    }
```

- [ ] **Step 2: Insert the same shape with empty values into EN**

```json
    "promote": {
      "title_new": "",
      "title_review": "",
      "name_label": "",
      "country_label": "",
      "status_label": "",
      "status_read": "",
      "status_currently_reading": "",
      "status_discovery": "",
      "birth_year_label": "",
      "death_year_label": "",
      "photo_label": "",
      "bio_es_label": "",
      "bio_en_label": "",
      "books_section": "",
      "add_book": "",
      "publish_now_label": "",
      "save": "",
      "saving": "",
      "cancel": "",
      "back": "",
      "error_duplicate": "",
      "error_validation": "",
      "error_unknown": "",
      "translate": {
        "button_to_en": "",
        "button_to_es": "",
        "confirm_title": "",
        "confirm_body": "",
        "confirm_ok": "",
        "confirm_cancel": "",
        "translating": "",
        "error": ""
      },
      "book": {
        "title_label": "",
        "year_label": "",
        "language_label": "",
        "cover_label": "",
        "description_es_label": "",
        "description_en_label": "",
        "remove": ""
      }
    }
```

- [ ] **Step 3: Type-check**

Run: `npm run build`. Expected: passes.

---

## Task E1.7 — Verify promote-from-scratch end-to-end

- [ ] **Step 1: Run the full stack**

Three terminals: `npm run dev:db`, `npm run dev:functions`, `npm run dev`. Reset + re-bootstrap admin if needed.

- [ ] **Step 2: Log in and click the + icon**

`/admin` → magic link → land on `/` → click the plus icon in the admin nav.

Expected: lands on `/admin/promote` showing an empty form, no suggestion column.

- [ ] **Step 3: Fill the form and save**

- Name: `Test Promotion Author`
- Country: `Chile`
- Status: `Sugerencia` (default)
- Birth year: `1900`
- Bio (ES): `Una autora de prueba.`
- Click `Traducir a EN →` (with `DEEPL_API_KEY` set) → Bio EN fills.
- Book 1 title: `Libro de prueba`, year `1925`.
- Leave `Publicar inmediatamente` checked.
- Click `Guardar y publicar`.

Expected: redirects to `/`. The map shows Chile with one extra author (oxblood for `discovery`).

- [ ] **Step 4: Verify in Studio SQL editor**

```sql
select id, name, slug, status, country_iso_a3, bio_es, bio_en
from public.authors where name = 'Test Promotion Author';
```

Expected: one row with `slug = 'test-promotion-author-chl'`, status `discovery`, both bios populated.

```sql
select title, year, display_order
from public.books where author_id = (select id from public.authors where name = 'Test Promotion Author');
```

Expected: one row, title `Libro de prueba`, year 1925, display_order 0.

- [ ] **Step 5: Verify duplicate guard**

Go back to `/admin/promote`. Fill name `Test Promotion Author`, country `Chile`. Add a book. Save.

Expected: form shows `error_duplicate` message (`"Ya existe una autora con este nombre..."`). No new row in DB.

- [ ] **Step 6: Verify translate confirm modal**

In a fresh promote attempt, fill Bio ES and Bio EN both with text. Click `Traducir a EN →`.

Expected: confirm modal appears. Click cancel → Bio EN unchanged. Click confirm → Bio EN replaced with the translation.

- [ ] **Step 7: Clean up test data**

```sql
delete from public.authors where slug = 'test-promotion-author-chl';
```

---

## Task E1.8 — STOP — Slice E1 complete

- [ ] User actions:
  1. Review diff over `src/lib/{countries,translate,promote}.ts`, `src/components/{TranslateButton,BookFields,PromoteForm}.tsx`, `src/pages/admin/promote.astro`, `src/i18n/es.json`, `src/i18n/en.json`.
  2. Commit. Suggested message: `feat(stage-7b-i,promote): promote-from-scratch — form, translate button, RPC integration`

Resume at Slice E2.

---

# Slice E2 — Promote-from-suggestion + reviewer notes

**Goal:** `/admin/promote?suggestion=<uuid>` prefills the form with the suggestion's data, shows the suggestion context column read-only, captures reviewer notes, and (on save) marks the suggestion `approved`.

## Task E2.1 — Extend `<PromoteForm>` to load + prefill from suggestion

**Files:**

- Modify: `src/components/PromoteForm.tsx`

- [ ] **Step 1: Add a `suggestionId` prop + loading state**

Open [src/components/PromoteForm.tsx](../../src/components/PromoteForm.tsx). Make the following edits:

Add to the imports at the top:

```ts
import { getSuggestion, type SuggestionDetail } from "~/lib/suggestions-detail";
```

Extend `Props`:

```ts
interface Props {
  labels: PromoteFormLabels;
  suggestionId?: string;
}
```

Extend `PromoteFormLabels` (add at the end, before the closing brace):

```ts
// Suggestion context column (only used when suggestionId is set)
title_review: string;
context_submitted_on: string;
context_proposed_author: string;
context_country: string;
context_books_text: string;
context_note: string;
context_submitter: string;
reviewer_notes_label: string;
```

Update the component signature:

```ts
export default function PromoteForm({ labels, suggestionId }: Props) {
```

Add state for the suggestion + reviewer notes (right after the existing `useState` lines):

```ts
const [suggestion, setSuggestion] = useState<SuggestionDetail | null>(null);
const [suggestionLoading, setSuggestionLoading] = useState<boolean>(!!suggestionId);
const [reviewerNotes, setReviewerNotes] = useState<string>("");
```

Add a `useEffect` to fetch + prefill when `suggestionId` is present (place after the `getCountries` useEffect):

```ts
useEffect(() => {
  if (!suggestionId) return;
  let cancelled = false;
  getSuggestion(suggestionId)
    .then((s) => {
      if (cancelled || !s) return;
      setSuggestion(s);
      setAuthor((a) => ({
        ...a,
        name: s.proposed_author_name,
        country_iso_a3: s.proposed_country_iso_a3,
      }));
      setSuggestionLoading(false);
    })
    .catch((e) => {
      console.error("[PromoteForm] load suggestion failed:", e);
      setSuggestionLoading(false);
    });
  return () => {
    cancelled = true;
  };
}, [suggestionId]);
```

Update the title rendering — replace the existing `<h1>` line:

```tsx
<h1 className="mt-2 font-serif text-2xl text-ink">
  {suggestionId ? labels.title_review : labels.title_new}
</h1>
```

Update the `onSubmit` function to pass `suggestionId` and `reviewer_notes`:

```ts
const result = await promoteSuggestion(
  suggestionId ?? null,
  {
    // ... existing author fields ...
    reviewer_notes: suggestionId ? reviewerNotes.trim() || undefined : undefined,
  },
  // ... books unchanged ...
);
```

Update the post-save redirect (replace `window.location.href = "/";`):

```ts
if (result.ok) {
  window.location.href = suggestionId ? "/admin/inbox" : "/";
  return;
}
```

Wrap the entire current form return in a two-column layout when `suggestionId` is set. Replace the existing `return (...)` block with:

```tsx
  if (suggestionLoading) {
    return <p className="mx-auto max-w-2xl p-6 text-ink/60">{labels.saving}</p>;
  }

  const formMarkup = (
    /* the existing <form>...</form> markup, unchanged */
  );

  if (!suggestionId || !suggestion) {
    return formMarkup;
  }

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 p-6 md:grid-cols-[1fr_2fr]">
      <aside className="rounded border border-ink/10 bg-bone/60 p-4 text-sm">
        <h2 className="font-medium text-ink">Sugerencia (lectura)</h2>
        <dl className="mt-3 space-y-2">
          <div><dt className="text-ink/60">{labels.context_submitted_on}</dt>
            <dd className="text-ink">{new Date(suggestion.created_at).toISOString().slice(0, 10)}</dd></div>
          <div><dt className="text-ink/60">{labels.context_proposed_author}</dt>
            <dd className="text-ink">{suggestion.proposed_author_name}</dd></div>
          <div><dt className="text-ink/60">{labels.context_country}</dt>
            <dd className="text-ink">{suggestion.proposed_country_iso_a3}</dd></div>
          <div><dt className="text-ink/60">{labels.context_books_text}</dt>
            <dd className="whitespace-pre-wrap text-ink">{suggestion.proposed_books_text ?? "—"}</dd></div>
          <div><dt className="text-ink/60">{labels.context_note}</dt>
            <dd className="whitespace-pre-wrap text-ink">{suggestion.note ?? "—"}</dd></div>
          <div><dt className="text-ink/60">{labels.context_submitter}</dt>
            <dd className="text-ink">
              {suggestion.submitter_name ?? "—"} &lt;{suggestion.submitter_email}&gt;
            </dd></div>
        </dl>
        <label className="mt-4 block text-sm">
          <span className="text-ink/80">{labels.reviewer_notes_label}</span>
          <textarea
            rows={3}
            maxLength={2000}
            value={reviewerNotes}
            onChange={(e) => setReviewerNotes(e.target.value)}
            className="mt-1 block w-full rounded border border-ink/20 bg-parchment p-2"
          />
        </label>
      </aside>
      <div>{formMarkup}</div>
    </div>
  );
}
```

(The variable `formMarkup` should hold the JSX of the existing `<form onSubmit={onSubmit} ...>...</form>` block. Refactor by extracting that JSX into the `const formMarkup` variable so it can be rendered standalone or inside the two-column wrapper.)

- [ ] **Step 2: Type-check**

Run: `npm run build`. Expected: passes after adding the new label fields in the page wiring (next task).

---

## Task E2.2 — Update `/admin/promote.astro` to pass `suggestionId` + new labels

**Files:**

- Modify: `src/pages/admin/promote.astro`

- [ ] **Step 1: Read `?suggestion=` from the URL on the Astro side**

Replace [src/pages/admin/promote.astro](../../src/pages/admin/promote.astro) with:

```astro
---
// src/pages/admin/promote.astro — Stage 7b-i (E2: handles both modes)
import Base from "~/layouts/Base.astro";
import AdminGate from "~/components/AdminGate";
import PromoteForm from "~/components/PromoteForm";
import { t } from "~/i18n/t";

const lang = "es" as const;
const notAdminLabel = t(lang, "admin.login.error_not_admin");

const tx = {
  button: t(lang, "admin.promote.translate.button_to_en"),
  confirm_title: t(lang, "admin.promote.translate.confirm_title"),
  confirm_body: t(lang, "admin.promote.translate.confirm_body"),
  confirm_ok: t(lang, "admin.promote.translate.confirm_ok"),
  confirm_cancel: t(lang, "admin.promote.translate.confirm_cancel"),
  translating: t(lang, "admin.promote.translate.translating"),
  error: t(lang, "admin.promote.translate.error"),
};
const txEs = { ...tx, button: t(lang, "admin.promote.translate.button_to_es") };

const labels = {
  title_new: t(lang, "admin.promote.title_new"),
  title_review: t(lang, "admin.promote.title_review"),
  name_label: t(lang, "admin.promote.name_label"),
  country_label: t(lang, "admin.promote.country_label"),
  status_label: t(lang, "admin.promote.status_label"),
  status_read: t(lang, "admin.promote.status_read"),
  status_currently_reading: t(lang, "admin.promote.status_currently_reading"),
  status_discovery: t(lang, "admin.promote.status_discovery"),
  birth_year_label: t(lang, "admin.promote.birth_year_label"),
  death_year_label: t(lang, "admin.promote.death_year_label"),
  photo_label: t(lang, "admin.promote.photo_label"),
  bio_es_label: t(lang, "admin.promote.bio_es_label"),
  bio_en_label: t(lang, "admin.promote.bio_en_label"),
  books_section: t(lang, "admin.promote.books_section"),
  add_book: t(lang, "admin.promote.add_book"),
  publish_now_label: t(lang, "admin.promote.publish_now_label"),
  save: t(lang, "admin.promote.save"),
  saving: t(lang, "admin.promote.saving"),
  cancel: t(lang, "admin.promote.cancel"),
  error_duplicate: t(lang, "admin.promote.error_duplicate"),
  error_validation: t(lang, "admin.promote.error_validation"),
  error_unknown: t(lang, "admin.promote.error_unknown"),
  back: t(lang, "admin.promote.back"),
  translate_to_en: tx,
  translate_to_es: txEs,
  book: {
    title_label: t(lang, "admin.promote.book.title_label"),
    year_label: t(lang, "admin.promote.book.year_label"),
    language_label: t(lang, "admin.promote.book.language_label"),
    cover_label: t(lang, "admin.promote.book.cover_label"),
    description_es_label: t(lang, "admin.promote.book.description_es_label"),
    description_en_label: t(lang, "admin.promote.book.description_en_label"),
    remove: t(lang, "admin.promote.book.remove"),
  },
  // Context column (E2)
  context_submitted_on: t(lang, "admin.promote.context.submitted_on"),
  context_proposed_author: t(lang, "admin.promote.context.proposed_author"),
  context_country: t(lang, "admin.promote.context.country"),
  context_books_text: t(lang, "admin.promote.context.books_text"),
  context_note: t(lang, "admin.promote.context.note"),
  context_submitter: t(lang, "admin.promote.context.submitter"),
  reviewer_notes_label: t(lang, "admin.promote.reviewer_notes_label"),
};

const suggestionId = Astro.url.searchParams.get("suggestion") ?? undefined;
---

<Base lang={lang} title={suggestionId ? labels.title_review : labels.title_new}>
  <main class="min-h-screen bg-parchment p-6">
    <AdminGate client:load loginUrl="/admin" notAdminLabel={notAdminLabel}>
      <PromoteForm client:load labels={labels} suggestionId={suggestionId} />
    </AdminGate>
  </main>
</Base>
```

> **Note on Astro static output:** `Astro.url.searchParams` works at build time for known params, but for arbitrary `?suggestion=<uuid>` we need client-side handling. The above pattern (passing `suggestionId` as a string prop) compiles to a single static page; at runtime the form reads `window.location.search` if `suggestionId` is empty. To make this work cleanly with `output: 'static'`, change the prop pass to use a client-side parse instead. The simplest path:
>
> Remove the `Astro.url.searchParams` line. In `PromoteForm.tsx`, read the URL on mount when `suggestionId` is undefined:
>
> ```ts
> useEffect(() => {
>   if (suggestionId) return; // explicit prop wins
>   const params = new URLSearchParams(window.location.search);
>   const fromUrl = params.get("suggestion");
>   if (fromUrl) setSuggestionId(fromUrl); // or set local state
> }, [suggestionId]);
> ```
>
> Simpler approach used in this plan: skip the Astro-side parsing entirely. The form reads `window.location.search` directly (same pattern as `SuggestionReview.tsx`).

- [ ] **Step 2: Simpler — let the form read the URL itself**

Revert the page to NOT read `Astro.url.searchParams`. Drop the line `const suggestionId = ...` and the `suggestionId={suggestionId}` prop pass. The page just renders `<PromoteForm client:load labels={labels} />`.

Then in `src/components/PromoteForm.tsx`, instead of receiving `suggestionId` as a prop, use a local state that hydrates from the URL:

```ts
const [suggestionId, setSuggestionId] = useState<string | undefined>(undefined);

useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("suggestion");
  if (id) setSuggestionId(id);
  else setSuggestionLoading(false); // no suggestion → no loading state
}, []);
```

Initialize `suggestionLoading` based on whether URL has the param at first paint:

```ts
const [suggestionLoading, setSuggestionLoading] = useState<boolean>(
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).has("suggestion")
    : false,
);
```

Remove the `suggestionId` prop from `Props`. Adjust the existing `useEffect` that loads the suggestion to depend on `[suggestionId]` and skip when undefined.

This avoids any Astro static-build oddities around dynamic query strings.

- [ ] **Step 3: Type-check**

Run: `npm run build`. Expected: passes.

---

## Task E2.3 — Add the `admin.promote.context.*` and `reviewer_notes_label` i18n keys

**Files:**

- Modify: `src/i18n/es.json`
- Modify: `src/i18n/en.json`

- [ ] **Step 1: Extend the `admin.promote` block in ES**

Add these keys inside the existing `admin.promote` object (anywhere — JSON ordering doesn't matter, but conventionally near the bottom before `book`):

```json
      "reviewer_notes_label": "Notas del review (opcional)",
      "context": {
        "submitted_on": "Recibida",
        "proposed_author": "Autora propuesta",
        "country": "País",
        "books_text": "Libros (texto del usuario)",
        "note": "Nota",
        "submitter": "Enviado por"
      },
```

- [ ] **Step 2: Mirror in EN with empty values**

```json
      "reviewer_notes_label": "",
      "context": {
        "submitted_on": "",
        "proposed_author": "",
        "country": "",
        "books_text": "",
        "note": "",
        "submitter": ""
      },
```

- [ ] **Step 3: Type-check**

Run: `npm run build`. Expected: passes.

---

## Task E2.4 — Verify promote-from-suggestion end-to-end

- [ ] **Step 1: Run the stack + ensure a pending suggestion exists**

Submit a fresh suggestion at `/suggest` as anon (or seed one).

- [ ] **Step 2: Log in as admin → inbox icon → Revisar → Promotar**

Expected:

- Inbox shows the pending suggestion + badge count.
- Click "Revisar" → suggestion details page.
- Click "Promotar" → lands on `/admin/promote?suggestion=<uuid>`.
- Form is prefilled with the suggestion's author name + country.
- Suggestion context column appears on the left (read-only): submitter, books text, note.
- Reviewer notes textarea is visible.

- [ ] **Step 3: Fill remaining fields and save**

Add a book title, optionally translate the bio, add a reviewer note (e.g., "Approved 2026-06-10."), click Save.

Expected: redirects to `/admin/inbox`. The list no longer shows that suggestion. Badge decrements.

- [ ] **Step 4: Verify in Studio SQL editor**

```sql
select status, reviewed_at, reviewer_notes from public.suggestions where id = '<uuid>';
```

Expected: `status = 'approved'`, `reviewed_at` set, `reviewer_notes` matches your input.

```sql
select name, slug, country_iso_a3, status from public.authors where slug like '%-<lowered-iso>%' order by created_at desc limit 1;
```

Expected: the new author row.

- [ ] **Step 5: Browse the homepage**

Expected: the new author appears in the correct country with the correct state color.

---

## Task E2.5 — STOP — Slice E2 complete; end of Stage 7b-i implementation

- [ ] User actions:
  1. Review diff over `src/components/PromoteForm.tsx`, `src/pages/admin/promote.astro`, `src/i18n/es.json`, `src/i18n/en.json`.
  2. Commit. Suggested message: `feat(stage-7b-i,promote): promote-from-suggestion — prefill, context column, reviewer notes, suggestion auto-resolve`

Resume at end-of-stage finalization.

---

# End-of-stage finalization

After Slice E2 commits, do these housekeeping updates before opening the PR.

## Task F1 — Update `docs/STATUS.md`

**Files:**

- Modify: `docs/STATUS.md`

- [ ] **Step 1: Roadmap table**

Change the row `7b — Promote suggestion + author CRUD + book CRUD` to two rows:

```markdown
| 7b-i — Promote suggestion + currently_reading + translate Edge Function + unified admin UX | ✅ Done | feature/07b-promote-and-crud |
| 7b-ii — CRUD on existing authors (edit, add-more-books, delete) | ⏳ Pending | feature/07b-ii-author-crud |
```

- [ ] **Step 2: Last-session section**

Add a new section at the top of the file (above the existing "Last session" block):

```markdown
## Last session — 2026-06-10 (Stage 7b-i)

**Branch in progress:** `feature/07b-promote-and-crud` (six commits; merge after final review).

### DB

- Migrations 0004 (`unaccent` + `slugify()` + `currently_reading` enum value) and 0005 (`promote_suggestion()` RPC with `SECURITY DEFINER`, `is_admin()` gate, duplicate-`(name, country)` guard, slug auto-generation + collision suffix).
- ADR 0004 — translation strategy (DeepL via admin Edge Function, owner reviews before save).

### Map state model

- Third state `currently_reading` (sage `#7a9b82`) added alongside read (penguin) and discovery (oxblood).
- Filter row went from 3 → 4 buttons: `Todas / Sugerencias / Leyendo / Leídas`.
- Semantic CSS aliases (`--c-state-read`, `--c-state-currently-reading`, `--c-state-discovery`) in `tokens.css` so future palette swaps are one-line edits.
- i18n label rename only — "Descubrimientos" → "Sugerencias" in ES (`Discoveries` → `Suggestions` in EN). DB enum stays `discovery`.

### Admin UX

- Route restructure: `/admin` = login form, `/admin/inbox` = list, `/admin/promote` = form.
- `<AdminAwareNav>` mounted in `Base.astro` renders public nav for anon, admin nav for authenticated admin (3 icons + tooltip + pending-count badge, 60s polling).
- Skeleton placeholder during the ~150ms session check — no content flicker.

### Promote / Reject

- `<SuggestionReview>` page replaces the 7a placeholder: Promotar + Rechazar buttons; Rechazar uses an inline reason textarea + plain PostgREST update.
- `<PromoteForm>` handles both entry points — from suggestion (prefilled, suggestion context column, reviewer notes) or from scratch (`+ Añadir` icon in admin nav, empty form).
- Atomic save via `promote_suggestion()` RPC; redirects to `/admin/inbox` (from suggestion) or `/` (from scratch).

### Translation

- `supabase/functions/translate/index.ts` — admin-only DeepL proxy (`verify_jwt = true` + extra role check).
- `<TranslateButton>` component used per bilingual field pair (bio + book description), with confirm modal when the target field is non-empty.
- `.env.example` adds `DEEPL_API_KEY` (free tier).

### Out of scope (lives in 7b-ii)

- Edit existing author / book / book_links.
- Add more books to an existing author after promotion.
- Delete actions.
```

- [ ] **Step 3: Open items**

Update the "Open items pending decision" section, removing items that 7b-i resolved:

- Remove "Bilingual content strategy" (resolved by ADR 0004).
- Remove the `/admin/suggestions/[id]` rendering strategy item (resolved by `?id=...` query-string pattern in 7a + 7b-i).
- Keep "`book_links` shape" and "`SUPABASE_SERVICE_ROLE` env-var rename" — both still open, 7b-ii territory.

- [ ] **Step 4: Resume-tomorrow command sheet**

Update to refer to `feature/07b-ii-author-crud` as the next branch.

---

## Task F2 — Update `docs/RAG.md`

**Files:**

- Modify: `docs/RAG.md`

- [ ] **Step 1: Verify ADR 0004 row exists**

(Added in Task A3.) Confirm it's there.

- [ ] **Step 2: No other RAG changes needed**

The spec + plan files already use the `specs/YYYY-...` and `plans/YYYY-...` pattern that the existing index covers.

---

## Task F3 — Update `supabase/README.md`

**Files:**

- Modify: `supabase/README.md`

- [ ] **Step 1: Verify the Stage 7b-i translate section was added**

(Added in Task D4.) Confirm.

- [ ] **Step 2: Add a brief Stage 7b-i section above the Stage 7a section**

Mention: new RPC `promote_suggestion()`, new enum value `currently_reading`, new `slugify()` helper. Link out to the spec + plan.

```markdown
## Promote + currently_reading + translate (Stage 7b-i)

- New migration `0004_promote_prep.sql` adds `unaccent`, `slugify(text)`, and the `currently_reading` enum value to `author_status`.
- New migration `0005_promote_suggestion_rpc.sql` adds the atomic `promote_suggestion(uuid, jsonb, jsonb[])` function. `SECURITY DEFINER` + `is_admin()` gate; writes one author + N books + (optionally) flips the linked suggestion to `approved` in a single transaction.
- New Edge Function `translate` proxies to DeepL. See above section for env + smoke test.

See [docs/specs/2026-06-09-stage-7b-i-design.md](../docs/specs/2026-06-09-stage-7b-i-design.md) for the full design, and [docs/plans/2026-06-09-stage-7b-i-implementation.md](../docs/plans/2026-06-09-stage-7b-i-implementation.md) for the slice-by-slice plan.
```

---

## Task F4 — Final type-check + build

- [ ] **Step 1: Run `npm run build`**

Expected: passes cleanly.

- [ ] **Step 2: Manual full end-to-end smoke test**

Replay the spec's [§ Verification](../specs/2026-06-09-stage-7b-i-design.md#verification-end-of-stage) section start-to-finish.

- [ ] **Step 3: STOP — Stage 7b-i implementation complete**

User actions:

1. Commit the docs updates: `feat(stage-7b-i,docs): STATUS, RAG, supabase/README updates for end-of-stage`
2. Open a PR `feature/07b-promote-and-crud` → `development`. Title: `Stage 7b-i — promote suggestion + currently_reading + translate + unified admin UX`.
3. After review, merge to `development`, then to `master`.

---

# Self-review notes (run by the plan author after writing)

## Spec coverage

Walked through every decision row in [docs/specs/2026-06-09-stage-7b-i-design.md § Decisions](../specs/2026-06-09-stage-7b-i-design.md#decisions) (19 items):

- ✅ #1 Atomic RPC — Task A2
- ✅ #2 Slug hidden / server-generated — Task A2 (function body computes slug)
- ✅ #3 Duplicate by (lower(name), iso_a3) — Task A2
- ✅ #4 Promote form scope narrow — Task E1
- ✅ #5 Default status `discovery` — Task E1.4 (`EMPTY_AUTHOR`)
- ✅ #6 Sage `#7a9b82` — Task B1
- ✅ #7 Semantic state aliases — Task B1
- ✅ #8 Filter order `Todas/Sugerencias/Leyendo/Leídas` — Task B3
- ✅ #9 Mixed-country priority — Task B2 (`fillFor`)
- ✅ #10 i18n rename only — Task B4
- ✅ #11 DeepL via Edge Function — Task D1
- ✅ #12 Translate UX confirm modal — Task E1.2
- ✅ #13 No duplicate-block on submit — (not implemented; correctly out of scope)
- ✅ #14 AdminAwareNav with badge + skeleton — Task C3 / C4
- ✅ #15 Route restructure — Task C1
- ✅ #16 Default session lifecycle — (no change needed; verified by absence of code)
- ✅ #17 Redirect after promote-from-suggestion → /admin/inbox — Task E2.1
- ✅ #18 Redirect after promote-from-scratch → / — Task E1.4
- ✅ #19 Inline SVG icons — Task C3

## Placeholder scan

- No TBD/TODO strings in the plan.
- The translate-button labels in E1.6 mirror real Spanish strings; EN keys deliberately empty per existing convention.

## Type consistency

- `AuthorStatus` = `"read" | "currently_reading" | "discovery"` — used consistently across map-state.ts, promote.ts, RPC, i18n.
- `Filter` = `"all" | "read" | "currently_reading" | "discoveries"` — preserves existing plural "discoveries" for the filter (matches `MapFilter.tsx` and i18n keys).
- `promoteSuggestion()` signature matches the RPC arg names (`p_suggestion_id`, `p_author`, `p_books`).
- `MapLabels["status"]` keys (`read`, `currently_reading`, `discovery`) match the AuthorStatus values exactly.

## Risks worth flagging to the implementer

1. **Task B6 + B8 require an admin re-bootstrap** after `dev:db:reset`. Easy to forget; the verify step will fail silently (no pending count, no nav badge) until you do it.
2. **Task C4** — the `AdminAwareNav` polling uses `setInterval(... 60_000)`. If the user keeps the page open across a sign-out from another tab, the next poll will 401. The component already handles `onAuthStateChange` for signout, but a defensive guard inside the poll callback could be added if needed.
3. **Task D5** — the smoke test requires a real `DEEPL_API_KEY` for a fully-passing curl. Without the key, the function correctly returns `translation_failed` — that's also a valid "function works, key missing" pass.
4. **Task E2.1** — the largest single edit. The `formMarkup` extraction is a delicate refactor. Do it carefully; the type-check after is the safety net.
