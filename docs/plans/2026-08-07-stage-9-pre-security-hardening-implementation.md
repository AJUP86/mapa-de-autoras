# Stage 9-pre — Security hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every P0 finding from the 2026-07-25 audit ([docs/audit25072026.md](../audit25072026.md)) so the codebase is safe to point at a production Supabase project in Stage 9b.

**Architecture:** Two feature branches in sequence. Branch 1 (`feature/09-pre-1-ci-and-hygiene`) installs the enforcement layer — CI, formatting baseline, green typecheck, build fail-fast, repo hygiene, admin de-indexing — so Branch 2's security changes land under CI protection. Branch 2 (`feature/09-pre-2-edge-function-auth`) fixes the three Edge Function auth holes (C1/C2/C3), hardens `submit_suggestion` (H2), and removes the undisclosed `subscribers` write + PII logging (H3). Each security task starts by **reproducing the attack locally** (red), then fixing (green) — the Edge Functions run on Deno, outside the vitest setup, so verification is curl-based repro/fix rather than unit tests (Deno/Playwright test infra is a P1/P2 item, deliberately out of scope here).

**Tech Stack:** Astro 5 + React islands (vitest for `src/`), Supabase Edge Functions (Deno, curl-verified via `supabase functions serve`), GitHub Actions, Cloudflare Turnstile, Resend.

**The spec for this plan is the audit itself** — section 7, items P0-1 through P0-9. Coverage map at the bottom of this document.

**Workflow reminders (project conventions, override anything below that conflicts):**

- Alejandro runs every `git commit` / `push` / `merge` himself. Steps below that say "Commit" mean: _pause, summarize the diff, hand to Alejandro with the suggested message_.
- Windows quirks: `supabase functions deploy` always needs `--use-api`; use `Invoke-RestMethod` or `curl.exe --data-binary "@file.json"` for JSON bodies (PowerShell mangles inline single-quoted JSON).
- After Branch 1 lands, run `npm run format` before handing off any Branch 2 diff — CI now enforces `prettier --check`.

---

## Branch 1 — `feature/09-pre-1-ci-and-hygiene`

Created from `development`. Estimated 2–3 h. Covers audit P0 items 5, 7, 8, 9 (+ the astro-check part of H4 needed to make CI green).

### Task 1: Remove `supabase/snippets/` from the repo

Three Supabase Studio scratch files are committed; two contain a real personal email address and one is the live admin-grant SQL. They don't belong in a public MIT repo. (The email stays in git history — treat it as disclosed; nothing to rotate.)

**Files:**

- Delete: `supabase/snippets/Untitled query 251.sql`
- Delete: `supabase/snippets/Untitled query 513.sql`
- Delete: `supabase/snippets/Untitled query 987.sql`
- Modify: `.gitignore`

- [ ] **Step 1: Delete the directory**

```bash
git rm -r "supabase/snippets"
```

- [ ] **Step 2: Ignore it going forward** — append to `.gitignore` after the existing Supabase block:

```gitignore
# Supabase CLI artifacts (local-only state, never committed)
supabase/.branches/
supabase/.temp/
supabase/.env
supabase/snippets/
```

(Only the `supabase/snippets/` line is new; the previous three lines already exist — add the new line inside that block.)

- [ ] **Step 3: Verify**

Run: `git status`
Expected: three deletions staged, `.gitignore` modified, nothing else.

- [ ] **Step 4: Commit (Alejandro)** — suggested: `chore: remove Studio scratch snippets from repo, gitignore the directory`

### Task 2: Prettier baseline + format scripts

`prettier --check .` currently fails on **88 files**. CI (Task 4) will enforce it, so baseline the whole repo first. Purely mechanical — review the diff by spot-check + green tests, not line-by-line.

**Files:**

