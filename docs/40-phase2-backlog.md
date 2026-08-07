# Phase 2 backlog

Ideas that came up during MVP design sessions but were deferred to keep the MVP scope contained. Not prioritized — revisit after launch (post-Stage 10).

Each item names where it was discussed and why it's not in MVP. When picking one up, write a real spec/plan; this file is a memory aid, not a backlog grooming tool.

---

## Admin productivity

### Wikidata autocomplete for book titles

**Discussed in:** Stage 7b-i brainstorming (2026-06-09).
**Why deferred:** Wikidata SPARQL is complex to query reliably, Spanish coverage varies, adds an external dependency. MVP volume (handful of authors) doesn't justify the cost. Manual entry is fine.
**Where to add it later:** `<BookFields>` title input — autocomplete dropdown calls a thin Edge Function that proxies SPARQL.

### Editable email templates

**Discussed in:** Stage 7b-i brainstorming.
**Why deferred:** Default templates are sufficient for MVP. Editing requires a settings page + template engine + preview.
**Where to add it later:** `/admin/settings/templates`, persists overrides to a new `email_templates` table.

### Bulk operations on the inbox

**Why deferred:** Volume too low at launch.
**Where to add it later:** Checkboxes on `<AdminInbox>` rows + bulk-action toolbar.

### Reply-in-email actions on notify_owner

**Why deferred:** Adds signed-token security surface (expiry, single-use, RLS check). Owner login + click-through to admin inbox is fine for MVP volume.
**Where to add it later:** Magic-token links inside notification email — Approve / Reject buttons hit a new Edge Function that validates the one-time token and calls `promote_suggestion()` or `update suggestions set status='rejected'`.

### Suggestion consolidation

**Discussed in:** Stage 7b-i brainstorming.
**Why deferred:** Manual rejection is fine until painful (Danny rejects sibling suggestions one-by-one for now).
**Where to add it later:** When promoting an author, the RPC auto-rejects pending suggestions matching `(lower(name), country_iso_a3)` with `reviewer_notes = "merged into <author_id>"`. Could also surface aggregated book hints from siblings in the promote form.

### Add books to existing author

**Discussed in:** Stage 7b-i brainstorming.
**Why deferred to 7b-ii:** Logical home is the author edit page (7b-ii territory). Promote form deliberately stays narrow.

---

## Content & UX

### Quote-of-the-day / carousel content sections

**Discussed in:** Stage 7b-i brainstorming.
**Why deferred:** Not an MVP promise. Adds CMS-like content surface that the map alone doesn't need.

### Launch ritual / "recién añadida" UX

**Why deferred:** Polish.
**Where to add it later:** A small animation/badge on newly-added authors visible for N days; the `created_at` column already supports the query.

### Author detail pages

**Why deferred:** Phase 2 per the MVP plan.
**Where to add it later:** `/autoras/<slug>` (the slug column exists in `authors` but no page consumes it yet). Full bio, all books, retailer links, photos.

### Reading impressions / personal notes

**Discussed in:** Stage 7b-i brainstorming.
**Why deferred:** Personal commentary surface beyond the bio. Requires a new column or table + admin UI.

### Search across authors + books

**Why deferred:** Map-first navigation is MVP. Postgres FTS or trigram index makes this cheap when needed.

### Third locale (e.g., Portuguese, en-LATAM)

**Why deferred:** Astro i18n + DeepL Edge Function both scale to N locales. Wait for demand signal.

---

## Operations & infrastructure

### Inactivity logout

**Discussed in:** Stage 7b-i brainstorming.
**Why deferred:** Single-admin laptop; default 30-day refresh window acceptable for MVP.
**Where to add it later:** Small React component watching `mousemove`/`keydown` events, calls `supabase.auth.signOut()` after N idle hours.

### Realtime pending-count badge + live inbox

**Discussed in:** Stage 7b-i brainstorming. Design drafted as **Stage 9a-iii** after 9a-ii wired Realtime for the public map.
**Why deferred (still):** 60-second polling is fine for MVP; the live version is queued as Stage 9a-iii, not yet built.
**Where to add it later:** reuse the 9a-ii plumbing — `<AdminInbox>` + `<AdminAwareNav>` subscribe to `postgres_changes` on `public.suggestions` (admin JWT + RLS) and refetch-on-change, replacing the 60s poll; a migration adds `suggestions` to the `supabase_realtime` publication.

### i18n maintenance UI

**Discussed in:** Stage 7b-i brainstorming.
**Why deferred:** Owner doesn't need to edit labels mid-flight. Code-time edits are fine.

### Plausible analytics

**Why deferred:** Per `00-mvp-plan.md`; not MVP.

### Per-book `read` flag

**Why deferred:** Per `00-mvp-plan.md`; only matters if the panel needs to distinguish "read" vs "to-read" books per author.

### Capacitor native wrapper

**Why deferred:** Per `00-mvp-plan.md`; phase 2.

### HTML email template for `notify_owner`

**Why deferred:** MVP-internal — owner gets plain-text suggestion payloads via Resend (Stage 9b). HTML template with deeplink to `/admin/inbox?focus=<id>`, country flag, formatted submitter info adds polish but isn't launch-blocking.
**Where to add it later:** `supabase/functions/notify_owner/index.ts` — branch on `RESEND_API_KEY` presence, send HTML body via Resend's `html` field instead of `text`. Template can be inline JSX-like template literals or a small `template.ts` helper.

### Multi-channel notification sinks (Slack, Telegram)

**Why deferred:** Email-only is sufficient at MVP volume. Adding sinks is a config flag + parallel POST; only worth doing if email proves unreliable.
**Where to add it later:** `supabase/functions/notify_owner/index.ts` — branch on env vars (`SLACK_WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN`) and POST in parallel with the Resend email.

### SSR via Cloudflare adapter

**Discussed in:** Stage 7b-i brainstorming. Revisited in Stage 9a-ii.
**Why deferred:** Stage 9a-ii's "static shell + client-side fetch + Realtime" pattern resolved the build-time-vs-runtime-data tension that originally motivated SSR. Static output stays (speed + CDN); data is live via Realtime. SSR is now only worth revisiting if server-rendered HTML is specifically needed — e.g. per-author detail pages for SEO indexing of bios — or to remove the brief `<AdminAwareNav>` auth-check skeleton.
**Where to add it later:** `astro.config.mjs` → `output: 'server'` (or `'hybrid'` for per-route opt-in) + `@astrojs/cloudflare` adapter; move data-fetching / session-check server-side.

---

## Translation enhancements

### Formality toggle on translate button

**Discussed in:** Stage 7b-i brainstorming.
**Why deferred:** DeepL default formality is acceptable. Adding a per-field toggle adds UI complexity for a minor quality bump.

### LLM provider swap (Claude Haiku / GPT-4o-mini)

**Discussed in:** Stage 7b-i brainstorming.
**Why deferred:** DeepL is good enough for review-before-save. Swap if tone becomes a complaint — Edge Function abstraction makes this a ~20-line change with no UI impact.

### Translation memory cache

**Why deferred:** MVP volume too low to benefit.
**Where to add it later:** Hash source text + target_lang as cache key; store translations in a `translations` table; check before hitting DeepL.

---

## Author/book CRUD (7b-ii)

These items are not Phase 2 — they're the next stage. Listed here for reference only.

- Edit author (bio, dates, photo, status, published).
- Add books to existing author.
- Edit existing books and book_links.
- Delete authors / books / book_links with confirmation.
