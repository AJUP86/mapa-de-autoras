# Stage 8 — Notify submitter on promote

**Date:** 2026-07-20
**Branch:** `feature/08-newsletter-confirmation` (kept for continuity; scope is not a newsletter anymore)
**Status:** Design approved, ready to implement.

> Supersedes the Stage 8 scope originally sketched in [docs/01-implementation-plan.md § Stage 8](../01-implementation-plan.md). The original plan proposed a full double-opt-in newsletter with a `/confirm` page, Resend Audiences sync, and an admin subscribers view. During brainstorming, scope was cut hard to just what launch needs: a single transactional email to the submitter when their suggestion is promoted. Newsletter, capture forms, and audience sync move to the post-launch backlog. This spec is authoritative; the implementation plan doc is updated in-flight.

---

## Why now

Stage 8 is the last launch-blocking capability before Stage 9b (production deploy). The three-party interaction — submitter suggests → admin promotes → map updates in real time — is complete on Danny's side, but the submitter never learns their contribution landed. For a site whose value proposition is "help me discover writers", the loop should close with a small acknowledgement. It also gives submitters a reason to trust the opt-in checkbox exists for a purpose.

## Scope

**In (Stage 8):**

- Migration `0010_stage8_notify_submitter.sql` adds three columns to `public.suggestions` (`locale`, `promoted_author_id`, `notified_at`) and updates the `promote_suggestion` RPC to set `promoted_author_id` when a suggestion is resolved.
- New Edge Function `supabase/functions/notify_submitter/index.ts` sends one transactional email via Resend when triggered.
- Supabase Database Webhook (configured per-env in the dashboard) on `suggestions UPDATE` where `status = 'approved' AND accepted_newsletter = true AND notified_at IS NULL` → POSTs to `notify_submitter`.
- Idempotency: conditional update on `notified_at` inside the function guarantees at-most-once send even under webhook retries.
- i18n copy: relabel the opt-in checkbox on `/suggest` (drop "newsletter" framing) + new `emails.notify_submitter.*` namespace for subject/body.
- Privacy policy: strip pending references to a newsletter that doesn't exist yet; reframe to transactional emails.
- Env vars: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SITE_URL` on the staging Supabase function config (+ `.env.example` documented for local).
- Resend account provisioned in unverified mode; from-address `onboarding@resend.dev`; sends only to the account owner's email in staging (fine for QA — Danny submits to herself).
- Docs: implementation-plan and launch-checklist edited to reflect the pivoted scope. New `docs/30-ops/notify-submitter-debug.md` runbook.

**Out (Stage 8):**

- No `/newsletter` page. No footer capture widget. No standalone subscription form.
- No `/confirm.astro` page. No double-opt-in flow.
- No `/admin/subscribers` view.
- No Resend Audiences (broadcast list) integration.
- No unsubscribe link (the email is one-per-suggestion, not a subscription).
- No editing existing authors or books (still Stage 7b-ii, post-launch backlog).
- No HTML-styled email template. Plain text body + minimal HTML mirror only.
- No client-side or in-app trigger. Trigger stays a DB webhook (see Decision 3).

**Out (Phase 2 / post-launch):**

- Real newsletter (broadcast). Repurposes `accepted_newsletter` column + adds proper double-opt-in.
- Structured logging for `notify_submitter` + failure taxonomy.
- Admin UI: "resend notification" button on approved suggestions where `notified_at IS NULL`.
- HTML-styled Resend template + preview.

---

## Decisions

| #   | Decision           | Choice                                                                                                                                                                                                                                              | Rationale                                                                                                                                                                                                                                                                     |
| --- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Scope              | Only transactional "your suggestion is on the map" email. No newsletter, no capture form, no confirm page.                                                                                                                                          | Danny asked to cut Stage 8 to the minimum needed for launch. Newsletter is speculative demand; notify-on-promote closes an existing loop.                                                                                                                                     |
| 2   | Trigger source     | Supabase Database Webhook on `suggestions UPDATE`, filtered to the exact transition.                                                                                                                                                                | Matches the pattern already committed for `notify_owner` in 9b — one webhook mechanism, two configs. Alternative (client-side chain after promote) was considered and rejected to keep architecture consistent; the maintainability cost is offset by adding a debug runbook. |
| 3   | Idempotency        | New column `suggestions.notified_at`. Function conditionally sets it via `update ... where notified_at is null returning id` before sending. On send failure, revert to NULL.                                                                       | Webhook retries + at-least-once delivery semantics; the conditional update collapses concurrent invocations to one winner.                                                                                                                                                    |
| 4   | Author linkage     | New column `suggestions.promoted_author_id references public.authors(id) on delete set null`. `promote_suggestion` RPC populates it inside the existing resolve-suggestion block.                                                                   | Matching by name is fragile (Danny may adjust the display name during promote). FK is one row modification, zero race window. `on delete set null` so future author deletion (7b-ii) doesn't break historical suggestions.                                                    |
| 5   | Locale storage     | New column `suggestions.locale text not null default 'es' check (locale in ('es','en'))`. `submit_suggestion` Edge Function starts writing it.                                                                                                      | The submitter's locale was already captured in the form but only stored on the deprecated `subscribers` upsert. Emails need to render in the submitter's chosen language.                                                                                                     |
| 6   | Column rename      | Do NOT rename `accepted_newsletter`. Update column comment to reflect current semantics: "Set true when submitter wants an email when their suggestion is promoted. (Future: newsletter opt-in when that feature ships.)"                           | Not user-visible; rename churn is unnecessary. When real newsletter ships post-launch, either repurpose or add a second column then.                                                                                                                                          |
| 7   | Function signature | `notify_submitter` accepts the Supabase webhook payload shape `{ type, record, old_record, ... }`. Reads only `record.id`, then re-fetches the full row for freshness.                                                                              | Payload from the webhook is a snapshot; re-fetch guards against processing stale data if the row was updated again during the (retry) window.                                                                                                                                 |
| 8   | Authorization      | Function requires `Authorization: Bearer <service_role_key>` (the webhook's outbound header). Rejects anything else with 401.                                                                                                                       | Prevents public callers from spoofing the webhook and triggering emails.                                                                                                                                                                                                      |
| 9   | Failure semantics  | If Resend returns non-2xx, `notified_at` reverts to NULL and function returns 500. Webhook retries 3× automatically. After 3 fails, row remains in NULL state; a manual retry (post-launch admin button) can re-send.                               | Fail-open on retry semantics; no silent drop.                                                                                                                                                                                                                                 |
| 10  | Email content      | Plain text + minimal HTML mirror. Subject + heading + one-paragraph body + link to `SITE_URL`. First-person Danny voice, ES/EN by submitter locale. `{authorName}` from the promoted author's display name; optional `{submitterName}` if provided. | Matches the site's overall editorial tone. HTML styling is Phase 2 polish.                                                                                                                                                                                                    |
| 11  | From address       | Staging: `onboarding@resend.dev` (Resend's shared shell). Prod: `hola@mapadeautoras.com` (domain-authed in Stage 9b). Configured via `RESEND_FROM_EMAIL` env var so no code change per environment.                                                 | Unverified Resend accounts only allow shared-shell from-address; Danny gets domain auth in 9b.                                                                                                                                                                                |
| 12  | Site URL in email  | Configured via `SITE_URL` env var. Staging: `https://staging.mapadeautoras.com`. Prod: `https://mapadeautoras.com`.                                                                                                                                 | Env-var driven so staging emails link to staging map.                                                                                                                                                                                                                         |
| 13  | Unsubscribe        | Not included. This is transactional (one-per-suggestion, not a subscription).                                                                                                                                                                       | GDPR-wise consent-based, single-shot; when a real newsletter ships, unsubscribe returns with it.                                                                                                                                                                              |
| 14  | Privacy policy     | Reframe now, not later. Drop newsletter mentions; describe the actual current behavior (transactional emails on promote).                                                                                                                           | Accurate-now beats forward-looking-and-slightly-wrong. Add newsletter language back when we ship it.                                                                                                                                                                          |
| 15  | Local dev behavior | If `RESEND_API_KEY` absent, function logs a warning and returns 200 without sending.                                                                                                                                                                | Lets local suggestion + promote flow work without side-effects.                                                                                                                                                                                                               |
| 16  | Existing rows      | Existing suggestions rows get `locale = 'es'` (backfill via column default). No historical row will have `notified_at` set or `promoted_author_id` populated — safe because none have been notified yet.                                            | Backfill via `default 'es'` is the correct behavior for early submitters (Spanish audience).                                                                                                                                                                                  |

