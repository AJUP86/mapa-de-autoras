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
