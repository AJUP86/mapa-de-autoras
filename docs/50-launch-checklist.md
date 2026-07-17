# Launch checklist — `mapadeautoras.com`

Living document tracking everything that must land BEFORE the first production deploy of `mapadeautoras.com`. Ordered by dependency. Update as items complete.

Complementary to:
- [docs/STATUS.md](STATUS.md) — session log + roadmap snapshot
- [docs/01-implementation-plan.md](01-implementation-plan.md) — stage-by-stage delivery plan
- [docs/30-ops/staging-deploy.md](30-ops/staging-deploy.md) — staging runbook (production runbook will fork from this)

---

## Owner + voice

- **Owner:** Danny (writer + curator of the map).
- **Voice on all public copy:** first person, intimate. Danny writes to visitors as herself, not through a third-person narrator.
- Prefer: "las autoras que leo", "te comparto", "estoy leyendo".
- Avoid: "el mapa muestra", "las autoras que Danny lee", "les compartimos".

---

## Blocking launch (in dependency order)

### 1. Content refinements — Spanish + English pass

- [ ] Replace **"tinte" → "color"** in ES copy (grep `src/i18n/es.json` for `tinte`; also check any `.astro` pages with hard-coded ES).
- [ ] Replace **"Promotar" → "Promover"** everywhere in ES copy. Correct Spanish verb.
  - Grep targets: `Promotar`, `promotar`, `promotando`, etc.
- [ ] **First-person voice pass** on all public copy — hero, subhead, empty states, thanks page, suggest form, admin login (no — admin stays neutral).
  - Files: `src/i18n/es.json`, `src/i18n/en.json`.
  - Key namespaces: `hero.*`, `map.subhead`, `map.panel.empty`, `map.eyebrow`, `thanks.*`, `suggest.*`, `about.*` (new).
- [ ] English translations mirror the tone (Danny-first-person; e.g., "the writers I read" not "the writers Danny reads").
- [ ] Verify no `.astro` page hard-codes Spanish strings that should be in i18n.

### 2. About page — "Conóceme"

- [ ] Create `src/pages/conoceme.astro` (ES).
- [ ] Create `src/pages/en/about.astro` (EN).
- [ ] Add i18n keys under a new `about.*` namespace: `about.title`, `about.eyebrow`, `about.body`, `nav.about`.
- [ ] Add "Conóceme" / "About" link to `<AdminAwareNav>` public-nav variant (next to Suggerir / Sugerir).
- [ ] Content provided by Danny: bio, why-this-project, contact / social (IG handle at minimum).
- [ ] Layout: same base + typography as `/suggest`; photo optional.

### 3. Newsletter (Stage 8 — elevated to launch-blocking)

- [ ] Existing `subscribers` table + double-opt-in Edge Function per the original Stage 8 spec in `docs/01-implementation-plan.md`.
- [ ] Newsletter capture form on `/` (bottom of page or footer) + a dedicated `/newsletter` page for direct linking.
- [ ] Confirmation email (via Resend) + thanks page after confirmation.
- [ ] Uses the same Resend account provisioned in Stage 9b (single account, shared audience).
- [ ] Note: Stage 8 was originally standalone; can now share Resend infra with 9b.

### 4. Remove `/styleguide` from production

- [ ] Delete `src/pages/styleguide.astro` (simplest — reversible via git if we ever want it back).
- [ ] Move any palette/tokens reference material into `docs/adr/0002-style-guide.md` (already documents the palette) or a new `docs/styleguide-reference.md` if screenshots would help.
- [ ] Update `src/pages/index.astro` footer link (references `/styleguide` — change or remove).
- [ ] Update `src/pages/en/index.astro` footer link too.
- [ ] Verify `npm run build` still passes.

### 5. Content seed strategy — production DB starts empty

- [ ] `supabase/seed.sql` (countries) is the ONLY seed committed to the repo.
- [ ] `supabase/seeds/dev-authors.sql` stays as **local-only dev fixture** (not applied to hosted).
- [ ] Production DB (`mapa-prod`) starts with countries + zero authors.
- [ ] Danny promotes real authors via `/admin/promote` after 9b deploy. Nothing tracked in code.
- [ ] Before launch: verify no test/dev rows leaked into `mapa-prod` (check via Studio table editor).

### 6. Production deploy (Stage 9b)