---

## Data model

**Migration `supabase/migrations/0010_stage8_notify_submitter.sql`:**

```sql
-- Stage 8 — Notify submitter on promote.
--
-- Adds three columns to suggestions:
--   - locale             : which language to render the notification email in
--   - promoted_author_id : FK back to the created author (nullable; set at promote time)
--   - notified_at        : idempotency marker for the notify_submitter Edge Function
--
-- Also updates the promote_suggestion RPC to populate promoted_author_id in the
-- existing suggestion-resolution block.

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

-- Re-declare promote_suggestion with the single-line addition of
-- `promoted_author_id = new_author_id` inside the resolve-suggestion update.
-- Body copied from 0005_promote_suggestion_rpc.sql with only that change.

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

Also update `supabase/functions/submit_suggestion/index.ts` to include `locale: body.locale` in the `suggestions` insert (currently only stored on the deprecated `subscribers` upsert).

---

## Architecture

```
   Admin (Danny)                    Public visitor
        │                                │
        │ clicks Promote on              │ submits /suggest form
        │ /admin/suggestion/:id          │ with checkbox ticked
        │                                │
        ▼                                ▼
   promoteSuggestion() RPC         submit_suggestion Edge Function
   - inserts author + books        - Turnstile verify
   - marks suggestion 'approved'   - inserts suggestion (accepted_newsletter=true, locale='es'|'en')
   - sets promoted_author_id       - returns 200
        │
        │
        ▼
   Postgres UPDATE on public.suggestions
        │
        │ webhook filter fires:
        │ status='approved' AND accepted_newsletter=true AND notified_at IS NULL
        │
        ▼
   Supabase Database Webhook (staging/prod, configured per-env)
        │
        │ POST /functions/v1/notify_submitter
        │ Authorization: Bearer <service_role>
        │
        ▼
   notify_submitter Edge Function
   ┌────────────────────────────────────────────────┐
   │ 1. Verify service-role bearer                  │
   │ 2. Load full suggestion + linked author        │
   │ 3. Conditional UPDATE                          │
   │      set notified_at = now()                   │
   │      where id = ? AND notified_at IS NULL      │
   │      returning id                              │
   │    If no row: another instance won — return 200│
   │ 4. Render subject + body from i18n[locale]     │
   │    substituting {authorName} + {siteUrl}       │
   │ 5. POST Resend /emails                         │
   │    from = RESEND_FROM_EMAIL                    │
   │    to = suggestion.submitter_email             │
   │ 6. On non-2xx: revert notified_at to NULL      │
   │    return 500 (webhook retries 3×)             │
   │ 7. On success: log + return 200                │
   └────────────────────────────────────────────────┘
        │
        ▼
   Resend API → submitter's inbox
