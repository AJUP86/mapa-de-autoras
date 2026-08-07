# ADR 0001 — Tech stack

- **Status:** Accepted
- **Date:** 2026-05-26
- **Supersedes:** —

## Context

`mapa-de-autoras` is a landing page for a content creator focused on female book writers worldwide. It needs: bilingual content (ES/EN), an interactive world map (click-a-country → author list), a public "suggest an author" form gated by CAPTCHA + newsletter opt-in, an admin area for the owner to approve suggestions, and email notifications. Constraints: single developer, **free-tier only**, mobile-first, must remain wrappable as a Capacitor native app in a later phase, **avoid over-engineering**.

## Decision

| Concern               | Choice                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------ |
| Frontend framework    | **Astro 5** (static output)                                                                |
| Map island            | **React 18** + **`@vnedyalk0v/react19-simple-maps`** (active fork of the dormant original) |
| Map data              | **`world-atlas/countries-110m.json`** (Natural Earth, public domain)                       |
| Styling               | **Tailwind CSS**                                                                           |
| i18n                  | Astro built-in (`locales: ["es","en"]`, `defaultLocale: "es"`)                             |
| Backend / DB / Auth   | **Supabase** (Postgres + magic-link Auth + RLS + Edge Functions + DB Webhooks)             |
| Bot defense           | **Cloudflare Turnstile**                                                                   |
| Email — transactional | **Resend** (free tier: 3 000/mo, 100/day)                                                  |
| Email — newsletter    | **Resend Broadcasts** (free: 1 000 contacts, unlimited sends)                              |
| Frontend hosting      | **Cloudflare Pages** free tier                                                             |
| Liveness              | Weekly GitHub Actions cron pinging Supabase (free-tier projects pause after 7 days idle)   |
| Future native         | **Capacitor** wrapping Astro's static `dist/`                                              |

## Alternatives considered

- **Next.js (App Router).** Forces `output: 'export'` for a Capacitor wrap, which disables Image Optimization, ISR, middleware, route handlers, **and** the built-in i18n. Half of the App Router's value disappears for our use case.
- **MapLibre GL / Leaflet.** Real pan/zoom tile maps. Heavier (WebGL or tile server dependency), harder to brand, overkill for "show authors per country" UX.
- **Original `zcreativelabs/react-simple-maps`.** Dormant since 2022; React 19 compatibility issue open and unanswered.
- **Google reCAPTCHA v3.** Free tier cut to 10 000/mo in 2024; sets tracking cookies (GDPR friction for an ES/EN audience). Turnstile wins on every axis.
- **Brevo / Postmark.** Brevo's free cap is shared across transactional + marketing; Postmark's 100/month free plan is sandbox-only.
- **Headless CMS (Sanity, Strapi).** Introduces a second service for the owner to learn and us to maintain. A small custom admin page in the same Astro app is simpler.
- **Self-hosted VPS.** Adds OS/cert/backup maintenance. Free-tier managed services are a strictly better starting point.

## Consequences

**Positive**

- Zero monthly cost at launch; predictable upgrade path on every layer.
- Static output means SEO and Lighthouse scores are easy wins.
- One vendor for DB + Auth + serverless (Supabase) and one for email (Resend) keeps the mental model tight.
- The map is the _only_ JS island, so bundle size stays small.
- Capacitor wrap is a near-drop-in for phase 2.

**Negative / risks**

- Supabase free projects pause after 7 days of DB inactivity. **Mitigation:** weekly GitHub Actions heartbeat.
- Resend's 100 emails/day cap could bite during a viral submission spike. **Mitigation:** broadcasts are not counted against this; transactional volume is unlikely to approach it.
- We depend on a community fork (`@vnedyalk0v/react19-simple-maps`). **Mitigation:** documented fallback path — ~80 LOC `d3-geo` + `topojson-client` component with identical props.

## References

- [docs/00-mvp-plan.md](../00-mvp-plan.md) — full MVP plan
- [Astro i18n docs](https://docs.astro.build/en/guides/internationalization/)
- [somenoe/astro-capacitor-poc](https://github.com/somenoe/astro-capacitor-poc)
- [react-simple-maps issue #367 (React 19)](https://github.com/zcreativelabs/react-simple-maps/issues/367)
- [@vnedyalk0v/react19-simple-maps](https://github.com/vnedyalk0v/react19-simple-maps)
- [topojson/world-atlas](https://github.com/topojson/world-atlas)
- [Natural Earth terms of use](https://www.naturalearthdata.com/about/terms-of-use/)
- [Supabase pricing](https://supabase.com/pricing)
- [Cloudflare Turnstile plans](https://developers.cloudflare.com/turnstile/plans/)
- [Resend pricing](https://resend.com/pricing)