- Modify: `package.json` (scripts)
- Modify: 88 files, mechanical (run, don't hand-edit)

- [ ] **Step 1: Add scripts** — in `package.json` `"scripts"`, after `"test:watch": "vitest"`:

```json
    "format": "prettier --write .",
    "format:check": "prettier --check ."
```

- [ ] **Step 2: Run the baseline format**

Run: `npm run format`
Expected: ~88 files rewritten, exits 0.

- [ ] **Step 3: Verify nothing broke**

Run: `npm test` → Expected: 28 passing.
Run: `npm run build` → Expected: clean build, 14 pages + admin pages.
Run: `npm run format:check` → Expected: `All matched files use Prettier code style!`

- [ ] **Step 4: Commit (Alejandro)** — suggested: `chore(format): prettier baseline across the repo + format scripts`

### Task 3: Make `astro check` green

34 errors today: 25 are Deno Edge Functions leaking into the Astro typecheck via `"include": ["**/*"]`; 9 are real `src/` errors (7× a mistyped test helper, 2× `Json` casts in `promote.ts`).

**Files:**

- Modify: `tsconfig.json`
- Modify: `src/lib/map-state.test.ts:10`
- Modify: `src/lib/promote.ts:7-8,47-51`
- Modify: `package.json` (script + dependency placement)

- [ ] **Step 1: Exclude the Deno world from the Astro typecheck** — `tsconfig.json`:

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist", "node_modules", "supabase/functions"],
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "paths": {
      "~/*": ["./src/*"]
    }
  }
}
```

- [ ] **Step 2: Fix the test helper** — `src/lib/map-state.test.ts:10`. The default parameter `id = status` makes TypeScript infer `id: AuthorStatus`, so passing `"a"`/`"b"`/`"c"` fails. Annotate `id` as `string`:

```ts
function author(status: AuthorStatus, id: string = status) {
  return { id, name: id, status, books: [] };
}
```

- [ ] **Step 3: Fix the RPC casts** — `src/lib/promote.ts`. The generated RPC signature wants `Json`, not `Record<string, unknown>`. Import `Json` and cast to it:

```ts
import { supabase } from "./supabase";
import type { AuthorStatus } from "./map-state";
import type { Json } from "~/types/supabase";
```

and in `promoteSuggestion`:

```ts
  const { data, error } = await supabase.rpc("promote_suggestion", {
    p_suggestion_id: suggestionId as unknown as string,
    p_author: author as unknown as Json,
    p_books: books as unknown as Json[],
  });
```

(The `p_suggestion_id` cast stays — known generator quirk, documented in STATUS.md. Replacing all hand-rolled row types with generated ones is audit P1-12, not this stage.)

- [ ] **Step 4: Add the `check` script and fix dependency placement** — `package.json`: add to scripts:

```json
    "check": "astro check",
```

and move `"@astrojs/check": "^0.9.9"` from `"dependencies"` to `"devDependencies"`.

- [ ] **Step 5: Verify**

Run: `npm install` (re-links after the dependency move)
Run: `npm run check` → Expected: **0 errors, 0 warnings** (hints are fine).
Run: `npm test` → Expected: 28 passing.

- [ ] **Step 6: Commit (Alejandro)** — suggested: `fix(types): green astro check — exclude Deno functions, fix test helper + Json casts`

### Task 4: CI workflow

One workflow, four gates, ~2 min per run. `development` auto-deploys to staging on push, so this is the only thing standing between a typo and a broken staging site.

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: CI

# Gate every PR and every push to the deploying branches. `development`
# auto-deploys to staging via Cloudflare Pages — this is the only check
# between a bad push and a broken staging site.

on:
  pull_request:
  push:
    branches: [development, master]

jobs:
  verify:
    runs-on: ubuntu-latest
    env:
      # `astro build` is data-independent (9a-ii), but astro.config.mjs
      # fails the build when these are absent — by design (audit P0-8).
      # CI builds against placeholders; real values live in Cloudflare Pages.
      PUBLIC_SUPABASE_URL: https://ci-placeholder.supabase.co
      PUBLIC_SUPABASE_ANON_KEY: ci-placeholder-anon-key
      PUBLIC_TURNSTILE_SITE_KEY: ci-placeholder-site-key
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run format:check
      - run: npm run check
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Verify locally that every gate passes** (CI must be born green)

Run: `npm run format:check && npm run check && npm test && npm run build`
Expected: all four exit 0.

- [ ] **Step 3: Commit (Alejandro)** — suggested: `ci: add build/typecheck/test/format gate on PRs and deploying branches`

- [ ] **Step 4: After the branch is pushed — verify the run + enable branch protection (Alejandro, GitHub UI)**
  1. Open the PR → the `verify` check should appear and pass.
  2. Settings → Branches → add rule for `development`: require status check `verify`; repeat for `master`.

### Task 5: Fail the production build on missing env vars

`src/lib/supabase.ts` falls back to `http://127.0.0.1:54321` with only a console.warn — a misconfigured Cloudflare Pages build **succeeds** and ships a dead site (this exact failure is in the staging runbook). The build is the right place to fail: check in `astro.config.mjs`, which runs at build start in Node context. Leave `supabase.ts`'s dev-time warn as is.