```

---

## Edge Function contract

**File:** `supabase/functions/notify_submitter/index.ts`
**Handler:** `Deno.serve`
**Method:** POST only (405 for others; 204 for OPTIONS preflight)
**Auth:** `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}`; reject with 401 otherwise.

**Request body (Supabase webhook payload):**

```ts
interface WebhookPayload {
  type: "UPDATE";
  table: "suggestions";
  schema: "public";
  record: { id: string /* other fields present but not relied on */ };
  old_record: { id: string /* ... */ };
}
```

**Environment variables:**

| Name                        | Staging value                       | Prod value                          | Notes                      |
| --------------------------- | ----------------------------------- | ----------------------------------- | -------------------------- |
| `RESEND_API_KEY`            | Real key from Resend dashboard      | Real key (same or separate account) | Absent → warn+skip (dev)   |
| `RESEND_FROM_EMAIL`         | `onboarding@resend.dev`             | `hola@mapadeautoras.com`            | Domain-authed in 9b        |
| `SITE_URL`                  | `https://staging.mapadeautoras.com` | `https://mapadeautoras.com`         | Rendered in the email link |
| `SUPABASE_URL`              | auto                                | auto                                | For sb client              |
| `SUPABASE_SERVICE_ROLE_KEY` | auto                                | auto                                | For DB access + auth check |

