# Stage 8 Implementation Plan — Notify submitter on promote

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When Danny promotes a suggestion whose submitter opted in, the submitter receives one transactional email ("your suggestion is on the map") in their locale — via Resend, triggered by a Supabase Database Webhook on the `suggestions UPDATE`.

**Architecture:** Migration adds 3 columns to `suggestions` (`locale`, `promoted_author_id`, `notified_at`) and extends the existing `promote_suggestion` RPC to populate `promoted_author_id`. A Supabase webhook fires on `status='approved'` UPDATEs and POSTs to a new `notify_submitter` Edge Function. The function guards on the row state (submitter opted in, not yet notified, has a promoted author), claims the notify slot with a conditional `notified_at` update (at-most-once), renders subject+body from an inlined string map in the submitter's locale, and posts to Resend.

**Tech Stack:** Postgres 17 (Supabase), Deno Edge Functions, `@supabase/supabase-js`, Resend API, Astro 5 + React 19 (i18n copy only — no UI changes beyond one label swap).

**Spec:** [docs/specs/2026-07-20-stage-8-notify-submitter-design.md](../specs/2026-07-20-stage-8-notify-submitter-design.md) — read this first.

---

## Working conventions for this plan

1. **No new automated tests.** Vitest suite from 9a-ii (28 tests) stays green — do not extend it for this stage. Manual verification per Spec § Verification.
2. **Alejandro commits manually.** Do NOT run `git commit`, `git push`, or `git merge`. End each slice with a STOP marker; the user reads the diff and commits when satisfied.
3. **Branch:** `feature/08-newsletter-confirmation` (name kept for git-history continuity; scope pivoted per the spec), off `development`.
4. **Task labels:** `[Subagent]` = file change a subagent can execute; `[Manual]` = dashboard, `supabase` CLI, or Resend UI action only Alejandro does.
5. **No `npm run dev:db:reset` autonomously** — wipes `auth.users` locally. Apply migration 0010 locally via Studio SQL editor if a fresh local apply is needed.
6. **No restart of local Supabase autonomously.** If a container-level change is required, stop and ask.
7. **Each slice ends with `STOP — Slice X complete`** = user-commit pause point. Do not move to the next slice until Alejandro confirms.

---

## File structure (lock-in before tasks)

**New files:**

- `supabase/migrations/0010_stage8_notify_submitter.sql` — adds 3 columns to `suggestions`, re-declares `promote_suggestion` RPC with the one-line addition.
- `supabase/functions/notify_submitter/index.ts` — the Edge Function handler (auth, load, idempotency, send, error revert).
- `supabase/functions/notify_submitter/email.ts` — inlined ES/EN strings + `renderEmail()` pure function.
- `docs/30-ops/notify-submitter-debug.md` — ops runbook: webhook location, delivery-log path, manual retry SQL, common failure modes.

**Modified files:**

- `supabase/functions/submit_suggestion/index.ts` — one line: add `locale: body.locale` to the `suggestions` insert.
- `src/i18n/es.json` — tighten `suggest.form.newsletter_label`; reframe 5 `privacy.*_body` strings.
- `src/i18n/en.json` — same, EN mirror.
- `docs/01-implementation-plan.md` — rewrite Stage 8 section to reflect the notify-submitter scope.
- `docs/50-launch-checklist.md` — rewrite item 3 (Newsletter → Notify submitter on promote).
- `docs/RAG.md` — add rows for the spec doc, plan doc, and debug runbook.
- `docs/STATUS.md` — Stage 8 session log + roadmap tick.
- `.env.example` — document `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SITE_URL`.

**Unchanged:**

- `src/pages/suggest.astro`, `src/pages/en/suggest.astro` — the checkbox label reads from an i18n key we only re-string; no code change.
- `src/pages/privacy.astro`, `src/pages/en/privacy.astro` — same rationale.
- `src/components/SuggestionForm.tsx` — the checkbox field remains named `newsletterOptIn`; only the visible label changes via i18n.
- `src/lib/promote.ts` — no client-side change; the RPC update is server-side only.
- All 9a-ii Realtime code, Vitest suite, Turnstile, countries seed, admin auth, map island.

---

# Slice A — Migration + RPC update + local apply

**Goal:** Three new columns on `suggestions` + `promote_suggestion` populates `promoted_author_id` when it resolves a suggestion. Verified locally.

## Task A1 — `[Subagent]` Write migration `0010_stage8_notify_submitter.sql`

**Files:**

- Create: `supabase/migrations/0010_stage8_notify_submitter.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Stage 8 — Notify submitter on promote.
--
-- Adds three columns to public.suggestions:
--   - locale             : submitter's language (used to render notification email)
--   - promoted_author_id : FK back to the created author (nullable; set at promote time)
--   - notified_at        : idempotency marker for the notify_submitter Edge Function
--
-- Also re-declares the promote_suggestion RPC with a single-line addition:
-- the resolve-suggestion UPDATE now also sets promoted_author_id = new_author_id.
-- Body is otherwise byte-for-byte identical to migration 0005.

alter table public.suggestions
  add column locale text not null default 'es'
    check (locale in ('es', 'en')),
  add column promoted_author_id uuid
    references public.authors(id) on delete set null,
  add column notified_at timestamptz;

comment on column public.suggestions.locale is
  'Submitter locale (ES/EN) captured from the suggest form. Used to render notification email.';
comment on column public.suggestions.promoted_author_id is
  'Author created when this suggestion was promoted. NULL until promote_suggestion runs.';
comment on column public.suggestions.notified_at is
  'Timestamp of successful notify_submitter email send. Idempotency guard; NULL until sent.';
comment on column public.suggestions.accepted_newsletter is
  'True when submitter opted in to be notified when their suggestion is promoted. (Future: repurpose for newsletter opt-in when that feature ships.)';

-- Re-declare promote_suggestion. Body copied from 0005 with one addition:
-- `promoted_author_id = new_author_id` inside the resolve-suggestion UPDATE.

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
  if not public.is_admin() then
    raise exception 'unauthorized: admin only';
  end if;

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

  if exists (
    select 1 from public.authors
    where lower(name) = lower(name_in)
      and country_iso_a3 = iso_in
  ) then
    raise exception 'duplicate_author: % already exists in %', name_in, iso_in;
  end if;

  base_slug := public.slugify(name_in) || '-' || lower(iso_in);
  final_slug := base_slug;
  while exists (select 1 from public.authors where slug = final_slug) loop
    collision_n := collision_n + 1;
    final_slug := base_slug || '-' || collision_n::text;
  end loop;

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

  if p_suggestion_id is not null then
    update public.suggestions
      set status              = 'approved',
          reviewed_at         = now(),
          reviewer_notes      = nullif(p_author->>'reviewer_notes', ''),
          promoted_author_id  = new_author_id   -- Stage 8 addition
      where id = p_suggestion_id;
  end if;

  return new_author_id;
end;
$$;

grant execute on function public.promote_suggestion(uuid, jsonb, jsonb[]) to authenticated;
```