**Files:**

- Modify: `astro.config.mjs`

- [ ] **Step 1: Add the guard** — full new `astro.config.mjs`:

```js
// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

// Fail `astro build` loudly when the public runtime config is missing.
// Without this, a misconfigured Pages build succeeds and ships a site whose
// Supabase client silently points at 127.0.0.1 (see staging runbook).
// `loadEnv` merges .env files with process.env (process.env wins) — covers
// local builds, Cloudflare Pages, and CI placeholders alike.
if (process.argv.includes("build")) {
  const env = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "PUBLIC_");
  for (const name of [
    "PUBLIC_SUPABASE_URL",
    "PUBLIC_SUPABASE_ANON_KEY",
    "PUBLIC_TURNSTILE_SITE_KEY",
  ]) {
    if (!env[name]) {
      throw new Error(
        `[build] Missing required env var ${name}. Set it in .env (local) or the Pages project (hosted) — refusing to build a site that cannot reach Supabase.`,
      );
    }
  }
}

export default defineConfig({
  site: "https://mapadeautoras.com",
  output: "static",
  redirects: {
    "/": "/es/",
  },
  i18n: {
    locales: ["es", "en"],
    defaultLocale: "es",
    routing: {
      prefixDefaultLocale: true,
    },
  },
  integrations: [react(), sitemap({ filter: (page) => !page.includes("/admin") })],
  vite: {
    plugins: [tailwindcss()],
  },
});
```

(The `sitemap({ filter })` change belongs to Task 6 but lives in the same file — included here once so the file is written a single time; Task 6 verifies it.)

- [ ] **Step 2: Verify the failure path** (PowerShell)

```powershell
Rename-Item .env .env.bak
npm run build          # Expected: FAILS with "[build] Missing required env var PUBLIC_SUPABASE_URL"
Rename-Item .env.bak .env
npm run build          # Expected: clean build again
```

- [ ] **Step 3: Commit (Alejandro)** — suggested: `fix(build): fail astro build when PUBLIC_* env vars are missing`

### Task 6: Keep `/admin` out of search engines

Admin pages are currently in `dist/sitemap-0.xml` and allowed by robots.txt.

**Files:**

- Modify: `astro.config.mjs` (done in Task 5 — verify here)
- Modify: `public/robots.txt`
- Modify: `src/layouts/Base.astro`
- Modify: `src/pages/admin/index.astro`, `src/pages/admin/inbox.astro`, `src/pages/admin/promote.astro`, `src/pages/admin/suggestion.astro`

- [ ] **Step 1: robots.txt** — full new content:

```
# mapadeautoras.com — robots.txt
#
# Public content site: allow everything except the admin surface. /admin/*
# renders no private data to unauthenticated visitors (client-side auth
# gate), but it has no business in a search index either.

User-agent: *
Allow: /
Disallow: /admin

Sitemap: https://mapadeautoras.com/sitemap-index.xml
```

- [ ] **Step 2: `noindex` prop in the layout** — `src/layouts/Base.astro`. Extend Props:

```astro
interface Props {
  title?: string;
  description?: string;
  lang?: "es" | "en";
  noindex?: boolean;
}
```

