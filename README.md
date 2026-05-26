# mapa-de-autoras

A bilingual (ES/EN) landing page mapping **female book writers around the world**. Click a country to see its curated author list and links to buy their books; suggest new authors via a moderated submission flow.

> Status: pre-MVP — foundations and plan are being established. No application code yet.

## Repository layout

```
.
├── README.md              ← you are here
├── LICENSE
├── docs/                  ← committed: long-lived project documentation
│   ├── 00-mvp-plan.md     ← MVP plan (current source of truth)
│   └── adr/               ← Architecture Decision Records
│       ├── 0001-tech-stack.md
│       ├── 0002-style-guide.md
│       └── 0003-data-model.md
├── src/                   ← (planned) Astro frontend
├── supabase/              ← (planned) migrations + edge functions
│   ├── migrations/
│   └── functions/
├── .github/workflows/     ← (planned) deploy + Supabase heartbeat
└── .work/                 ← LOCAL ONLY (gitignored): scratch, notes, research dumps
```

## Documentation conventions

- **`docs/`** is for documentation that should outlive a single session: the plan, ADRs, runbooks, schema reference. Always committed.
- **`docs/adr/`** holds Architecture Decision Records — short, focused, dated docs for each material decision. Format: Context → Decision → Alternatives → Consequences. Numbered (`0001`, `0002`, …) and never deleted; superseded ADRs are marked as such.
- **`.work/`** is for scratch: raw brainstorming, agent research output, screenshots, half-baked ideas, vendor docs you've copied to skim. **Gitignored.** Anything worth keeping past a session graduates into `docs/`.

## Tech stack (summary)

Astro 5 (static) · React island for the map · Tailwind CSS · Supabase (Postgres + Auth + Edge Functions) · Cloudflare Turnstile · Resend · Cloudflare Pages. See [docs/adr/0001-tech-stack.md](docs/adr/0001-tech-stack.md) for rationale.

## Getting started

> Scaffold is not yet in place. Setup instructions land here once `package.json` exists.

## License

See [LICENSE](LICENSE).