- [ ] **Step 2: STOP — Task A1 done. Alejandro reviews the migration before applying.**

---

## Task A2 — `[Manual]` Apply migration locally via Studio SQL editor

- [ ] **Step 1:** Open local Studio: `http://127.0.0.1:54323`.
- [ ] **Step 2:** Paste the contents of `supabase/migrations/0010_stage8_notify_submitter.sql` into the SQL Editor.
- [ ] **Step 3:** Run. Expected: no errors. Two blocks execute — `alter table` + `create or replace function`.
- [ ] **Step 4:** Verify columns via SQL:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'suggestions'
  and column_name in ('locale', 'promoted_author_id', 'notified_at');
```

Expected rows:

- `locale text NO 'es'::text`
- `promoted_author_id uuid YES NULL`
- `notified_at timestamp with time zone YES NULL`

- [ ] **Step 5:** Verify the RPC updated — quick sanity check:

```sql
select pg_get_functiondef('public.promote_suggestion(uuid, jsonb, jsonb[])'::regprocedure) ~ 'promoted_author_id' as has_new_line;
```

Expected: `true`.

- [ ] **Step 6:** STOP — Task A2 done. Local schema now matches migration 0010.

---

## Task A3 — `[Subagent]` Update `submit_suggestion` to store locale

**Files:**

- Modify: `supabase/functions/submit_suggestion/index.ts:118-127`

- [ ] **Step 1:** Add `locale: body.locale` to the `suggestions` insert. Find the block:

```ts
const { error: insertErr } = await sb.from("suggestions").insert({
  submitter_email: email,
  submitter_name: body.submitterName?.trim() || null,
  proposed_author_name: authorName,
  proposed_country_iso_a3: countryIsoA3,
  proposed_books_text: body.booksText?.trim() || null,
  note: body.note?.trim() || null,
  accepted_newsletter: body.newsletterOptIn === true,
  turnstile_verified: true,
});
```

Replace with:

```ts
const { error: insertErr } = await sb.from("suggestions").insert({
  submitter_email: email,
  submitter_name: body.submitterName?.trim() || null,
  proposed_author_name: authorName,
  proposed_country_iso_a3: countryIsoA3,
  proposed_books_text: body.booksText?.trim() || null,
  note: body.note?.trim() || null,
  accepted_newsletter: body.newsletterOptIn === true,
  turnstile_verified: true,
  locale: body.locale,
});
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: exits 0. (This is a type-check surface — Supabase-generated types would flag an unknown column. Since we haven't regenerated types yet, this passes trivially; the runtime check is on staging.)

- [ ] **Step 3:** STOP — Task A3 done.

---

## Task A4 — `[Manual]` Push migration + updated function to staging

- [ ] **Step 1:** From project root (Alejandro's terminal):

```bash
supabase link --project-ref kkdjrzuewnwrlokhemnl   # confirm the linked project
supabase db push
```

Expected: `Applying migration 0010_stage8_notify_submitter.sql...` then `Finished supabase db push.` No errors.

- [ ] **Step 2:** Deploy the updated `submit_suggestion`:

```bash
supabase functions deploy submit_suggestion --project-ref kkdjrzuewnwrlokhemnl
```

Expected: `Deployed Functions on project kkdjrzuewnwrlokhemnl: submit_suggestion`.

- [ ] **Step 3:** Verify in Studio (staging): `Table Editor → suggestions → columns` shows `locale`, `promoted_author_id`, `notified_at`.

- [ ] **Step 4:** STOP — Slice A complete. Alejandro reviews all A-slice changes, commits with:

```
git add supabase/migrations/0010_stage8_notify_submitter.sql supabase/functions/submit_suggestion/index.ts
git commit -m "feat(stage8): add locale/promoted_author_id/notified_at to suggestions; update promote RPC + submit_suggestion"
```

**STOP — Slice A complete. Wait for user before Slice B.**

---

# Slice B — Edge Function (`notify_submitter`)

**Goal:** New Edge Function that receives webhook payloads, guards on state, claims idempotently, sends via Resend. Runs locally via `supabase functions serve`.

## Task B1 — `[Subagent]` Create `email.ts` (strings + renderEmail)

**Files:**

- Create: `supabase/functions/notify_submitter/email.ts`

- [ ] **Step 1: Write the module**

```ts
// email.ts — Stage 8
//
// Strings + rendering for the notify_submitter transactional email.
// Kept inline in the function bundle because Edge Functions can't import
// src/i18n/*.json (different Deno bundle scope).

const STRINGS = {
  es: {
    subject: "Tu sugerencia está en el mapa",
    greetingWith: (name: string) => `Hola, ${name},`,
    greetingBare: "Hola,",
    body: (authorName: string) =>
      `Acabo de añadir a ${authorName} al mapa de autoras — gracias por la sugerencia.`,
    ctaLabel: "Ver el mapa",
    signature: "Danny",
  },
  en: {
    subject: "Your suggestion is on the map",
    greetingWith: (name: string) => `Hi ${name},`,
    greetingBare: "Hi,",
    body: (authorName: string) =>
      `I just added ${authorName} to the map — thanks for the suggestion.`,
    ctaLabel: "See the map",
    signature: "Danny",
  },
} as const;

export interface RenderInput {
  locale: "es" | "en";
  authorName: string;
  submitterName: string | null;
  siteUrl: string;
}

export interface RenderOutput {
  subject: string;
  textBody: string;
  htmlBody: string;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderEmail(input: RenderInput): RenderOutput {
  const s = STRINGS[input.locale];
  const greeting = input.submitterName ? s.greetingWith(input.submitterName) : s.greetingBare;
  const bodyLine = s.body(input.authorName);

  const textBody = [
    greeting,
    "",
    bodyLine,
    "",
    `${s.ctaLabel}: ${input.siteUrl}`,
    "",
    s.signature,
  ].join("\n");

  const htmlBody =
    `<p>${escapeHtml(greeting)}</p>` +
    `<p>${escapeHtml(bodyLine)}</p>` +
    `<p><a href="${escapeHtml(input.siteUrl)}">${escapeHtml(s.ctaLabel)}</a></p>` +
    `<p>${escapeHtml(s.signature)}</p>`;

  return { subject: s.subject, textBody, htmlBody };
}
```

- [ ] **Step 2: STOP — Task B1 done.**

---

## Task B2 — `[Subagent]` Create `notify_submitter/index.ts` (handler)

**Files:**

- Create: `supabase/functions/notify_submitter/index.ts`

- [ ] **Step 1: Write the handler**

```ts
// notify_submitter — Stage 8
//
// Invoked by a Supabase Database Webhook on `suggestions UPDATE` where a
// pending suggestion transitions to status='approved' by the promote_suggestion
// RPC. Sends one transactional email to the opted-in submitter, in their
// original locale, via Resend.
//
// Idempotency: guarded by a conditional `notified_at IS NULL` claim before
// send. Concurrent webhook retries collapse to one winner.
//
// Auth: rejects any request whose Authorization header != Bearer + service
// role key. The webhook is configured to include this header (dashboard).
//
// Local dev: if RESEND_API_KEY is absent, logs a warning and returns 200
// without sending — lets the suggest+promote flow work end-to-end locally.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { renderEmail } from "./email.ts";

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: { id?: string } | null;
  old_record?: { id?: string } | null;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // ─── Auth ─────────────────────────────────────────────────────────────
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer || !serviceKey || bearer !== serviceKey) {
    return json({ error: "unauthorized" }, 401);
  }

  // ─── Parse payload ────────────────────────────────────────────────────
  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const suggestionId = payload?.record?.id;
  if (!suggestionId) {
    return json({ error: "bad_payload" }, 400);
  }

  // ─── Local-dev short-circuit ──────────────────────────────────────────
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!resendKey) {
    console.warn("[notify_submitter] RESEND_API_KEY absent — skipping send.");
    return json({ ok: true, skipped: true }, 200);
  }

  // ─── Load suggestion ──────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!supabaseUrl) {
    console.error("[notify_submitter] SUPABASE_URL missing");
    return json({ error: "server_misconfigured" }, 500);
  }
  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: sug, error: loadErr } = await sb
    .from("suggestions")
    .select(
      "id, submitter_email, submitter_name, locale, accepted_newsletter, notified_at, promoted_author_id, status",
    )
    .eq("id", suggestionId)
    .single();
  if (loadErr || !sug) {
    console.error("[notify_submitter] suggestion load failed:", loadErr?.message);
    return json({ error: "load_failed" }, 500);
  }

  // ─── Guards ───────────────────────────────────────────────────────────
  if (sug.status !== "approved") {
    return json({ ok: true, reason: "not_approved" }, 200);
  }
  if (sug.accepted_newsletter !== true) {
    return json({ ok: true, reason: "not_opted_in" }, 200);
  }
  if (sug.notified_at !== null) {
    return json({ ok: true, reason: "already_notified" }, 200);
  }
  if (!sug.promoted_author_id) {
    return json({ ok: true, reason: "no_promoted_author" }, 200);
  }

  // ─── Load promoted author ─────────────────────────────────────────────
  const { data: author, error: authorErr } = await sb
    .from("authors")
    .select("name")
    .eq("id", sug.promoted_author_id)
    .single();
  if (authorErr || !author) {
    console.error("[notify_submitter] author load failed:", authorErr?.message);
    return json({ error: "author_load_failed" }, 500);
  }

  // ─── Idempotency claim ────────────────────────────────────────────────
  const nowIso = new Date().toISOString();
  const { data: claim, error: claimErr } = await sb
    .from("suggestions")
    .update({ notified_at: nowIso })
    .eq("id", suggestionId)
    .is("notified_at", null)
    .select("id")
    .maybeSingle();
  if (claimErr) {
    console.error("[notify_submitter] claim failed:", claimErr.message);
    return json({ error: "claim_failed" }, 500);
  }
  if (!claim) {
    return json({ ok: true, reason: "already_claimed" }, 200);
  }

  // ─── Render + send ────────────────────────────────────────────────────
  const locale: "es" | "en" = sug.locale === "en" ? "en" : "es";
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://mapadeautoras.com";
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "onboarding@resend.dev";

  const { subject, textBody, htmlBody } = renderEmail({
    locale,
    authorName: author.name,
    submitterName: sug.submitter_name ?? null,
    siteUrl,
  });

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: sug.submitter_email,
      subject,
      text: textBody,
      html: htmlBody,
    }),
  });

  if (!resendRes.ok) {
    const bodyText = await resendRes.text();
    console.error("[notify_submitter] Resend send failed:", resendRes.status, bodyText);
    // Revert the claim so a retry can succeed.
    await sb.from("suggestions").update({ notified_at: null }).eq("id", suggestionId);
    return json({ error: "resend_failed", status: resendRes.status }, 500);
  }

  return json({ ok: true }, 200);
});
```

- [ ] **Step 2: Verify the function boots**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3:** Optional local smoke test (if the user chooses to run it):

```bash
supabase functions serve notify_submitter --env-file supabase/.env
```

Then in another terminal:

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/notify_submitter \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(supabase status -o json | jq -r .SERVICE_ROLE_KEY)" \
  -d '{"type":"UPDATE","table":"suggestions","schema":"public","record":{"id":"00000000-0000-0000-0000-000000000000"}}'
```

Expected: 500 `{"error":"load_failed"}` (no such row) or 200 `{"ok":true,"skipped":true}` if `RESEND_API_KEY` is absent locally. Either proves auth + parsing + short-circuit paths work.

- [ ] **Step 4:** STOP — Task B2 done.

---

## Task B3 — `[Subagent]` Update `.env.example`

**Files:**

- Modify: `.env.example`

- [ ] **Step 1:** Append to `.env.example`:

```
# ─── Stage 8 — notify_submitter Edge Function ────────────────────────────
# Real Resend API key (free tier at resend.com). Absent in local dev = the
# function short-circuits with a warning instead of sending.
RESEND_API_KEY=""

# From-address for outbound emails. Staging (Resend unverified account):
#   onboarding@resend.dev  — only sends to the account owner's email.
# Prod (Stage 9b, mapadeautoras.com domain-authed in Resend):
#   hola@mapadeautoras.com
RESEND_FROM_EMAIL=""

# Rendered as the "See the map" link inside the notification email.
# Staging: https://staging.mapadeautoras.com
# Prod   : https://mapadeautoras.com
SITE_URL=""
```

- [ ] **Step 2:** STOP — Slice B complete. Alejandro reviews all B-slice changes, commits with:

```
git add supabase/functions/notify_submitter/ .env.example
git commit -m "feat(stage8): notify_submitter Edge Function (renderEmail + handler)"
```

**STOP — Slice B complete. Wait for user before Slice C.**

---

# Slice C — i18n copy (opt-in label + privacy reframe)

**Goal:** Opt-in checkbox reads honestly ("let me know when I add this writer to the map"), privacy policy stops referencing a newsletter that doesn't exist yet.

## Task C1 — `[Subagent]` Tighten opt-in label in `es.json` + `en.json`

**Files:**

- Modify: `src/i18n/es.json:101`
- Modify: `src/i18n/en.json:101`

- [ ] **Step 1:** In `src/i18n/es.json`, find:

```
"newsletter_label": "Avísame cuando publique esta autora o las próximas"
```

Replace with:

```
"newsletter_label": "Avísame cuando añada esta autora al mapa"
```

- [ ] **Step 2:** In `src/i18n/en.json`, find:

```
"newsletter_label": "Notify me when I publish this writer or upcoming ones"
```

Replace with:

```
"newsletter_label": "Let me know when I add this writer to the map"
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: exits 0. All 14 pages built.

- [ ] **Step 4: Visual verify**

Run: `npm run dev` — open `http://localhost:4321/suggest` and `http://localhost:4321/en/suggest`. The checkbox label reflects the new copy in each locale.

- [ ] **Step 5:** STOP — Task C1 done.

---

## Task C2 — `[Subagent]` Reframe privacy policy — ES

**Files:**

- Modify: `src/i18n/es.json` (5 `privacy.*_body` keys)

- [ ] **Step 1:** Find `privacy.collect_body`, current value:

```
"collect_body": "**Email:** cuando envías una sugerencia de autora o te suscribes al newsletter.\n\n**Nombre (opcional):** si lo incluyes al enviar una sugerencia, para acreditarte si publico esa autora.\n\n**Datos técnicos transitorios:** las direcciones IP y user-agents pasan por los registros de mis proveedores de hosting (Cloudflare, Supabase) durante 24-72 horas para prevenir abuso. No los almaceno yo directamente."
```

Replace with:

```
"collect_body": "**Email:** cuando envías una sugerencia de autora, y opcionalmente para avisarte cuando publique tu sugerencia.\n\n**Nombre (opcional):** si lo incluyes al enviar una sugerencia, para acreditarte si publico esa autora.\n\n**Datos técnicos transitorios:** las direcciones IP y user-agents pasan por los registros de mis proveedores de hosting (Cloudflare, Supabase) durante 24-72 horas para prevenir abuso. No los almaceno yo directamente."
```

- [ ] **Step 2:** Find `privacy.legal_basis_body`, current value:

```
"legal_basis_body": "El tratamiento se basa en tu **consentimiento** (para envío del newsletter y para responder tus sugerencias). Puedes retirar el consentimiento en cualquier momento contactándome — más abajo."
```

Replace with:

```
"legal_basis_body": "El tratamiento se basa en tu **consentimiento** (para avisarte sobre tu sugerencia y para responderte). Puedes retirar el consentimiento en cualquier momento contactándome — más abajo."
```

- [ ] **Step 3:** Find `privacy.retention_body`, current value:

```
"retention_body": "**Sugerencias:** hasta que las procese (publico la autora o la rechazo). Después mantengo el registro para evitar sugerencias duplicadas.\n\n**Suscriptores del newsletter:** hasta que canceles la suscripción (cada correo incluye un enlace para hacerlo).\n\n**Cuentas de administrador:** solo la mía; el sitio no permite registro público de cuentas."
```

Replace with:

```
"retention_body": "**Sugerencias:** hasta que las procese (publico la autora o la rechazo). Después mantengo el registro para evitar sugerencias duplicadas.\n\n**Cuentas de administrador:** solo la mía; el sitio no permite registro público de cuentas."
```

- [ ] **Step 4:** Find `privacy.thirdparties_body`, current value:

```
"thirdparties_body": "El sitio se apoya en estos servicios como encargados de tratamiento:\n\n**Supabase** (base de datos, autenticación) — región `eu-west-1` (Irlanda), sujeta a GDPR.\n\n**Cloudflare** (hosting web, DNS, Turnstile bot defense) — infraestructura global; DPA firmada.\n\n**DeepL** (traducción en el panel admin, solo la uso yo) — EU, sujeta a GDPR.\n\n**Resend** (envío de emails de confirmación y newsletter) — DPA firmada."
```

Replace with:

```
"thirdparties_body": "El sitio se apoya en estos servicios como encargados de tratamiento:\n\n**Supabase** (base de datos, autenticación) — región `eu-west-1` (Irlanda), sujeta a GDPR.\n\n**Cloudflare** (hosting web, DNS, Turnstile bot defense) — infraestructura global; DPA firmada.\n\n**DeepL** (traducción en el panel admin, solo la uso yo) — EU, sujeta a GDPR.\n\n**Resend** (envío de emails transaccionales) — DPA firmada."
```

- [ ] **Step 5:** Find `privacy.changes_body`, current value:

```
"changes_body": "Si actualizo esta política, cambiaré la fecha al principio de la página. Los cambios sustanciales se anunciarán a los suscriptores del newsletter."
```

Replace with:

```
"changes_body": "Si actualizo esta política, cambiaré la fecha al principio de la página."
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 7: Visual verify**

Run: `npm run dev` — open `http://localhost:4321/privacy`. Each of the 5 sections shows the reframed copy.

- [ ] **Step 8:** STOP — Task C2 done.

---

## Task C3 — `[Subagent]` Reframe privacy policy — EN

**Files:**

- Modify: `src/i18n/en.json` (5 `privacy.*_body` keys)

- [ ] **Step 1:** In `src/i18n/en.json`, find `privacy.collect_body`:

```
"collect_body": "**Email:** when you submit a writer suggestion or subscribe to the newsletter.\n\n**Name (optional):** if you include it when submitting a suggestion, so I can credit you if I publish that writer.\n\n**Transient technical data:** IP addresses and user-agents flow through my hosting providers' logs (Cloudflare, Supabase) for 24-72 hours to prevent abuse. I don't store them directly."
```

Replace with:

```
"collect_body": "**Email:** when you submit a writer suggestion, and optionally to let you know when I publish your suggestion.\n\n**Name (optional):** if you include it when submitting a suggestion, so I can credit you if I publish that writer.\n\n**Transient technical data:** IP addresses and user-agents flow through my hosting providers' logs (Cloudflare, Supabase) for 24-72 hours to prevent abuse. I don't store them directly."
```

- [ ] **Step 2:** Find `privacy.legal_basis_body`:

```
"legal_basis_body": "Processing is based on your **consent** (for newsletter delivery and to reply to your suggestions). You can withdraw consent at any time by contacting me — details below."
```

Replace with:

```
"legal_basis_body": "Processing is based on your **consent** (to let you know about your suggestion and to reply to you). You can withdraw consent at any time by contacting me — details below."
```

- [ ] **Step 3:** Find `privacy.retention_body`:

```
"retention_body": "**Suggestions:** until I process them (publish the writer or reject the suggestion). After that I keep the record to avoid duplicate suggestions.\n\n**Newsletter subscribers:** until you unsubscribe (every email includes a link).\n\n**Admin accounts:** only mine; the site doesn't allow public account registration."
```

Replace with:

```
"retention_body": "**Suggestions:** until I process them (publish the writer or reject the suggestion). After that I keep the record to avoid duplicate suggestions.\n\n**Admin accounts:** only mine; the site doesn't allow public account registration."
```

- [ ] **Step 4:** Find `privacy.thirdparties_body`:

```
"thirdparties_body": "The site relies on these services as data processors:\n\n**Supabase** (database, authentication) — region `eu-west-1` (Ireland), GDPR-compliant.\n\n**Cloudflare** (web hosting, DNS, Turnstile bot defense) — global infrastructure; DPA signed.\n\n**DeepL** (translation in the admin panel, used only by me) — EU-based, GDPR-compliant.\n\n**Resend** (confirmation and newsletter email delivery) — DPA signed."
```

Replace with:

```
"thirdparties_body": "The site relies on these services as data processors:\n\n**Supabase** (database, authentication) — region `eu-west-1` (Ireland), GDPR-compliant.\n\n**Cloudflare** (web hosting, DNS, Turnstile bot defense) — global infrastructure; DPA signed.\n\n**DeepL** (translation in the admin panel, used only by me) — EU-based, GDPR-compliant.\n\n**Resend** (transactional email delivery) — DPA signed."
```

- [ ] **Step 5:** Find `privacy.changes_body`:

```
"changes_body": "If I update this policy, I'll change the date at the top of the page. Substantial changes will be announced to newsletter subscribers."
```

Replace with:

```
"changes_body": "If I update this policy, I'll change the date at the top of the page."
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 7: Visual verify**

Run: `npm run dev` — open `http://localhost:4321/en/privacy`. Each of the 5 sections shows the reframed copy.

- [ ] **Step 8:** STOP — Slice C complete. Alejandro reviews, commits with:

```
git add src/i18n/es.json src/i18n/en.json
git commit -m "content(stage8): tighten opt-in label; reframe privacy policy to drop newsletter"
```

**STOP — Slice C complete. Wait for user before Slice D.**

---

# Slice D — Deploy, wire staging, end-to-end verify

**Goal:** `notify_submitter` deployed on staging with env vars, webhook configured, single-tab end-to-end run works.

## Task D1 — `[Manual]` Provision Resend account + API key

- [ ] **Step 1:** Alejandro signs up at [resend.com](https://resend.com) (or Danny does — whoever holds the account credentials long-term). Free tier: 3000 emails/month.
- [ ] **Step 2:** Register with the email that will later receive the test emails (this is the ONLY address unverified accounts can send TO).
- [ ] **Step 3:** In Resend dashboard → API Keys → Create → name it `mapa-de-autoras-staging` → copy the value. This is the `RESEND_API_KEY`.
- [ ] **Step 4:** STOP — Task D1 done. Key held securely for D3.

---

## Task D2 — `[Manual]` Deploy `notify_submitter` to staging

- [ ] **Step 1:** From project root:

```bash
supabase functions deploy notify_submitter --project-ref kkdjrzuewnwrlokhemnl
```

Expected: `Deployed Functions on project kkdjrzuewnwrlokhemnl: notify_submitter`.

- [ ] **Step 2:** Verify in Supabase dashboard → Functions → `notify_submitter` is listed with today's timestamp.

- [ ] **Step 3:** STOP — Task D2 done.

---

## Task D3 — `[Manual]` Set staging function env vars

- [ ] **Step 1:** Supabase dashboard (staging) → Project Settings → Edge Functions → Manage secrets.

- [ ] **Step 2:** Add three secrets:

| Name                | Value                               |
| ------------------- | ----------------------------------- |
| `RESEND_API_KEY`    | (from Task D1, Step 3)              |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev`             |
| `SITE_URL`          | `https://staging.mapadeautoras.com` |

- [ ] **Step 3:** Save. `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are auto-provisioned by Supabase (do not add).

- [ ] **Step 4:** STOP — Task D3 done.

---

## Task D4 — `[Manual]` Configure the Database Webhook

- [ ] **Step 1:** Supabase dashboard (staging) → Database → Webhooks → Create a new hook.

- [ ] **Step 2:** Fill in:

| Field       | Value                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| Name        | `notify_submitter_on_promote`                                            |
| Schema      | `public`                                                                 |
| Table       | `suggestions`                                                            |
| Events      | ✅ Update (only)                                                         |
| Type        | HTTP Request                                                             |
| HTTP method | POST                                                                     |
| URL         | `https://kkdjrzuewnwrlokhemnl.supabase.co/functions/v1/notify_submitter` |

- [ ] **Step 3:** HTTP Headers — add:

| Header          | Value                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------ |
| `Authorization` | `Bearer <service_role_key>` (from dashboard → Project Settings → API → `service_role` key) |
| `Content-Type`  | `application/json`                                                                         |

- [ ] **Step 4:** Filters — try the compound expression first:

```
status = "approved" AND accepted_newsletter = true AND notified_at IS NULL
```

If the dashboard rejects the compound expression (older versions may only support single-column equality), fall back to:

```
status = "approved"
```

The function's internal guards (steps under "Guards" in `index.ts`) short-circuit correctly regardless. Whichever you end up using, note it in the debug runbook (Task E3).

- [ ] **Step 5:** Save. Verify the webhook appears in the list, enabled.

- [ ] **Step 6:** STOP — Task D4 done.

---

## Task D5 — `[Manual]` End-to-end verify on staging

- [ ] **Step 1: Prime — submit an opted-in suggestion**

- Open `https://staging.mapadeautoras.com/suggest` (or `/en/suggest` to test EN).
- Fill out the form using the email registered with Resend in D1.
- Tick the "Avísame cuando añada esta autora al mapa" / "Let me know when I add this writer to the map" checkbox.
- Submit.

Expected: redirect to `/thanks`.

- [ ] **Step 2: Verify the row landed correctly**

Staging Studio → Table Editor → `suggestions` → most recent row:

- `accepted_newsletter = true`
- `locale` = `es` or `en` (matches the form you used)
- `status = pending`
- `notified_at = NULL`
- `promoted_author_id = NULL`

- [ ] **Step 3: Promote via admin**

- Open `https://staging.mapadeautoras.com/admin`.
- Log in via magic link.
- Open the inbox, pick the pending suggestion, promote it (fill required fields, save).
- Expected: promote succeeds; suggestion status becomes `approved`; author appears on the map.

- [ ] **Step 4: Verify webhook fired**

Supabase dashboard → Database → Webhooks → `notify_submitter_on_promote` → Recent deliveries: one POST with status 200 within a few seconds.

- [ ] **Step 5: Verify email arrived**

Check the inbox of the email you used in Step 1. Within ~30 seconds an email arrives:

- Subject matches the locale (`Tu sugerencia está en el mapa` / `Your suggestion is on the map`).
- Body contains the author name you set during promote.
- "Ver el mapa" / "See the map" link points to `https://staging.mapadeautoras.com`.

- [ ] **Step 6: Verify `notified_at`**

Staging Studio → `suggestions` row → `notified_at` is now populated with the send timestamp.

- [ ] **Step 7: Regression — opt-out path**

Repeat Steps 1-3 with the checkbox UNTICKED.
Expected after promote:

- No email arrives at any inbox.
- `notified_at` remains `NULL` on the second row.
- Webhook Recent deliveries either shows no delivery (compound filter caught it) OR a 200 with `{"ok":true,"reason":"not_opted_in"}` (function guard caught it).

- [ ] **Step 8: Idempotency check**

Supabase dashboard → Database → Webhooks → `notify_submitter_on_promote` → find the successful delivery from Step 4 → click "Redeliver".
Expected: 200 with `{"ok":true,"reason":"already_notified"}` (or `already_claimed`). No second email arrives.

- [ ] **Step 9:** STOP — Slice D complete. This is the definitive proof-of-life for Stage 8. Alejandro reviews, does NOT commit (nothing to commit — all changes are dashboard config). Proceed to Slice E for docs.

**STOP — Slice D complete. Wait for user before Slice E.**

---

# Slice E — Documentation

**Goal:** Every doc that references Stage 8, newsletter, or the notification flow reflects the shipped reality.

## Task E1 — `[Subagent]` Rewrite Stage 8 section in `01-implementation-plan.md`

**Files:**

- Modify: `docs/01-implementation-plan.md:227-247`

- [ ] **Step 1:** Find the Stage 8 section (starts with `## Stage 8 — Newsletter double-opt-in confirmation + Resend audience sync`) and replace it entirely with:

```markdown
## Stage 8 — Notify submitter on promote

**Branch:** `feature/08-newsletter-confirmation` (branch name kept for git-history continuity — actual scope pivoted from newsletter to transactional notification during brainstorming).

**Goal:** When Danny promotes a suggestion whose submitter opted in, the submitter receives one transactional email in their locale via Resend.

**Design:** [docs/specs/2026-07-20-stage-8-notify-submitter-design.md](specs/2026-07-20-stage-8-notify-submitter-design.md) — full scope, decisions table, architecture, verification.

**Build:**

- Migration `0010_stage8_notify_submitter.sql` — adds `locale`, `promoted_author_id`, `notified_at` columns to `suggestions`; re-declares `promote_suggestion` RPC to populate `promoted_author_id`.
- `supabase/functions/notify_submitter/index.ts` — webhook-triggered Edge Function; auth on service-role bearer; conditional `notified_at` claim for at-most-once semantics; renders + sends via Resend.
- `supabase/functions/notify_submitter/email.ts` — inlined ES/EN strings + `renderEmail()`.
- Update `supabase/functions/submit_suggestion/index.ts` to store `locale` on the suggestion row (previously only stored on the deprecated `subscribers` upsert).
- i18n copy: tighten opt-in checkbox label; strip newsletter references from the privacy policy (5 body strings × 2 locales).
- Supabase Database Webhook on `suggestions UPDATE` filtered to `status='approved'` — POSTs to `notify_submitter`.
- Resend account provisioned in unverified mode for staging (sends only to account owner's email). Domain auth deferred to Stage 9b.
- `.env.example` documents `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SITE_URL`.
- `docs/30-ops/notify-submitter-debug.md` runbook.

**Verify (staging):**

1. Opt-in submission → promote → email delivered (subject + body match locale) → `notified_at` populated.
2. Opt-out submission → promote → no email, `notified_at` remains `NULL`.
3. Idempotency: redeliver the webhook → 200 with `already_notified`, no second email.
4. `promoted_author_id` populated on the resolved suggestion row.

**Out (Phase 2):** real newsletter (broadcast list, Resend Audiences), unsubscribe flow, HTML-styled template, "resend notification" admin button, structured logging.

**Pause for review.**
```

- [ ] **Step 2:** STOP — Task E1 done.

---

## Task E2 — `[Subagent]` Update launch checklist item 3

**Files:**

- Modify: `docs/50-launch-checklist.md` (find `### 3. Newsletter (Stage 8 — elevated to launch-blocking)`)

- [ ] **Step 1:** Replace the entire `### 3. Newsletter (...)` block with:

```markdown
### 3. Notify submitter on promote (Stage 8)

- [ ] Migration `0010_stage8_notify_submitter.sql` applied on staging (`locale`, `promoted_author_id`, `notified_at` on `suggestions`; `promote_suggestion` RPC updated).
- [ ] `notify_submitter` Edge Function deployed to staging.
- [ ] Staging function env vars set: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (`onboarding@resend.dev`), `SITE_URL` (`https://staging.mapadeautoras.com`).
- [ ] Supabase Database Webhook `notify_submitter_on_promote` configured on staging (`suggestions UPDATE` → POST to function URL, with `Authorization: Bearer <service_role>`).
- [ ] End-to-end verified on staging: opt-in submission → promote → email arrives → `notified_at` populated.
- [ ] Regression: opt-out submission → no email.
- [ ] Idempotency: webhook redeliver returns `already_notified`, no duplicate email.
- [ ] Privacy policy no longer references a newsletter (5 strings reframed in both locales).
- [ ] Note for Stage 9b: provision Resend domain auth for `mapadeautoras.com`; swap `RESEND_FROM_EMAIL` to `hola@mapadeautoras.com`; add the webhook + secrets to the prod project too.
```

- [ ] **Step 2:** STOP — Task E2 done.

---

## Task E3 — `[Subagent]` Create debug runbook

**Files:**

- Create: `docs/30-ops/notify-submitter-debug.md`

- [ ] **Step 1: Write the runbook**

```markdown
# notify_submitter — debugging runbook

Operational reference for the Stage 8 notification flow: submitter opts in → admin promotes → submitter receives one email.

## Architecture cheat-sheet
```

suggestions UPDATE (status → 'approved')
→ Supabase Database Webhook `notify_submitter_on_promote`
→ POST /functions/v1/notify_submitter (Authorization: Bearer <service_role>)
→ guard checks → claim notified_at → POST to Resend API
→ return 200

````

## Where to look when it breaks

**"Suggestion promoted but no email arrived":**

1. **Studio → `suggestions` → the promoted row:**
   - `notified_at` populated? → Resend accepted the send. Check the submitter's spam folder + Resend dashboard → Emails.
   - `notified_at` NULL? → email never got claimed. Continue below.
2. **Dashboard → Database → Webhooks → `notify_submitter_on_promote` → Recent deliveries:**
   - No delivery? → the filter didn't match. Check the filter expression (record which variant is in use — compound or `status = "approved"`).
   - Delivery with status ≥400? → click into it; read the response body. Common causes:
     - 401 unauthorized → service-role key in the webhook header is wrong/stale.
     - 400 `bad_payload` → the webhook payload shape changed; check `record.id` is present.
     - 500 `resend_failed` → Resend rejected the send; check the `bodyText` in function logs.
3. **Dashboard → Edge Functions → `notify_submitter` → Logs:**
   - Filter by the relevant timestamp; look for `console.error` / `console.warn` output.

**"Duplicate emails":**

- Should be impossible thanks to the `notified_at IS NULL` conditional claim. If it happens, the guard was bypassed — check whether someone manually reset `notified_at` between webhook deliveries.

**"Wrong language":**

- The email locale comes from `suggestions.locale`. If it's the wrong language, check whether `submit_suggestion` stored the `body.locale` on insert (Stage 8 A3 fix); older rows default to `'es'`.

## Manual retry

If `notified_at` is NULL and you want to trigger a resend without editing the row:

- Dashboard → Database → Webhooks → `notify_submitter_on_promote` → Recent deliveries → find the relevant one → "Redeliver".

If no delivery exists (filter rejected the row), or to force a resend on a row that already sent:

```sql
-- Reset the claim so the next webhook trigger will send again.
update public.suggestions set notified_at = null where id = '<uuid>';

-- Then trigger a no-op UPDATE to fire the webhook:
update public.suggestions set status = status where id = '<uuid>';
````

## Local dev

Local runs use the same function code but usually without `RESEND_API_KEY`. The function logs a warning and returns 200 without sending — this is the intended local behavior.

To test rendering locally (without sending):

```bash
supabase functions serve notify_submitter --env-file supabase/.env
```

Then curl with a mock payload; the function will log the rendered subject + body in dev mode (add a `console.log` around the `renderEmail()` call temporarily if needed).

## Config drift risk

The webhook config lives in the Supabase dashboard, not in git. If someone deletes or disables it, emails stop with no visible error in the app. Follow-up (post-launch): add a smoke test to the heartbeat workflow that submits + promotes a test suggestion once a week.

## Filter expression currently in use

(Update this line to reflect what's actually configured on staging + prod.)

- **Staging:** `<filled in during Task D4, Step 4>`
- **Prod (9b):** `<filled in during Stage 9b webhook config>`

```

- [ ] **Step 2: Post-verify D4:** Alejandro fills the "Filter expression currently in use" placeholder for staging with whichever filter variant was accepted by the dashboard.

- [ ] **Step 3:** STOP — Task E3 done.

---

## Task E4 — `[Subagent]` Update `docs/RAG.md`

**Files:**
- Modify: `docs/RAG.md`

- [ ] **Step 1:** Add three rows to the docs index table (place them in the section matching the existing pattern — specs table, plans table, ops docs table, whichever is used).

For specs:

```

| `specs/2026-07-20-stage-8-notify-submitter-design.md` | Stage 8 design — transactional email to submitter on promote (scope pivot from newsletter). | Read when working on Stage 8 code, or when questioning the notify architecture / webhook decision. |

```

For plans:

```

| `plans/2026-07-20-stage-8-notify-submitter-implementation.md` | Stage 8 implementation plan — task-by-task migration + Edge Function + i18n + docs. | Read when picking up Stage 8 work or resuming mid-slice. |

```

For ops:

```

| `30-ops/notify-submitter-debug.md` | Runbook for the notify_submitter Edge Function — where to look when emails don't arrive, manual retry SQL, filter-expression note. | Consult when a submitter reports no email, or before touching the webhook config. |

````

- [ ] **Step 2:** STOP — Task E4 done.

---

## Task E5 — `[Subagent]` Update `docs/STATUS.md` with the Stage 8 log

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1:** Add a new session-log entry at the top of the session log section (follow the existing format). Draft:

```markdown
## 2026-07-20 — Stage 8 shipped (notify submitter on promote)

**Merged:** `feature/08-newsletter-confirmation` → `development` (branch name kept for git-history continuity; scope pivoted from newsletter to transactional notification).

**Landed:**
- Migration 0010: `suggestions` gains `locale`, `promoted_author_id`, `notified_at`; `promote_suggestion` RPC now writes `promoted_author_id` when resolving a suggestion.
- `notify_submitter` Edge Function (`email.ts` + `index.ts`) — service-role auth, idempotent via `notified_at IS NULL` claim, renders ES/EN, posts to Resend.
- `submit_suggestion` extended to store `locale` on the suggestion row.
- i18n: opt-in checkbox label reframed; 5 privacy-policy `_body` keys reframed in both locales (no more newsletter references).
- Resend account provisioned; staging function env vars + Database Webhook configured.
- Debug runbook: `docs/30-ops/notify-submitter-debug.md`.

**Verified on staging:** end-to-end promote → email delivered → `notified_at` set. Opt-out regression + webhook redeliver idempotency both green.

**Pending for 9b:** Resend domain auth for `mapadeautoras.com`; swap `RESEND_FROM_EMAIL` to `hola@mapadeautoras.com`; re-create webhook + function secrets on the prod Supabase project.
````

- [ ] **Step 2:** Update the roadmap snapshot section (if present) — tick Stage 8 as done, leave Stage 9b as the next launch-blocking item.

- [ ] **Step 3:** STOP — Task E5 done.

---

## Task E6 — `[Manual]` Final Slice E commit + Stage 8 wrap

- [ ] **Step 1:** Alejandro reviews all E-slice changes:

```
docs/01-implementation-plan.md
docs/50-launch-checklist.md
docs/30-ops/notify-submitter-debug.md
docs/RAG.md
docs/STATUS.md
```

- [ ] **Step 2:** Commit:

```
git add docs/
git commit -m "docs(stage8): update plan, checklist, RAG, STATUS; add notify_submitter debug runbook"
```

- [ ] **Step 3:** Merge `feature/08-newsletter-confirmation` → `development` (only after Alejandro confirms the Slice D end-to-end verification passed).

**STOP — Stage 8 complete.**

---

## Post-stage — Handoff to Stage 9b

After merging to `development`, the launch-blocking work remaining is:

1. Stage 9b (production deploy) — new Supabase prod project, prod Pages project, Resend domain auth, apex + www domain wiring.
2. Stage 10 remaining polish — OG image, favicons, web manifest, Danny reviews privacy + About page.

Stage 8 unblocks 9b: the notification flow is proven on staging, so 9b's Supabase project just needs the same 3 secrets + a mirrored webhook + a domain-authed Resend from-address.