destructure it (`noindex = false`) alongside the existing props, and add inside `<head>` after the description meta:

```astro
    {noindex && <meta name="robots" content="noindex, nofollow" />}
```

- [ ] **Step 3: Set it on all four admin pages** — in each of `src/pages/admin/{index,inbox,promote,suggestion}.astro`, add `noindex` to the `<Base ...>` opening tag, e.g. in `inbox.astro`:

```astro
<Base lang={lang} title={inboxLabels.title} noindex>
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Then (PowerShell):

```powershell
Select-String -Path dist/sitemap-0.xml -Pattern "admin"     # Expected: no matches
Select-String -Path dist/admin/inbox/index.html -Pattern "noindex"   # Expected: 1 match
```

- [ ] **Step 5: Commit (Alejandro)** — suggested: `fix(seo): exclude /admin from sitemap + robots, noindex admin pages`

**Branch 1 done →** open PR to `development` (the CI check runs on it), Alejandro reviews + merges. Branch 2 starts from the updated `development`.

---

## Branch 2 — `feature/09-pre-2-edge-function-auth`

Created from `development` after Branch 1 merges. Estimated 4–5 h including staging ops. Covers audit P0 items 1, 2, 3, 4, 6.

**Local setup for every task in this branch:**

```bash
npm run dev:db          # local Supabase
npm run dev:functions   # serves all functions with --env-file .env
supabase status         # shows local anon key + service_role key — copy both
```

### Task 1: Shared auth + CORS helpers

Four functions each hand-roll `CORS_HEADERS` with `Access-Control-Allow-Origin: *`, and two need the same service-role bearer check. Folders starting with `_` are not deployed as functions; `supabase functions deploy <name>` bundles `_shared` imports automatically.

**Files:**

- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/auth.ts`

- [ ] **Step 1: `cors.ts`** — origin allowlist; only browser-called functions (`submit_suggestion`, `translate`) use this:

```ts
// _shared/cors.ts — origin-allowlisted CORS for browser-called functions.
//
// Only submit_suggestion and translate are legitimately called from a
// browser. The notify_* functions are webhook-only and send NO CORS headers.

const ALLOWED_ORIGINS = new Set([
  "http://localhost:4321",
  "http://127.0.0.1:4321",
  "https://staging.mapadeautoras.com",
  "https://mapadeautoras.com",
  "https://www.mapadeautoras.com",
]);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://mapadeautoras.com",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, apikey, x-client-info",
  };
}
```

- [ ] **Step 2: `auth.ts`** — constant-time service-role bearer check. `.trim()` on both sides solves the whitespace fragility that made Stage 8 abandon strict matching; the length log (lengths only, never values) diagnoses the truncation case if it ever recurs:

```ts
// _shared/auth.ts — webhook caller authentication.
//
// Platform-level `verify_jwt = true` only proves the bearer is SOME valid
// project JWT — the public anon key passes that gate. Webhook-only functions
// must additionally require the bearer to BE the service-role key.

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export function isServiceRoleBearer(req: Request): boolean {
  const bearer = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!bearer || !serviceKey) return false;
  if (!timingSafeEqual(bearer, serviceKey)) {
    // Lengths only — never log key material. A length mismatch here means
    // the webhook UI truncated the pasted key (the Stage 8 failure mode).
    console.warn(
      `[auth] bearer/service-key mismatch (lengths ${bearer.length} vs ${serviceKey.length})`,
    );
    return false;
  }
  return true;
}
```

- [ ] **Step 3: Commit (Alejandro)** — suggested: `feat(functions): shared origin-allowlist CORS + service-role bearer helpers`

### Task 2: C1 — `translate` verifies the JWT signature

`translate` is admin-**user**-called (not a webhook), so it needs a real signature check, not the service-role bearer. Add a `requireAdmin(req)` helper to `_shared/auth.ts` that verifies the caller's JWT via `supabase.auth.getUser(jwt)` and asserts `app_metadata.role === 'admin'`. `verify_jwt` stays `false` (so the CORS preflight isn't rejected — the OPTIONS request strips Authorization); the in-function check is now cryptographic, not a base64 decode.