**Flow (pseudocode):**

```ts
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // 1. Auth
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!bearer || bearer !== serviceKey) return json({ error: "unauthorized" }, 401);

  // 2. Parse payload
  const payload = (await req.json()) as WebhookPayload;
  const suggestionId = payload?.record?.id;
  if (!suggestionId) return json({ error: "bad_payload" }, 400);

  // 3. Local-dev short-circuit
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!resendKey) {
    console.warn("[notify_submitter] RESEND_API_KEY absent — skipping send.");
    return json({ ok: true, skipped: true }, 200);
  }

  // 4. Load suggestion + author
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { persistSession: false },
  });
  const { data: sug, error: loadErr } = await sb
    .from("suggestions")
    .select(
      "id, submitter_email, submitter_name, locale, accepted_newsletter, notified_at, promoted_author_id",
    )
    .eq("id", suggestionId)
    .single();
  if (loadErr || !sug) return json({ error: "load_failed" }, 500);

  // 5. Sanity: was this really an opt-in and not yet notified?
  if (sug.accepted_newsletter !== true) return json({ ok: true, reason: "not_opted_in" }, 200);
  if (sug.notified_at !== null) return json({ ok: true, reason: "already_notified" }, 200);
  if (!sug.promoted_author_id) return json({ ok: true, reason: "no_promoted_author" }, 200);

  const { data: author, error: authorErr } = await sb
    .from("authors")
    .select("name")
    .eq("id", sug.promoted_author_id)
    .single();
  if (authorErr || !author) return json({ error: "author_load_failed" }, 500);

  // 6. Idempotency: try to claim the notify slot
  const { data: claim, error: claimErr } = await sb
    .from("suggestions")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", suggestionId)
    .is("notified_at", null)
    .select("id")
    .single();
  if (claimErr || !claim) return json({ ok: true, reason: "already_claimed" }, 200);

  // 7. Render + send
  //    renderEmail() lives in a sibling module ./email.ts (see below).
  //    Edge Functions can't reach src/i18n/*.json (different bundle), so
  //    email strings are inlined in supabase/functions/notify_submitter/email.ts.
  const { subject, textBody, htmlBody } = renderEmail({
    locale: sug.locale as "es" | "en",
    authorName: author.name,
    submitterName: sug.submitter_name ?? null,
    siteUrl: Deno.env.get("SITE_URL") ?? "https://mapadeautoras.com",
  });

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM_EMAIL"),
      to: sug.submitter_email,
      subject,
      text: textBody,
      html: htmlBody,
    }),
  });

  if (!resendRes.ok) {
    const bodyText = await resendRes.text();
    console.error("[notify_submitter] Resend send failed:", resendRes.status, bodyText);
    // Revert claim so webhook retry can try again.
    await sb.from("suggestions").update({ notified_at: null }).eq("id", suggestionId);
    return json({ error: "resend_failed", status: resendRes.status }, 500);
  }

  return json({ ok: true }, 200);
});
```

---

## Email content

**Substitution rules** (applied by `renderEmail()`):

- `{authorName}` — required; from the linked `authors.name`.
- `{siteUrl}` — required; from `SITE_URL` env var.
- Salutation branch: if `submitterName` is present, the greeting is `Hola, {submitterName},` / `Hi {submitterName},`; if absent, it's `Hola,` / `Hi,`. Rendered by an explicit conditional in `renderEmail()` — not a placeholder in the strings.