Full 9b spec lives in `docs/01-implementation-plan.md`. Checklist form here:

- [ ] Provision `mapa-prod` Supabase project in `eu-west-1`.
- [ ] `supabase link --project-ref <prod-ref>` + `supabase db push` — replays migrations 0001-0008 (+ any later ones landed by then).
- [ ] Run `supabase/seed.sql` on `mapa-prod` via Studio SQL editor (countries only, 249 rows).
- [ ] Bootstrap Danny's admin user via Studio → Auth → Add user → SQL update to set `role = admin`.
- [ ] Deploy 3 Edge Functions to `mapa-prod`: `submit_suggestion`, `notify_owner`, `translate`.
  - Use `--no-verify-jwt` on `translate` (same fix as 9a).
- [ ] Set function env vars via dashboard:
  - `TURNSTILE_SECRET_KEY` (share with staging or use a separate widget)
  - `DEEPL_API_KEY` (share with staging)
  - `RESEND_API_KEY` (real key from verified Resend account)
  - `RESEND_FROM_EMAIL` (e.g., `hola@mapadeautoras.com`)
  - `OWNER_NOTIFICATION_EMAIL` (Danny's email)
- [ ] Configure Supabase auth `site_url` = `https://mapadeautoras.com` + redirect URLs for `/` + `/admin` + `/admin/inbox`.
- [ ] **Pivot `notify_owner` from pg_net trigger to Supabase Database Webhook** (dashboard-configured per environment). Solves the `app.functions_url` GUC restriction we deferred in 9a. Webhook fires on INSERT to `public.suggestions` → POSTs to `notify_owner` function URL.
- [ ] Create SEPARATE Cloudflare Pages project `mapa-de-autoras-prod` (NOT reuse staging project).
- [ ] Pages production branch = `master`.
- [ ] Pages env vars in Production scope: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`, `NODE_VERSION=22`.
- [ ] Add `mapadeautoras.com` + `www.mapadeautoras.com` as custom domains on the Pages project.
- [ ] Resend domain auth on `mapadeautoras.com` — SPF/DKIM/DMARC records via Cloudflare DNS (same account, one-click).
- [ ] Turnstile: extend the widget to include the two prod hostnames (or create a separate prod widget for cleaner separation).
- [ ] Add `PROD_SUPABASE_URL` + `PROD_SUPABASE_ANON_KEY` to GitHub Actions secrets.
- [ ] Extend `.github/workflows/heartbeat.yml` matrix to include the production entry.
- [ ] Smoke test end-to-end on production: submit real suggestion → Danny gets real email → login → promote → author appears on map via Realtime.

### 7. Launch polish (Stage 10 essentials)

- [ ] `public/og-image.png` — 1200×630, includes map + title + "mapa de autoras".
- [ ] Favicons: `public/favicon-{16,32,192,512}.png` + `public/favicon.ico` + `public/apple-touch-icon.png`.
- [ ] `public/site.webmanifest` — name, short_name, theme_color, background_color, icons array.
- [ ] Update `src/layouts/Base.astro` to include OG meta tags (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `twitter:card`) per locale.
- [ ] Meta descriptions per page — new i18n keys `meta.description.home`, `meta.description.suggest`, `meta.description.about`.
- [ ] Privacy policy — `src/pages/privacidad.astro` + `src/pages/en/privacy.astro`. Minimal GDPR: what data (email for suggestions + newsletter), lawful basis (consent), retention, contact for GDPR requests.
- [ ] `public/robots.txt` — allow all, point to sitemap.
- [ ] Sitemap: `@astrojs/sitemap` already generates it. Verify it includes the new About + privacy pages after they land.
- [ ] Lighthouse audit on production URL — target ≥90 on Performance, Accessibility, Best Practices, SEO.
- [ ] Mobile QA on real device (Danny's iPhone or equivalent).
- [ ] Email deliverability check: Danny sends herself a test suggestion from prod → confirms Resend email arrives in inbox (not spam).

---

## Traffic readiness

**Cloudflare Pages:** unlimited free-tier requests. No concern.

**Supabase free-tier ceilings vs. projected launch traffic:**

| Limit | Value | Projected launch load | Verdict |
|---|---|---|---|
| DB size | 500 MB | ~1 MB (dozens of authors) | ✅ Fine |
| Egress | 2 GB / month | ~250 MB (5000 visitors × 50 KB catalog) | ✅ Fine |
| Edge Function invocations | 500k / month | Suggestion + translate calls, dozens/day | ✅ Fine |
| **Realtime concurrent connections** | **200** | **See below** | **⚠️ Worth watching** |
| Auth MAU | 50k | Just Danny | ✅ Fine |

**Realtime concurrent limit deep dive:**

- Each open public tab = 1 Realtime WebSocket connection (from 9a-ii architecture).
- With 2000+ IG followers, launch-day burst estimates:
  - Sustained: ~30-50 concurrent viewers.
  - Peak (right after IG announcement post): ~100-150 concurrent.
- **Comfortable up to ~150; above 200, new visitors get initial fetch but no live updates (graceful degrade — no error).**

**Mitigations, cheapest first:**

1. **Do nothing** — free tier is fine for weeks 1-4. Realtime degrades gracefully. Upgrade when we see it happen in practice.
2. **Downgrade public Realtime to 30s polling** — only admin uses WebSocket. Removes concurrent-connection risk entirely. ~1-2h refactor to `MapSection`.
3. **Supabase Pro plan ($25/mo)** — 500 concurrent Realtime + more of everything. Buys room without architectural changes.

**Recommendation:** launch on option 1 (do nothing). Watch traffic for two weeks. If we hit the ceiling, upgrade to Pro.

---

## Definition of done — launch-ready

- [ ] `https://mapadeautoras.com` loads over HTTPS with valid cert.
- [ ] Danny logged in as admin on production; her real bio is on `/conoceme`.
- [ ] 5-10 real authors promoted, visible on the map.
- [ ] Suggestion form submits, triggers real Resend email to Danny's inbox (not spam).
- [ ] Admin magic-link login works end-to-end on production URL.
- [ ] All Spanish copy uses "Promover" not "Promotar", "color" not "tinte", first-person voice.
- [ ] `/styleguide` returns 404.
- [ ] `/conoceme` (ES) + `/en/about` render correctly with Danny's content.
- [ ] Newsletter opt-in flow works end-to-end (submit → confirmation email → click link → subscribed).
- [ ] Privacy policy pages exist at `/privacidad` + `/en/privacy`.
- [ ] OG image renders correctly when the site URL is pasted into WhatsApp / Instagram DM / Twitter compose.
- [ ] Favicons appear correctly in browser tabs + iOS "Add to Home Screen".
- [ ] Lighthouse ≥90 on Performance, Accessibility, Best Practices, SEO.
- [ ] Realtime map still works end-to-end (regression check: promote in tab 1, watch tab 2 update).
- [ ] Heartbeat workflow matrix runs green for BOTH staging and production entries.

---

## Post-launch backlog (iterate after launch)

Moved out of "MVP roadmap" — not launch-blocking; addressed once the site is live and taking traffic.

- **List view of authors + books by country** — user-suggested; adds a scan-in-list surface alongside the map. Small implementation, high UX value for people who want to browse without the map interaction.
- **Stage 7b-ii — Author CRUD** — edit/delete existing authors + add-more-books-to-existing. Danny can work around via re-promote for now; do it when the promote-only workflow becomes painful.
- **Realtime pending-count badge on `<AdminAwareNav>`** — currently polls every 60s; upgrade using the 9a-ii Realtime infra. Draft plan already sketched in the WIP STATUS section under "Stage 9a-iii".
- **HTML email template for `notify_owner`** — richer than plain-text; deep-link to `/admin/inbox?focus=<id>`, country flag, formatted submitter info. Small polish once Resend is live.
- **Reply-in-email actions** — magic-token approve/reject from notification email. Adds security surface (token expiry, single-use); not launch-critical.
- **Multi-channel notifications** — Slack / Telegram webhook alongside email. Only needed if email proves unreliable.
- **Basic analytics** — Plausible ($9/mo) or Cloudflare Web Analytics (free, less detailed). Danny will want visitor numbers.
- **Error monitoring** — Sentry free tier. Catches runtime errors on the public site that would otherwise go unnoticed.

---

## How to work this checklist

- Update items with `- [x]` as they complete.
- Add discovered items under the appropriate section.
- When an item spans multiple sessions, add a short session-log note in `docs/STATUS.md` as usual.
- When ALL "Blocking launch" items check off + Definition of done passes: production is ready. Merge to `master`, deploy, tell Danny to post on Instagram.
