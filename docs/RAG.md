# docs/ index (RAG)

Lookup table for everything in `docs/`. Keep this current when adding, renaming, or removing files.

| Filename | Short description | When to use |
| --- | --- | --- |
| `00-mvp-plan.md` | The **what** of the MVP: scope, stack at-a-glance, architecture overview, data model sketch, style direction, suggestion + admin workflow, map UX with filter, free-tier risks, verification plan, open questions. | Start here for any new contributor or new session. Read first when scoping a feature or checking whether something is in/out of MVP. |
| `01-implementation-plan.md` | The **how** and **in what order**: staged delivery plan (Stage 0–10), branching strategy (master/development/feature-NN), workflow rules, definition of done per stage, verification steps per stage. | Read before starting any implementation work. Use to pick the next stage, scope a branch, or check the "done" bar for the current stage. |
| `adr/0001-tech-stack.md` | Decision record for the technical stack — Astro, React island, Tailwind, Supabase, Turnstile, Resend, Cloudflare Pages, Capacitor (later). Lists alternatives considered and trade-offs. | Use when challenging or extending a stack choice ("why not Next.js?", "should we add X service?"), or before introducing a new dependency. |
| `adr/0002-style-guide.md` | "Literary Salon" brand decision — palette tokens (ink, parchment, bone, oxblood + 3 map tints, ochre, **penguin** vintage accent, sage), CSS-variable wiring for one-file palette swaps, typography (Fraunces + Inter), motion, map highlight scale, contrast checks. | Use when building or reviewing any UI surface, picking a new color, adding a font, tweaking the map fills, or proposing a visual change. |
| `adr/0003-data-model.md` | Decision record for the Supabase schema: 6 tables (countries, authors, books, book_links, suggestions, subscribers), `authors.status` enum (read/discovery) driving the map filter, RLS policy approach, indexes, locale-column strategy. | Use when writing migrations, designing queries, adding a new field, or modifying RLS. Source of truth for the schema shape. |
| `RAG.md` | This file. Index of docs with short descriptions and when-to-use guidance. | Use to locate the right doc fast, or as the first read when arriving in `docs/`. Update whenever a doc is added, renamed, removed, or materially repurposed. |
