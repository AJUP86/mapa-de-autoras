# ADR 0003 — Data model

- **Status:** Accepted
- **Date:** 2026-05-26
- **Supersedes:** —

## Context

The catalog needs to model **female authors per country**, their **books**, and **per-locale retailer links**. Visitors must be able to **suggest** new authors (gated by Turnstile + email + newsletter opt-in), with suggestions flowing into a moderation queue. A single admin owner approves/rejects, and a self-rolled double-opt-in newsletter is required.

Anonymous visitors get **read** access to published catalog only; the owner gets full CRUD; suggestion submission must work without an account. Row-Level Security is the natural enforcement mechanism on Supabase.

## Decision

Six tables in the public schema. Column names in English (code-friendly); UI strings localized separately. Bilingual fields are stored as `*_en` / `*_es` columns rather than a translations table — schema overhead is tiny at 2 locales and read performance is better.

### Tables

- **`countries`** — `iso_a3` (PK), `iso_numeric` (unique, for joining map TopoJSON), `name_en`, `name_es`, `display_label` nullable. Seeded.
- **`authors`** — `id`, `name`, `slug` (unique), `country_iso_a3` (FK), `bio_en`, `bio_es`, `photo_url` nullable, `birth_year`, `death_year` nullable, **`status`** enum (`read` | `discovery`) default `discovery`, `published` boolean default `false`, `created_at`. `status` drives the map filter: `read` = the owner has read at least one of this author's books; `discovery` = on her to-read list.
- **`books`** — `id`, `author_id` (FK), `title`, `original_language`, `year`, `cover_url` nullable, `description_en`, `description_es`, `display_order` int default 0.
- **`book_links`** — `id`, `book_id` (FK), `retailer` (enum: `amazon`, `bookshop`, `kobo`, `other`), `locale` (e.g. `es`, `en`, `es-AR`), `url`, `affiliate_tag` nullable. Decouples e-commerce links so we can add retailers without schema churn.
- **`suggestions`** — `id`, `submitter_email`, `submitter_name` nullable, `proposed_author_name`, `proposed_country_iso_a3` (FK), `proposed_books_text` (free text — we curate before adding), `note` nullable, `status` (`pending` | `approved` | `rejected`), `turnstile_verified` boolean, `accepted_newsletter` boolean, `created_at`, `reviewed_at` nullable, `reviewer_notes` nullable.
- **`subscribers`** — `id`, `email` (unique), `status` (`pending` | `confirmed` | `unsubscribed`), `locale`, `confirm_token`, `created_at`, `confirmed_at` nullable. Self-rolled double opt-in; confirmed emails sync to a Resend audience.

### Row-Level Security (prose)

All tables: RLS enabled; **no** default policies.

- **`anon` role** can:
  - `SELECT` from `countries`, `authors WHERE published = true`, `books`, `book_links`.
  - `INSERT` into `suggestions` (`status = 'pending'` enforced by `CHECK`).
  - `INSERT` into `subscribers` (`status = 'pending'`).
  - Nothing else.
- **`authenticated` role**, when the JWT email is in an `admins` table (or matches a hard-coded owner UID):
  - Full CRUD on every table.

A single Postgres function `is_admin()` is the common predicate. Suggestion approval is an admin-side `UPDATE` that flips `status` and a separate manual `INSERT` into `authors` / `books` (the admin "promote" form pre-fills from the suggestion).

### Indexes

- `authors (country_iso_a3, status) WHERE published` — supports map filter queries
- `authors (slug)`
- `books (author_id, display_order)`
- `book_links (book_id, locale)`
- `suggestions (status, created_at DESC)`
- `subscribers (status, email)`

## Alternatives considered

- **One translations table** keyed by `(table, row_id, locale, field)`. Flexible but adds a JOIN to every public read for two locales. Not worth it at this scale.
- **JSON columns** for bilingual fields (`{en, es}`). Tempting; loses simple SQL filtering and admin-form ergonomics. Reconsider only if locale count grows past 3.
- **Per-table admin policies.** Verbose; `is_admin()` helper keeps policies short and consistent.
- **Letting `anon` `SELECT` suggestions/subscribers.** Privacy-hostile and unnecessary — the public never reads these tables.
- **Per-book read status** (`books.read` boolean) instead of (or in addition to) author-level. Truer to reality but doubles the admin clicks per author and gives a coarser map signal anyway (the country panel cares about author categories, not per-book ticks). Defer to phase 2 if the owner asks for per-book ticks in the panel.

## Consequences

**Positive**
- Anonymous writes to `suggestions` and `subscribers` are safe by RLS construction — no server-side gatekeeping required.
- Bilingual reads are single-row, single-query.
- Adding a third locale is a schema migration, not a rewrite.
- Author-level status keeps the admin form trivial (one dropdown), and accepted suggestions default to `discovery` — the natural state for an author the owner hasn't read yet.

**Negative / risks**
- Adding a fourth locale starts to feel awkward — we'd revisit JSON or a translations table at that point.
- RLS bugs are silent (rows just don't appear). Mitigation: integration tests that hit each policy from each role.
- `book_links.retailer` enum will need migration as we add retailers — accept it; it's clearer than a free-text column.

## References

- [docs/00-mvp-plan.md § Data model](../00-mvp-plan.md)
- [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