**ES:**

Subject: `Tu sugerencia está en el mapa`

Text body (with submitter name):

```
Hola, {submitterName},

Acabo de añadir a {authorName} al mapa de autoras — gracias por la sugerencia.

Ver el mapa: {siteUrl}

Danny
```

Text body (no submitter name — identical apart from the greeting):

```
Hola,

Acabo de añadir a {authorName} al mapa de autoras — gracias por la sugerencia.

Ver el mapa: {siteUrl}

Danny
```

**EN:**

Subject: `Your suggestion is on the map`

Text body (with submitter name):

```
Hi {submitterName},

I just added {authorName} to the map — thanks for the suggestion.

See the map: {siteUrl}

Danny
```

Text body (no submitter name):

```
Hi,

I just added {authorName} to the map — thanks for the suggestion.

See the map: {siteUrl}

Danny
```

HTML mirror: same content, wrapped in minimal `<p>` structure with the link as an `<a>`. No inline styling beyond a default sans-serif font-stack. Full HTML polish is Phase 2.

**`supabase/functions/notify_submitter/email.ts` — inlined string map:**

```ts
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

export function renderEmail(input: {
  locale: "es" | "en";
  authorName: string;
  submitterName: string | null;
  siteUrl: string;
}): { subject: string; textBody: string; htmlBody: string } {
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
    `<p>${greeting}</p>` +
    `<p>${bodyLine}</p>` +
    `<p><a href="${input.siteUrl}">${s.ctaLabel}</a></p>` +
    `<p>${s.signature}</p>`;

  return { subject: s.subject, textBody, htmlBody };
}
```

---

## i18n changes

**`src/i18n/es.json` + `src/i18n/en.json`:**

1. **Tighten opt-in label** (`suggest.form.newsletter_label`):
   - ES: `"Avísame cuando publique esta autora o las próximas"` → `"Avísame cuando añada esta autora al mapa"`
   - EN: `"Notify me when I publish this writer or upcoming ones"` → `"Let me know when I add this writer to the map"`

2. **Add `emails.notify_submitter.*` namespace** (used only server-side by the Edge Function; loaded via a small helper mirror of `t()` or inlined constants):
   - `emails.notify_submitter.subject`
   - `emails.notify_submitter.body_text`
   - `emails.notify_submitter.body_html`

3. **Privacy policy — remove newsletter framing:**
   - `privacy.collect_body` — drop "o te suscribes al newsletter"; replace with "o marcas la casilla para que te avise cuando la publique."
   - `privacy.legal_basis_body` — drop "para envío del newsletter"; replace with "para avisarte cuando publique tu sugerencia."
   - `privacy.retention_body` — drop the "Suscriptores del newsletter" paragraph.
   - `privacy.changes_body` — drop "se anunciarán a los suscriptores del newsletter."
   - `privacy.thirdparties_body` — reframe Resend mention: "envío de emails transaccionales."
   - EN mirrors all of the above.

---

## Webhook configuration

**Location:** Supabase dashboard → staging project → Database → Webhooks → Create.

**Configuration (staging, mirrored in 9b for prod):**

| Field   | Value                                                             |
| ------- | ----------------------------------------------------------------- |
| Name    | `notify_submitter_on_promote`                                     |
| Table   | `public.suggestions`                                              |
| Events  | `UPDATE`                                                          |
| Type    | HTTP Request                                                      |
| Method  | POST                                                              |
| URL     | `https://<project-ref>.supabase.co/functions/v1/notify_submitter` |
| Headers | `Authorization: Bearer <service_role_key>`                        |
| Filter  | `status = "approved"` (see note)                                  |

**Filter note:** Supabase Database Webhook filters historically support single-column equality only. If the dashboard supports the compound expression `status = "approved" AND accepted_newsletter = true AND notified_at IS NULL`, use it — spurious invocations drop to zero. If it doesn't, filter on `status = "approved"` alone and rely on the function's internal guards (steps 5–6 in the Edge Function pseudocode) to short-circuit on `!accepted_newsletter`, `notified_at != null`, and `promoted_author_id == null`. Either way, at-most-once delivery is preserved. Implementation task: try the compound filter first; fall back to single-column if unsupported and document the actual filter used in `notify-submitter-debug.md`.