**Files:**

- Modify: `supabase/functions/_shared/auth.ts` (add `requireAdmin`)
- Modify: `supabase/functions/translate/index.ts` (auth block + CORS)
- Modify: `supabase/config.toml` (`[functions.translate]` comment)
- Modify: `supabase/README.md:120`, `supabase/README.md:161`

- [ ] **Step 1: Reproduce the vulnerability (red)** — forge an unsigned "admin" JWT and call the function:

```bash
FORGED="x.$(printf '{"app_metadata":{"role":"admin"}}' | base64 | tr '+/' '-_' | tr -d '=').x"
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  http://127.0.0.1:54321/functions/v1/translate \
  -H "Authorization: Bearer $FORGED" -H "Content-Type: application/json" \
  -d '{"text":"hola","target_lang":"EN"}'
```

Expected **before the fix: `200`** (the forged token is trusted). This is the bug.

- [ ] **Step 2: Add `requireAdmin` to `_shared/auth.ts`** — cryptographic verification via `getUser`:

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// Admin USER auth (for browser-called admin functions like translate).
// getUser() validates the JWT signature against the project server-side;
// then we assert the admin role from the verified claims.
export async function requireAdmin(req: Request): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return false;
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anon) return false;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data: { user }, error } = await sb.auth.getUser(jwt);
  if (error || !user) return false;
  return (user.app_metadata as Record<string, unknown> | undefined)?.role === "admin";
}
```

- [ ] **Step 3: Rewrite the auth block in `translate/index.ts`** — delete the `decodeJwtPayload` helper; use `corsHeaders(req)` + `requireAdmin`. Have `json()` take the cors headers as an argument (small refactor — it currently closes over a module const):

```ts
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
  if (!(await requireAdmin(req))) return json({ error: "unauthorized" }, 401, cors);
  // …unchanged: parse body, validate text/target_lang, call DeepL…
});
```

- [ ] **Step 4: Fix the config comment + README.** Update the `[functions.translate]` block comment in `config.toml` to say the signature is verified in-function via `getUser` (not "decodes the bearer"). Fix `supabase/README.md:120` (claims `verify_jwt = true` — it's false + in-function `getUser`) and `:161`.

- [ ] **Step 5: Verify (green).** Re-run the Step 1 forged-token curl → **`401`**. Then with a real admin session token (copy from browser DevTools after logging into `/admin`) → `200` translated text (or `502` if `DEEPL_API_KEY` unset locally — still proves auth passed). Confirm the OPTIONS preflight still returns `204`.

- [ ] **Step 6: Commit (Alejandro)** — suggested: `security(translate): verify JWT signature in-function via getUser (C1)`

### Task 3: C2 — `notify_owner` is no longer an open relay

Migration `0003` promised an `X-Webhook-Source` header check the function never implemented; CORS is `*` and any POST sends an email to Danny's inbox with attacker-controlled subject/body. `notify_owner` is webhook-only → require the service-role bearer (`_shared/auth.ts`) and send **no** CORS headers.

**Files:**

- Modify: `supabase/functions/notify_owner/index.ts`
- Modify: `supabase/README.md:104-107`

- [ ] **Step 1: Reproduce (red)** — unauthenticated POST:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  http://127.0.0.1:54321/functions/v1/notify_owner \
  -H "Content-Type: application/json" \
  -d '{"type":"INSERT","table":"suggestions","record":{"id":"1","proposed_author_name":"x","proposed_country_iso_a3":"ESP","submitter_email":"a@b.c","submitter_name":null,"proposed_books_text":null,"note":null,"accepted_newsletter":false,"created_at":"2026-01-01"}}'
```

Expected **before: `200`** (log-only or a real send). This is the relay.

- [ ] **Step 2: Gate on the service-role bearer + drop CORS.** Add near the top of the handler (after method guards):

```ts
import { isServiceRoleBearer } from "../_shared/auth.ts";
// …
if (!isServiceRoleBearer(req)) return json({ error: "unauthorized" }, 401);
```

Remove `Access-Control-Allow-Origin: *` from this function entirely (no browser calls it). Keep the OPTIONS 204 for accidental preflights but advertise no `Allow-Origin`.

- [ ] **Step 3: Remove the PII log line (H3, part b).** Delete the `console.log("  Body:\n${text}")` branch that dumps the submitter's email + message to function logs when `RESEND_API_KEY` is empty (the current staging state). Log a non-PII marker instead (`"[notify_owner] log-only mode (no RESEND_API_KEY)"`).

- [ ] **Step 4: README.** Rewrite `supabase/README.md:104-107` — the known-gap note becomes "closed: service-role bearer required." Note that the `X-Webhook-Source` header approach in migration `0003` was superseded (historical migration text; do not edit applied migrations).

- [ ] **Step 5: Verify (green).** Re-run Step 1 → **`401`**. With `-H "Authorization: Bearer <local service_role key from \`supabase status\`>"`→`200` log-only (no PII in the logged output).

- [ ] **Step 6: Commit (Alejandro)** — suggested: `security(notify_owner): require service-role bearer, drop CORS *, stop PII logging (C2/H3)`

> **Stage 9b follow-up (not this plan):** wire the Database Webhook on `suggestions INSERT` → `notify_owner` with the service-role bearer. The function is now ready for it.

### Task 4: C3 — `notify_submitter` pins config + bearer check

The function accepts **any** non-empty bearer and has **no `[functions.notify_submitter]` block** in `config.toml`, so nothing pins `verify_jwt`. Even with it on, the public anon key passes. Pin the config and require the service-role bearer.

**Files:**

- Modify: `supabase/config.toml` (add the block)
- Modify: `supabase/functions/notify_submitter/index.ts`

- [ ] **Step 1: Pin the config.** Add:

```toml
[functions.notify_submitter]
enabled = true
verify_jwt = true
```

- [ ] **Step 2: Replace the "any bearer" check** with `isServiceRoleBearer(req)` from `_shared/auth.ts` (returns 401 otherwise).

- [ ] **Step 3: Fix the revert-on-failure idempotency hole.** Today a Resend failure reverts `notified_at = null`, reopening the send window (duplicate email on send-then-timeout). Change to **no revert**: on Resend failure, leave `notified_at` set, log the failure loudly for manual retry. At-most-once is the correct bias for outbound email. (Document the trade-off in a comment.)

- [ ] **Step 4: Verify (green).** POST with no bearer → `401`; POST with the anon key as bearer → `401`; POST with the service-role bearer → processes (or `200` skip if guards short-circuit).

- [ ] **Step 5: Commit (Alejandro)** — suggested: `security(notify_submitter): pin verify_jwt + service-role bearer, no-revert idempotency (C3)`

> **Stage 8.5 note:** the refactor rewrites this function's body for per-book outcomes but **reuses `isServiceRoleBearer` unchanged** — this hardening survives the rewrite.

### Task 5: H2 — `submit_suggestion` input validation + Turnstile hostname

Only `authorName` is length-capped server-side; `booksText`/`note`/`submitterName`/`email` are inserted unbounded and echoed into Danny's email. `verifyResp.ok` is never checked before `.json()`. Turnstile `hostname` is ignored (a staging token is valid on prod). CORS is `*`.

**Files:**

- Modify: `supabase/functions/submit_suggestion/index.ts`
- Modify: `.env.example` (document `TURNSTILE_ALLOWED_HOSTNAMES`)

- [ ] **Step 1: Server-side length caps.** Enforce, mirroring the client `maxLength`s: `authorName` ≤120, `booksText` ≤1000, `note` ≤2000, `submitterName` ≤120, `email` ≤254. Reject over-length with `400 {error:"validation"}`.