The dashboard-managed nature of this config is a known maintainability concern — mitigated by the debug runbook (below).

---

## Env vars — additions

**`.env.example`:**

```
# Stage 8 — notify_submitter Edge Function (staging + prod)
# Get from https://resend.com/api-keys (free tier; Danny's account)
RESEND_API_KEY=""
# Staging: onboarding@resend.dev (Resend's shared shell — sends only to Danny's Resend-registered email)
# Prod   : hola@mapadeautoras.com (domain-authed in Stage 9b)
RESEND_FROM_EMAIL=""
# Rendered as the "See the map" link in the email.
# Staging: https://staging.mapadeautoras.com
# Prod   : https://mapadeautoras.com
SITE_URL=""
```

Set the same three vars on the staging Supabase project via dashboard → Edge Functions → Manage secrets.

---

## Documentation deliverables

- **`docs/01-implementation-plan.md`** — rewrite Stage 8 section to reflect the notify-submitter scope; drop the old newsletter/confirm/audience-sync bullets.
- **`docs/50-launch-checklist.md`** — item 3 (Newsletter) becomes "Notify submitter on promote"; strip the `/newsletter` page + double-opt-in bullets; strike the "same Resend account provisioned in Stage 9b" line (Resend now provisioned in Stage 8 for staging).
- **`docs/RAG.md`** — add row for this spec doc + the debug runbook.
- **`docs/30-ops/notify-submitter-debug.md`** — new runbook. Sections: webhook location + config, how to check delivery, how to identify the failure mode from the function logs, manual retry SQL (`update suggestions set notified_at = null where id = ?`), how to test locally.
- **`docs/STATUS.md`** — session log at end of implementation.
- **`.env.example`** — the 3 new vars documented above.
- **`docs/adr/`** — no new ADR; this spec captures the architecture. If the pattern extends to real newsletter later, an ADR at that point.

---

## Verification (manual, on staging)

1. `npm run build` passes.
2. Migration `0010_stage8_notify_submitter.sql` applies to staging Supabase without error. Verify columns via Studio.
3. `supabase functions deploy notify_submitter --project-ref <staging-ref>` succeeds. Function visible in dashboard.
4. Webhook configured in staging dashboard with the filter above.
5. `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SITE_URL` set on staging function secrets.
6. Submit a suggestion via `/suggest` with checkbox **ticked**, using Danny's Resend-registered email.
7. Log in as admin → promote the suggestion.
8. Email arrives at Danny's inbox within seconds. Content matches the ES/EN template based on the suggestion's `locale`.
9. `suggestions.notified_at` in Studio is populated for that row.
10. **Regression:** submit + promote a suggestion with checkbox **unticked** → no email fires, `notified_at` stays NULL.
11. **Regression:** submit twice with the same email, promote the first → only one email fires (idempotency via `notified_at`).
12. **Idempotency stress:** manually replay the webhook payload against the function URL (dashboard → Functions → Invoke) after a successful send → function returns 200 with `already_notified`, no second email.
13. `promote_suggestion` RPC populates `promoted_author_id` on the suggestion row (verify in Studio).

---

## Definition of done — Stage 8

- [ ] Migration 0010 applied to staging.
- [ ] `notify_submitter` deployed to staging.
- [ ] Webhook configured on staging with the filter.
- [ ] Env vars set on staging function secrets.
- [ ] End-to-end test passes: opt-in submission → promote → email delivered → `notified_at` populated.
- [ ] Regression passes: opt-out submission → promote → no email, `notified_at` NULL.
- [ ] Docs updated (implementation-plan, launch-checklist, RAG, STATUS, debug runbook, `.env.example`).
- [ ] i18n copy landed (opt-in label tightened, privacy policy reframed, email content strings added).
- [ ] Manual review at end of the branch by Alejandro before merging to `development`.