- [ ] **Step 2: Turnstile robustness.** Check `verifyResp.ok` before `.json()` (a Cloudflare 5xx currently throws → bare 500). Assert the verify response `hostname` is in an allowlist read from `TURNSTILE_ALLOWED_HOSTNAMES` (comma-separated env); mismatch → `400 {error:"turnstile"}`.

- [ ] **Step 3: CORS.** Use `corsHeaders(req)` from `_shared/cors.ts` (origin-allowlisted) instead of `*`; thread it through `json()`.

- [ ] **Step 4: Verify.** Over-length `note` → `400`; valid submission still `200`; a token whose `hostname` isn't allowlisted → `400`.

- [ ] **Step 5: Commit (Alejandro)** — suggested: `security(submit_suggestion): server-side caps, Turnstile hostname check, origin CORS (H2)`

> **Stage 8.5 note:** the refactor changes this function's payload to the book-first envelope shape, but **reuses these caps + the hostname check + `corsHeaders`** — re-apply the same guards to each book entry (see the 8.5 plan Task 7).

### Task 6: H3 — stop the undisclosed `subscribers` write

Ticking the notify checkbox writes `email`/`locale`/`confirm_token` to `subscribers` — a table the privacy notice never mentions, with an unimplemented double-opt-in. The notify flow reads from `suggestions`, not `subscribers`, so this write is dead + a GDPR purpose-limitation problem. (The PII-log half of H3 was closed in Task 3.)

**Files:**

- Modify: `supabase/functions/submit_suggestion/index.ts`

- [ ] **Step 1: Delete the `subscribers` upsert block** entirely (the `if (body.newsletterOptIn === true) { … subscribers.upsert … }`). The opt-in is still recorded on `suggestions.accepted_newsletter`, which is all the notify flow needs.

- [ ] **Step 2: Verify.** Submit with the box ticked → `suggestions` row has `accepted_newsletter = true`; `subscribers` table gets **no** new row.

- [ ] **Step 3: Commit (Alejandro)** — suggested: `security(submit_suggestion): stop undisclosed subscribers write (H3)`

> **Stage 8.5 note:** the refactor's rewritten `submit_suggestion` keeps `subscribers` untouched — the write does not return.

**Branch 2 done →** run `npm run format` (CI enforces it), open PR to `development`, Alejandro reviews + merges. All P0 audit items are now closed; the codebase is ready for the Stage 8.5 refactor (which reuses `_shared/auth.ts` + `_shared/cors.ts`) and then Stage 9b.

---

## Coverage map (audit §7 P0 items → tasks)

| P0 item       | Audit finding                                        | Where                               |
| ------------- | ---------------------------------------------------- | ----------------------------------- |
| 1             | C1 — `translate` JWT forge                           | Branch 2 · Task 2                   |
| 2             | C2 — `notify_owner` open relay                       | Branch 2 · Task 3                   |
| 3             | C3 — `notify_submitter` any-bearer + unpinned config | Branch 2 · Task 4                   |
| 4             | H2 — `submit_suggestion` validation/Turnstile/CORS   | Branch 2 · Task 5                   |
| 5             | Remove `supabase/snippets/`                          | Branch 1 · Task 1                   |
| 6             | H3 — undisclosed `subscribers` write + PII log       | Branch 2 · Tasks 6 (+3 for the log) |
| 7             | Remove `supabase/snippets/` from repo (gitignore)    | Branch 1 · Task 1                   |
| 8             | Fail build on missing `PUBLIC_*` env vars            | Branch 1 · Task 5                   |
| 9             | Exclude `/admin` from sitemap + robots (+noindex)    | Branch 1 · Task 6                   |
| (H4, partial) | Green `astro check` — needed for CI                  | Branch 1 · Task 3                   |
| (H1)          | CI pipeline + branch protection                      | Branch 1 · Task 4                   |

**Deferred (not P0, tracked elsewhere):** replacing all hand-rolled row types with generated ones (P1-12), Deno/Playwright test infra (P1/P2), the full accessibility + OG/meta + nav-dehydration work (Stage 10). The Stage 8.5 refactor consumes `_shared/auth.ts` + `_shared/cors.ts` and preserves every guard added here.
