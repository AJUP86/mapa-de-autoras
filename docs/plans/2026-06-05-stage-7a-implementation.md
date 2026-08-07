# Stage 7a Implementation Plan — Notify + Auth + Read-only Inbox

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up suggestion notifications, owner magic-link login, and a read-only inbox of pending suggestions on `feature/07a-notify-and-auth`.

**Architecture:** Postgres trigger → `pg_net` → `notify_owner` Edge Function (Resend or log-only). Static admin pages under `/admin/*` with a React island guarding via `supabase.auth.getSession()` + `is_admin()`. PostgREST reads with the user's JWT — RLS is the real authorization gate.

**Tech Stack:** Astro 5 (static), React 19, Tailwind 4, Supabase (Postgres + GoTrue + Edge Runtime), pg_net, Resend, Cloudflare Turnstile (existing), Inbucket (local mail catcher).

**Companion spec:** [docs/specs/2026-06-05-stage-7a-design.md](../specs/2026-06-05-stage-7a-design.md)

**Workflow notes specific to this repo:**

- Alejandro commits, pushes, and merges manually. **Do not run `git commit`, `git push`, or `git merge`.** Every commit step in this plan is a **suggested message** for Alejandro to run.
- After each Slice (A, B, C), pause for Alejandro's review before continuing.
- All paths are relative to repo root `D:\alejandro\personal_projects\mapa-de-autoras\`.
- The project does not use automated tests (per implementation-plan § "Definition of done"). Verification is **manual**: run the command listed, check the expected output.

---

## File map

**Created**

- `supabase/migrations/0003_notify_owner_trigger.sql`
- `supabase/functions/notify_owner/index.ts`
- `src/lib/admin-session.ts`
- `src/lib/suggestions.ts`
- `src/components/AdminGate.tsx`
- `src/components/AdminLoginForm.tsx`
- `src/components/AdminInbox.tsx`
- `src/pages/admin/login.astro`
- `src/pages/admin/index.astro`
- `src/pages/admin/suggestions/[id].astro`

**Modified**

- `.env.example` — add `PUBLIC_SITE_URL`
- `supabase/config.toml` — register `notify_owner` function
- `package.json` — `dev:functions` serves all functions, not just `submit_suggestion`
- `supabase/README.md` — document Slice A's notification flow
- `src/i18n/es.json` — `admin.*` namespace
- `src/i18n/en.json` — empty `admin` stub for bilingual-readiness

---

# Slice A — Notification path

Goal: a suggestion INSERT triggers an HTTP POST to the `notify_owner` Edge Function, which logs the payload (dev) or sends via Resend (when key set). Not user-facing yet.

---

## Task A1 — Add `PUBLIC_SITE_URL` to `.env.example`

**Files:**

- Modify: `.env.example`

- [ ] **Step 1: Add the new env var entry**

Append the following block to `.env.example` (after the existing `OWNER_NOTIFICATION_EMAIL` section):

```
# -----------------------------------------------------------------------------
# Site URL (Stage 7a)
# -----------------------------------------------------------------------------
# Used by the notify_owner Edge Function to build deep-links into the admin
# inbox (e.g. `${PUBLIC_SITE_URL}/admin/suggestions/<id>`).
#
# Local dev: http://localhost:4321
# Production: https://mapadeautoras.com

PUBLIC_SITE_URL=http://localhost:4321
```

- [ ] **Step 2: Copy the new entry into your actual `.env`**

Open `.env` and add the same `PUBLIC_SITE_URL=http://localhost:4321` line. The Edge Function will read it via `--env-file .env`.

- [ ] **Step 3: Verify**

```sh
grep PUBLIC_SITE_URL .env.example
```

Expected: prints the `PUBLIC_SITE_URL=...` line.

```sh
grep PUBLIC_SITE_URL .env
```

Expected: prints the line from `.env`.

---

## Task A2 — Create the trigger migration

**Files:**

- Create: `supabase/migrations/0003_notify_owner_trigger.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0003_notify_owner_trigger.sql` with the following content (single file, exactly as shown):

```sql
-- Stage 7a — Notify the owner when a new suggestion lands.
--
-- An AFTER INSERT trigger on public.suggestions enqueues an HTTP POST to the
-- notify_owner Edge Function via pg_net. The request runs asynchronously in
-- pg_net's background worker — a failed POST does NOT roll back the INSERT.
-- Failures land in net._http_response for inspection.
--
-- URL strategy:
--   - LOCAL DEV: pg_net runs inside the Postgres container; the host's Edge
--     Runtime is reachable at http://host.docker.internal:54321.
--   - PRODUCTION: set `app.functions_url` via
--       alter database postgres set "app.functions_url" = 'https://<ref>.supabase.co/functions/v1';
--     The trigger reads it via current_setting() and falls back to the dev
--     URL if unset.
--
-- Authorization (MVP posture):
--   - notify_owner has `verify_jwt = false` (same as submit_suggestion).
--   - The trigger sends `X-Webhook-Source: postgres` so the function can do a
--     cheap header check. Not real auth — Stage 9 should either flip
--     verify_jwt on and pass a service-role bearer, or move to the Supabase
--     Database Webhooks UI.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_owner_of_suggestion()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  functions_url text := coalesce(
    current_setting('app.functions_url', true),
    'http://host.docker.internal:54321/functions/v1'
  );
begin
  perform net.http_post(
    url     := functions_url || '/notify_owner',
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'X-Webhook-Source', 'postgres'
    ),
    body    := jsonb_build_object(
      'type',   'INSERT',
      'table',  'suggestions',
      'record', row_to_json(NEW)
    )
  );
  return NEW;
end;
$$;

create trigger notify_owner_after_insert
  after insert on public.suggestions
  for each row execute function public.notify_owner_of_suggestion();

comment on function public.notify_owner_of_suggestion() is
  'AFTER INSERT trigger on public.suggestions. Enqueues an HTTP POST to the notify_owner Edge Function via pg_net. Failures are non-fatal (async).';
```

- [ ] **Step 2: Verify the migration applies cleanly**

Make sure `supabase start` is running, then:

```sh
npm run dev:db:reset
```

Expected output ends with:

```
Finished supabase db reset on branch ...
```

No errors. The migration should appear in the reset log: `Applying migration 0003_notify_owner_trigger.sql...`.

- [ ] **Step 3: Verify the trigger exists**

In Studio's SQL Editor (`http://127.0.0.1:54323`):

```sql
select tgname, tgenabled from pg_trigger
where tgrelid = 'public.suggestions'::regclass and not tgisinternal;
```

Expected: one row, `notify_owner_after_insert | O` (O = enabled, origin).

---

## Task A3 — Create the `notify_owner` Edge Function

**Files:**

- Create: `supabase/functions/notify_owner/index.ts`

- [ ] **Step 1: Write the function**

Create `supabase/functions/notify_owner/index.ts` with:

```ts
// notify_owner — Stage 7a
//
// Called by an AFTER INSERT trigger on public.suggestions (via pg_net).
// Sends the owner an email when a new suggestion lands.
//
// In dev (RESEND_API_KEY empty), logs the payload to the console instead of
// sending. Lets us verify trigger -> function plumbing without Resend.
//
// Env it reads:
//   RESEND_API_KEY              - empty in dev = log-only mode
//   RESEND_FROM_EMAIL           - sender (e.g. hola@mapadeautoras.com)
//   OWNER_NOTIFICATION_EMAIL    - recipient
//   PUBLIC_SITE_URL             - used to build the inbox deep-link

interface TriggerPayload {
  type: "INSERT";
  table: "suggestions";
  record: {
    id: string;
    submitter_email: string;
    submitter_name: string | null;
    proposed_author_name: string;
    proposed_country_iso_a3: string;
    proposed_books_text: string | null;
    note: string | null;
    accepted_newsletter: boolean;
    created_at: string;
  };
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Webhook-Source",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function buildEmailBody(
  record: TriggerPayload["record"],
  siteUrl: string,
): { subject: string; text: string } {
  const subject = `Nueva sugerencia: ${record.proposed_author_name}`;
  const reviewUrl = `${siteUrl}/admin/suggestions/${record.id}`;
  const text = [
    `Nueva sugerencia recibida.`,
    ``,
    `Autora propuesta: ${record.proposed_author_name}`,
    `País: ${record.proposed_country_iso_a3}`,
    `Libros sugeridos: ${record.proposed_books_text ?? "(ninguno)"}`,
    `Nota: ${record.note ?? "(ninguna)"}`,
    `Enviado por: ${record.submitter_name ?? "(sin nombre)"} <${record.submitter_email}>`,
    `Newsletter opt-in: ${record.accepted_newsletter ? "sí" : "no"}`,
    ``,
    `Revisar: ${reviewUrl}`,
  ].join("\n");
  return { subject, text };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: TriggerPayload;
  try {
    payload = (await req.json()) as TriggerPayload;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (payload.type !== "INSERT" || payload.table !== "suggestions" || !payload.record) {
    return json({ error: "unexpected_payload" }, 400);
  }

  const ownerEmail = Deno.env.get("OWNER_NOTIFICATION_EMAIL") ?? "";
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  const siteUrl = Deno.env.get("PUBLIC_SITE_URL") ?? "http://localhost:4321";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";

  if (!ownerEmail) {
    console.error("[notify_owner] OWNER_NOTIFICATION_EMAIL not set");
    return json({ error: "server_misconfigured" }, 500);
  }

  const { subject, text } = buildEmailBody(payload.record, siteUrl);

  if (!resendKey) {
    console.log("[notify_owner] RESEND_API_KEY empty — log-only mode");
    console.log(`  To:      ${ownerEmail}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body:\n${text}`);
    return json({ ok: true, sent: false, mode: "log" }, 200);
  }

  if (!fromEmail) {
    console.error("[notify_owner] RESEND_FROM_EMAIL not set");
    return json({ error: "server_misconfigured" }, 500);
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: ownerEmail,
      subject,
      text,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[notify_owner] resend failed (${resp.status}):`, errText);
    return json({ error: "send_failed" }, 500);
  }

  return json({ ok: true, sent: true, mode: "resend" }, 200);
});
```

- [ ] **Step 2: Ensure `OWNER_NOTIFICATION_EMAIL` is set in `.env`**

Open `.env` and confirm `OWNER_NOTIFICATION_EMAIL=<your-email>` is present and non-empty. If not, set it now.

```sh
grep OWNER_NOTIFICATION_EMAIL .env
```

Expected: prints a non-empty value.

---

## Task A4 — Register the function in `config.toml` and update `dev:functions`

**Files:**

- Modify: `supabase/config.toml`
- Modify: `package.json`

- [ ] **Step 1: Register `notify_owner` in `config.toml`**

Open `supabase/config.toml`. After the existing `[functions.submit_suggestion]` block, append:

```toml
[functions.notify_owner]
enabled = true
verify_jwt = false
```

- [ ] **Step 2: Update `dev:functions` script to serve all functions**

Open `package.json`. The current script is:

```json
"dev:functions": "supabase functions serve submit_suggestion --env-file .env",
```

Change to:

```json
"dev:functions": "supabase functions serve --env-file .env",
```

The unnamed form serves every function listed in `config.toml` (currently `submit_suggestion` + `notify_owner`).

- [ ] **Step 3: Verify the script change**

```sh
grep "dev:functions" package.json
```

Expected: `"dev:functions": "supabase functions serve --env-file .env",`

---

## Task A5 — End-to-end manual verification of Slice A

- [ ] **Step 1: Restart the Edge runtime**

If `npm run dev:functions` was running, stop it (Ctrl+C) and restart so it picks up the new function:

```sh
npm run dev:functions
```

Expected: serves both `submit_suggestion` and `notify_owner`. You should see startup logs mentioning both function names. Leave this terminal running.

- [ ] **Step 2: Apply the migration**

In another terminal:

```sh
npm run dev:db:reset
```

Expected: applies migrations 0001, 0002, 0003 cleanly, then runs both seeds. No errors.

- [ ] **Step 3: Submit a suggestion via the public form**

In a third terminal, ensure Astro is running:

```sh
npm run dev
```

Then open `http://localhost:4321/suggest` in your browser, fill in the form, and submit.

- [ ] **Step 4: Verify the trigger fired and the function logged the payload**

Switch to the `dev:functions` terminal. Within a couple of seconds of the submit, you should see lines like:

```
[notify_owner] RESEND_API_KEY empty — log-only mode
  To:      <your-email>
  Subject: Nueva sugerencia: <author>
  Body:
  Nueva sugerencia recibida.
  ...
  Revisar: http://localhost:4321/admin/suggestions/<uuid>
```

Expected: the log block prints exactly once per submitted suggestion.

- [ ] **Step 5: (Optional) Verify pg_net actually sent the request**

In Studio's SQL Editor:

```sql
select status_code, content_type, created
from net._http_response
order by created desc
limit 5;
```

Expected: most recent row has `status_code = 200`.

- [ ] **Step 6: Suggested commit (Alejandro runs)**

```sh
git add supabase/migrations/0003_notify_owner_trigger.sql \
        supabase/functions/notify_owner/index.ts \
        supabase/config.toml \
        package.json \
        .env.example
git commit -m "feat(stage-7a): notify_owner edge function + suggestion INSERT trigger"
```

**Pause here for Alejandro's review before starting Slice B.**

---

# Slice B — Auth shell

Goal: `/admin/login` accepts an email, sends a magic-link via Supabase Auth, and lands the owner on `/admin` authenticated. `<AdminGate>` enforces "no session → redirect to login."

---

## Task B1 — Add admin i18n strings

**Files:**

- Modify: `src/i18n/es.json`
- Modify: `src/i18n/en.json`

- [ ] **Step 1: Read the current ES catalog**

```sh
type src\i18n\es.json
```

(or open it in the IDE)

- [ ] **Step 2: Add the `admin` namespace to `src/i18n/es.json`**

Add this top-level key alongside the existing namespaces (`nav`, `hero`, `suggest`, etc.):

```json
"admin": {
  "login": {
    "title": "Acceso",
    "subtitle": "Entra con tu correo. Te enviaremos un enlace mágico.",
    "email_label": "Correo electrónico",
    "submit": "Enviar enlace",
    "submitting": "Enviando…",
    "success": "Revisa tu correo y haz clic en el enlace para entrar.",
    "error_generic": "No se pudo enviar el enlace. Inténtalo de nuevo.",
    "error_not_admin": "Esta cuenta no tiene acceso de administrador."
  },
  "common": {
    "sign_out": "Cerrar sesión",
    "logged_in_as": "Sesión iniciada como"
  }
}
```

- [ ] **Step 3: Add an empty `admin` stub to `src/i18n/en.json`**

Mirror the structure with empty strings (bilingual-readiness; we'll fill these later if we ever ship `/en/admin/*`):

```json
"admin": {
  "login": {
    "title": "",
    "subtitle": "",
    "email_label": "",
    "submit": "",
    "submitting": "",
    "success": "",
    "error_generic": "",
    "error_not_admin": ""
  },
  "common": {
    "sign_out": "",
    "logged_in_as": ""
  }
}
```

- [ ] **Step 4: Verify both files parse as JSON**

```sh
node -e "JSON.parse(require('fs').readFileSync('src/i18n/es.json','utf8')); console.log('es ok')"
node -e "JSON.parse(require('fs').readFileSync('src/i18n/en.json','utf8')); console.log('en ok')"
```

Expected: `es ok` and `en ok` on separate lines.

---

## Task B2 — Create `src/lib/admin-session.ts`

**Files:**

- Create: `src/lib/admin-session.ts`

- [ ] **Step 1: Write the module**

```ts
// admin-session.ts — Stage 7a
//
// Thin wrappers around supabase.auth used by the admin pages. The Supabase
// client is the same one used by everything else (anon key); after sign-in
// it holds the user's authenticated JWT in localStorage. PostgREST calls
// then carry that JWT and RLS's is_admin() does the real authorization.

import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type AdminSessionState =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | { kind: "not-admin"; session: Session }
  | { kind: "admin"; session: Session };

export async function readSession(): Promise<AdminSessionState> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return { kind: "anonymous" };
  if (!isAdmin(data.session)) return { kind: "not-admin", session: data.session };
  return { kind: "admin", session: data.session };
}

export function isAdmin(session: Session): boolean {
  const role = session.user.app_metadata?.role;
  return role === "admin";
}

export async function requestMagicLink(
  email: string,
  redirectTo: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```sh
npx astro check
```

Expected: zero errors. (Warnings about other files are not from this task.)

---

## Task B3 — Create `<AdminGate>`

**Files:**

- Create: `src/components/AdminGate.tsx`

- [ ] **Step 1: Write the component**

```tsx
// AdminGate.tsx — Stage 7a
//
// Client-side session guard for /admin/* pages. Renders nothing while it
// checks the session; redirects to loginUrl if unauthenticated; signs out
// + shows a small error if the session lacks app_metadata.role = 'admin'.
//
// RLS is the real authorization gate — this component is UX, not security.

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { readSession, signOut, type AdminSessionState } from "../lib/admin-session";
import { supabase } from "../lib/supabase";

interface Props {
  loginUrl: string;
  notAdminLabel: string;
  children: ReactNode;
}

export default function AdminGate({ loginUrl, notAdminLabel, children }: Props) {
  const [state, setState] = useState<AdminSessionState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    readSession().then((s) => {
      if (cancelled) return;
      setState(s);
      if (s.kind === "anonymous") window.location.replace(loginUrl);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (!session) {
        setState({ kind: "anonymous" });
        window.location.replace(loginUrl);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loginUrl]);

  if (state.kind === "loading" || state.kind === "anonymous") {
    return null;
  }
  if (state.kind === "not-admin") {
    return (
      <div className="p-6 text-center">
        <p className="text-oxblood">{notAdminLabel}</p>
        <button
          onClick={async () => {
            await signOut();
            window.location.replace(loginUrl);
          }}
          className="mt-4 underline"
        >
          OK
        </button>
      </div>
    );
  }
  return <>{children}</>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```sh
npx astro check
```

Expected: zero errors.

---

## Task B4 — Create `<AdminLoginForm>`

**Files:**

- Create: `src/components/AdminLoginForm.tsx`

- [ ] **Step 1: Write the component**

```tsx
// AdminLoginForm.tsx — Stage 7a
//
// Magic-link request form. On submit, asks Supabase to send a one-time-token
// email. Supabase honors `enable_signup = false` from config.toml — if the
// email doesn't match an existing user, no email is sent (silent, by design).

import { useState, type FormEvent } from "react";
import { requestMagicLink } from "../lib/admin-session";

interface Labels {
  title: string;
  subtitle: string;
  email_label: string;
  submit: string;
  submitting: string;
  success: string;
  error_generic: string;
}

interface Props {
  redirectTo: string;
  labels: Labels;
}

export default function AdminLoginForm({ redirectTo, labels }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || status === "sending") return;
    setStatus("sending");
    setError(null);
    const result = await requestMagicLink(email.trim(), redirectTo);
    if (result.ok) {
      setStatus("sent");
    } else {
      setStatus("error");
      setError(result.error || labels.error_generic);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-sm space-y-4 p-6">
      <h1 className="font-serif text-2xl text-ink">{labels.title}</h1>
      <p className="text-sm text-ink/70">{labels.subtitle}</p>
      <label className="block">
        <span className="text-sm text-ink/80">{labels.email_label}</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "sending" || status === "sent"}
          className="mt-1 block w-full rounded border border-ink/20 bg-parchment px-3 py-2 text-ink"
        />
      </label>
      <button
        type="submit"
        disabled={status === "sending" || status === "sent" || !email.trim()}
        className="w-full rounded bg-oxblood px-4 py-2 text-parchment disabled:opacity-50"
      >
        {status === "sending" ? labels.submitting : labels.submit}
      </button>
      {status === "sent" && (
        <p className="text-sm text-sage" role="status">
          {labels.success}
        </p>
      )}
      {status === "error" && error && (
        <p className="text-sm text-oxblood" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```sh
npx astro check
```

Expected: zero errors.

---

## Task B5 — Create `/admin/login` page

**Files:**

- Create: `src/pages/admin/login.astro`

- [ ] **Step 1: Write the page**

```astro
---
// src/pages/admin/login.astro — Stage 7a
import Base from "../../layouts/Base.astro";
import AdminLoginForm from "../../components/AdminLoginForm";
import { t } from "../../i18n/t";

const lang = "es" as const;
const labels = {
  title: t(lang, "admin.login.title"),
  subtitle: t(lang, "admin.login.subtitle"),
  email_label: t(lang, "admin.login.email_label"),
  submit: t(lang, "admin.login.submit"),
  submitting: t(lang, "admin.login.submitting"),
  success: t(lang, "admin.login.success"),
  error_generic: t(lang, "admin.login.error_generic"),
};
---

<Base lang={lang} title={labels.title}>
  <main class="min-h-screen bg-parchment">
    <AdminLoginForm client:load redirectTo="/admin" labels={labels} />
  </main>
</Base>
```

- [ ] **Step 2: Verify Astro builds the page**

```sh
npx astro check
```

Expected: zero errors.

---

## Task B6 — Create `/admin/index` placeholder page

**Files:**

- Create: `src/pages/admin/index.astro`

- [ ] **Step 1: Write the page (placeholder; Slice C will wire `<AdminInbox>`)**

```astro
---
// src/pages/admin/index.astro — Stage 7a (placeholder for Slice C)
import Base from "../../layouts/Base.astro";
import AdminGate from "../../components/AdminGate";
import { t } from "../../i18n/t";

const lang = "es" as const;
const notAdminLabel = t(lang, "admin.login.error_not_admin");
---

<Base lang={lang} title="Admin">
  <main class="min-h-screen bg-parchment p-6">
    <AdminGate client:load loginUrl="/admin/login" notAdminLabel={notAdminLabel}>
      <p class="text-ink">Sesión iniciada. (Bandeja en Slice C.)</p>
    </AdminGate>
  </main>
</Base>
```

- [ ] **Step 2: Verify Astro builds the page**

```sh
npx astro check
```

Expected: zero errors.

---

## Task B7 — Bootstrap the admin user (one-time, if not already done)

This step is **only needed once per local DB reset** — your owner user must exist with `app_metadata.role = 'admin'` for `is_admin()` to return true.

- [ ] **Step 1: Open Studio**

`http://127.0.0.1:54323` → Authentication → Users → **Add user** → set your email + a password (the password isn't used for magic-link login but Supabase requires it at user creation).

- [ ] **Step 2: Mark the user as admin**

In Studio's SQL Editor, run (replace the email):

```sql
update auth.users
set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{role}', '"admin"')
where email = 'YOUR-OWNER-EMAIL@example.com';
```

Expected: `UPDATE 1`.

- [ ] **Step 3: Verify the role landed**

```sql
select email, raw_app_meta_data from auth.users where email = 'YOUR-OWNER-EMAIL@example.com';
```

Expected: `raw_app_meta_data` includes `"role": "admin"`.

---

## Task B8 — End-to-end manual verification of Slice B

- [ ] **Step 1: Start everything**

Three terminals (one each):

```sh
npm run dev:db        # if not already up
npm run dev:functions
npm run dev
```

- [ ] **Step 2: Verify the unauthenticated redirect**

Open `http://localhost:4321/admin` in a private browser window (no existing session).
Expected: lands on `http://localhost:4321/admin/login` (the gate redirects).

- [ ] **Step 3: Request a magic-link**

On the login page, enter your owner email, click "Enviar enlace".
Expected: "Revisa tu correo y haz clic en el enlace para entrar." appears below the button.

- [ ] **Step 4: Read the magic-link from Mailpit**

Open `http://127.0.0.1:54324` (Mailpit). The most recent message should be from `noreply@mail.app.supabase.io` with subject "Magic Link". Open it and click the "Log in" link.
Expected: the link opens `http://localhost:4321/admin#access_token=...&...` → Supabase exchanges the token in the URL hash for a session → `<AdminGate>` sees the admin session → "Sesión iniciada. (Bandeja en Slice C.)" appears.

- [ ] **Step 5: Verify a non-admin is bounced**

In Studio, temporarily strip the admin role:

```sql
update auth.users set raw_app_meta_data = '{}'::jsonb where email = 'YOUR-OWNER-EMAIL@example.com';
```

Refresh `/admin`. Expected: shows the "Esta cuenta no tiene acceso de administrador." message and an "OK" button that signs out.

Restore the role:

```sql
update auth.users
set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{role}', '"admin"')
where email = 'YOUR-OWNER-EMAIL@example.com';
```

Sign in again to verify access is back.

- [ ] **Step 6: Suggested commit (Alejandro runs)**

```sh
git add src/i18n/es.json src/i18n/en.json \
        src/lib/admin-session.ts \
        src/components/AdminGate.tsx src/components/AdminLoginForm.tsx \
        src/pages/admin/login.astro src/pages/admin/index.astro
git commit -m "feat(stage-7a): admin magic-link login + AdminGate session guard"
```

**Pause here for Alejandro's review before starting Slice C.**

---

# Slice C — Read-only inbox

Goal: `/admin` shows pending suggestions newest-first. Clicking a row goes to a placeholder detail page.

---

## Task C1 — Add inbox i18n strings

**Files:**

- Modify: `src/i18n/es.json`
- Modify: `src/i18n/en.json`

- [ ] **Step 1: Extend the `admin` namespace in `src/i18n/es.json`**

Add the `inbox` subkey to the existing `admin` object:

```json
"inbox": {
  "title": "Sugerencias pendientes",
  "empty": "No hay sugerencias pendientes.",
  "loading": "Cargando…",
  "error": "No se pudieron cargar las sugerencias.",
  "col_date": "Fecha",
  "col_author": "Autora",
  "col_country": "País",
  "col_email": "Correo",
  "view": "Revisar"
},
"detail": {
  "placeholder_title": "Detalle de sugerencia",
  "placeholder_body": "Próximamente — Stage 7b."
}
```

The full `admin` block in `es.json` should now look like:

```json
"admin": {
  "login": { ... },
  "common": { ... },
  "inbox": { ... },
  "detail": { ... }
}
```

- [ ] **Step 2: Mirror empty stubs in `src/i18n/en.json`**

Add the same `inbox` and `detail` subkeys with empty strings, just like the `login` stub from Task B1.

- [ ] **Step 3: Verify both files parse**

```sh
node -e "JSON.parse(require('fs').readFileSync('src/i18n/es.json','utf8')); console.log('es ok')"
node -e "JSON.parse(require('fs').readFileSync('src/i18n/en.json','utf8')); console.log('en ok')"
```

Expected: both print `ok`.

---

## Task C2 — Create `src/lib/suggestions.ts`

**Files:**

- Create: `src/lib/suggestions.ts`

- [ ] **Step 1: Write the query helper**

```ts
// suggestions.ts — Stage 7a
//
// Read helper for the admin inbox. Uses the authenticated supabase client
// (anon key + user JWT). RLS's "admins manage suggestions" policy allows
// the SELECT when is_admin() returns true.

import { supabase } from "./supabase";

export interface PendingSuggestion {
  id: string;
  created_at: string;
  proposed_author_name: string;
  proposed_country_iso_a3: string;
  submitter_email: string;
}

export async function listPendingSuggestions(): Promise<PendingSuggestion[]> {
  const { data, error } = await supabase
    .from("suggestions")
    .select("id, created_at, proposed_author_name, proposed_country_iso_a3, submitter_email")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[suggestions] list pending failed:", error.message);
    throw error;
  }
  return (data ?? []) as PendingSuggestion[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```sh
npx astro check
```

Expected: zero errors.

---

## Task C3 — Create `<AdminInbox>`

**Files:**

- Create: `src/components/AdminInbox.tsx`

- [ ] **Step 1: Write the component**

```tsx
// AdminInbox.tsx — Stage 7a
//
// Read-only list of pending suggestions. Renders nothing while loading,
// an empty-state message if there are none, or a table with one row per
// suggestion. Clicking a row navigates to /admin/suggestions/:id.

import { useEffect, useState } from "react";
import { listPendingSuggestions, type PendingSuggestion } from "../lib/suggestions";

interface Labels {
  title: string;
  empty: string;
  loading: string;
  error: string;
  col_date: string;
  col_author: string;
  col_country: string;
  col_email: string;
  view: string;
}

interface Props {
  labels: Labels;
}

type State =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "loaded"; rows: PendingSuggestion[] };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

export default function AdminInbox({ labels }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    listPendingSuggestions()
      .then((rows) => {
        if (!cancelled) setState({ kind: "loaded", rows });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mx-auto max-w-4xl">
      <h1 className="font-serif text-2xl text-ink mb-4">{labels.title}</h1>
      {state.kind === "loading" && <p className="text-ink/60">{labels.loading}</p>}
      {state.kind === "error" && (
        <p className="text-oxblood" role="alert">
          {labels.error}
        </p>
      )}
      {state.kind === "loaded" && state.rows.length === 0 && (
        <p className="text-ink/60">{labels.empty}</p>
      )}
      {state.kind === "loaded" && state.rows.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink/20 text-left text-ink/70">
              <th className="py-2 pr-4">{labels.col_date}</th>
              <th className="py-2 pr-4">{labels.col_author}</th>
              <th className="py-2 pr-4">{labels.col_country}</th>
              <th className="py-2 pr-4">{labels.col_email}</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {state.rows.map((row) => (
              <tr key={row.id} className="border-b border-ink/10 hover:bg-bone/40">
                <td className="py-2 pr-4 text-ink/80">{formatDate(row.created_at)}</td>
                <td className="py-2 pr-4 text-ink">{row.proposed_author_name}</td>
                <td className="py-2 pr-4 text-ink/80">{row.proposed_country_iso_a3}</td>
                <td className="py-2 pr-4 text-ink/70">{row.submitter_email}</td>
                <td className="py-2">
                  <a href={`/admin/suggestions/${row.id}`} className="text-oxblood underline">
                    {labels.view} →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```sh
npx astro check
```

Expected: zero errors.

---

## Task C4 — Wire `<AdminInbox>` into `/admin/index.astro`

**Files:**

- Modify: `src/pages/admin/index.astro`

- [ ] **Step 1: Replace the placeholder body with the inbox**

Replace the entire contents of `src/pages/admin/index.astro` with:

```astro
---
// src/pages/admin/index.astro — Stage 7a (Slice C)
import Base from "../../layouts/Base.astro";
import AdminGate from "../../components/AdminGate";
import AdminInbox from "../../components/AdminInbox";
import { t } from "../../i18n/t";

const lang = "es" as const;
const notAdminLabel = t(lang, "admin.login.error_not_admin");
const inboxLabels = {
  title: t(lang, "admin.inbox.title"),
  empty: t(lang, "admin.inbox.empty"),
  loading: t(lang, "admin.inbox.loading"),
  error: t(lang, "admin.inbox.error"),
  col_date: t(lang, "admin.inbox.col_date"),
  col_author: t(lang, "admin.inbox.col_author"),
  col_country: t(lang, "admin.inbox.col_country"),
  col_email: t(lang, "admin.inbox.col_email"),
  view: t(lang, "admin.inbox.view"),
};
---

<Base lang={lang} title={inboxLabels.title}>
  <main class="min-h-screen bg-parchment p-6">
    <AdminGate client:load loginUrl="/admin/login" notAdminLabel={notAdminLabel}>
      <AdminInbox client:load labels={inboxLabels} />
    </AdminGate>
  </main>
</Base>
```

- [ ] **Step 2: Verify Astro builds**

```sh
npx astro check
```

Expected: zero errors.

---

## Task C5 — Create the suggestion detail placeholder

**Files:**

- Create: `src/pages/admin/suggestions/[id].astro`

- [ ] **Step 1: Write the page**

```astro
---
// src/pages/admin/suggestions/[id].astro — Stage 7a (placeholder for 7b)
import Base from "../../../layouts/Base.astro";
import AdminGate from "../../../components/AdminGate";
import { t } from "../../../i18n/t";

const lang = "es" as const;
const { id } = Astro.params;
const notAdminLabel = t(lang, "admin.login.error_not_admin");
const detailTitle = t(lang, "admin.detail.placeholder_title");
const detailBody = t(lang, "admin.detail.placeholder_body");

export async function getStaticPaths() {
  // No pre-rendered IDs — Astro will SSR this at request time in dev and
  // build a dynamic fallback for prod. With static output we rely on the
  // page being client-routed from the inbox; if visited cold, the [id] is
  // still in the URL and the placeholder renders.
  return [];
}

export const prerender = false;
---

<Base lang={lang} title={detailTitle}>
  <main class="min-h-screen bg-parchment p-6">
    <AdminGate client:load loginUrl="/admin/login" notAdminLabel={notAdminLabel}>
      <section class="mx-auto max-w-2xl">
        <h1 class="font-serif text-2xl text-ink">{detailTitle}</h1>
        <p class="mt-2 text-ink/70">{detailBody}</p>
        <p class="mt-4 text-xs text-ink/50">ID: {id}</p>
        <a href="/admin" class="mt-6 inline-block text-oxblood underline">
          ← {t(lang, "admin.inbox.title")}
        </a>
      </section>
    </AdminGate>
  </main>
</Base>
```

**Note on `prerender = false`:** the project's `astro.config.mjs` has `output: 'static'`. To allow `/admin/suggestions/[id]` to handle arbitrary IDs without listing them at build time, this single page opts out of static prerendering. Stage 9 (Cloudflare Pages) will need the `@astrojs/cloudflare` adapter when we deploy — flag this in the Slice C commit message so it surfaces in review.

- [ ] **Step 2: Verify the page**

```sh
npx astro check
```

Expected: may complain that `output: 'static'` doesn't support `prerender = false` without an adapter. If so, **STOP** and flag to Alejandro — we have two options:

- **(a)** Keep the route static. Drop `export const prerender = false` and `getStaticPaths` returns a stub like `return [{ params: { id: 'placeholder' } }]`. The detail page becomes a build-time route that can only be hit via client navigation. Acceptable for 7a since the page is a placeholder.
- **(b)** Install `@astrojs/cloudflare` adapter now — pulls Stage 9 work into 7a.

**Recommended:** if `astro check` errors, switch to option (a) by replacing the page content with:

```astro
---
import Base from "../../../layouts/Base.astro";
import AdminGate from "../../../components/AdminGate";
import { t } from "../../../i18n/t";

const lang = "es" as const;
const { id } = Astro.params;
const notAdminLabel = t(lang, "admin.login.error_not_admin");
const detailTitle = t(lang, "admin.detail.placeholder_title");
const detailBody = t(lang, "admin.detail.placeholder_body");

export async function getStaticPaths() {
  return [{ params: { id: "placeholder" } }];
}
---

<Base lang={lang} title={detailTitle}>
  <main class="min-h-screen bg-parchment p-6">
    <AdminGate client:load loginUrl="/admin/login" notAdminLabel={notAdminLabel}>
      <section class="mx-auto max-w-2xl">
        <h1 class="font-serif text-2xl text-ink">{detailTitle}</h1>
        <p class="mt-2 text-ink/70">{detailBody}</p>
        <p class="mt-4 text-xs text-ink/50">ID: {id}</p>
        <a href="/admin" class="mt-6 inline-block text-oxblood underline"
          >← {t(lang, "admin.inbox.title")}</a
        >
      </section>
    </AdminGate>
  </main>
</Base>
```

Then `npx astro check` again. Expected: zero errors.

---

## Task C6 — Update `supabase/README.md` and `docs/STATUS.md`

**Files:**

- Modify: `supabase/README.md`
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Add the notification flow to `supabase/README.md`**

Read the existing README, then add a new section "## Suggestion notifications (Stage 7a)" near the "Run the Edge Function" section, explaining:

- Trigger `notify_owner_after_insert` on `public.suggestions` calls `notify_owner` via `pg_net`.
- In dev with `RESEND_API_KEY` empty, the function logs to console.
- `npm run dev:functions` now serves both functions.
- Production needs `alter database postgres set "app.functions_url" = '...'` (deferred to Stage 9).

- [ ] **Step 2: Update `docs/STATUS.md`**

Move Stage 7a from "Next" to "in progress on `feature/07a-notify-and-auth`" and add a note about what's deferred to 7b. (Final wording up to Alejandro — this is just an end-of-stage hygiene update.)

---

## Task C7 — End-to-end manual verification of Slice C

- [ ] **Step 1: Full restart**

```sh
npm run dev:db:reset    # if migrations need reapplying
npm run dev:functions   # serves both functions
npm run dev             # Astro
```

- [ ] **Step 2: Verify empty state**

Open `http://localhost:4321/admin` (signed in as admin).
Expected: "No hay sugerencias pendientes." (the seed includes authors but no pending suggestions).

- [ ] **Step 3: Submit a suggestion and refresh the inbox**

In an incognito window: `http://localhost:4321/suggest` → fill in → submit. Then refresh `/admin` in your authed window.
Expected:

- The Edge Function console logs the notification (Slice A still works).
- The inbox shows one row: today's date, the author name, country code, submitter email, "Revisar →" link.

- [ ] **Step 4: Verify the detail placeholder**

Click "Revisar →" on the row.
Expected: lands on `/admin/suggestions/<uuid>` showing the placeholder title + body + ID + back-link.

- [ ] **Step 5: Verify type-check + production build**

```sh
npx astro check
npm run build
```

Expected: zero errors from `astro check`; `npm run build` produces a clean `dist/`.

- [ ] **Step 6: Suggested final commit (Alejandro runs)**

```sh
git add src/i18n/es.json src/i18n/en.json \
        src/lib/suggestions.ts \
        src/components/AdminInbox.tsx \
        src/pages/admin/index.astro \
        src/pages/admin/suggestions/[id].astro \
        supabase/README.md docs/STATUS.md
git commit -m "feat(stage-7a): admin inbox + suggestion detail placeholder"
```

**End of Stage 7a — pause for full review. After merge to `development`, Stage 7b (review/promote + author CRUD) opens.**

---

# Self-review notes (from plan author)

- **Spec coverage:**
  - § Scope / Out of scope → reflected in this plan's three slices and explicit deferrals.
  - § Decisions table → all 6 decisions encoded (static + client-side check; ES-only via `t()`; env-var-toggled Resend; pg_net trigger; magic-link; RLS as real gate).
  - § File layout → all listed files have a corresponding Create or Modify task.
  - § Data flow — notification → Tasks A2 + A3 + A5.
  - § Data flow — auth + inbox → Tasks B2–B8, C2–C7.
  - § Component contracts → matched by `<AdminGate>`, `<AdminLoginForm>`, `<AdminInbox>`, `notify_owner`.
  - § Migration pseudocode → Task A2 turns it into real SQL.
  - § Incremental delivery → three Slices, three commits, pauses between.
  - § Verification → distributed across A5, B8, C7.
  - § Open items deferred to 7b / Stage 9 → preserved in the plan's commit messages and the STATUS.md update.

- **Placeholder scan:** none. Every code step has the actual code.

- **Type consistency:** `PendingSuggestion` shape matches the columns selected in `listPendingSuggestions`. `AdminSessionState` discriminator used identically across `admin-session.ts` and `<AdminGate>`. `Labels` interfaces match the `t()` lookups in their host `.astro` pages.

- **Known risk to flag at execution time:** Task C5's `prerender = false` may not be compatible with `output: 'static'`. The task includes a fallback (option (a)) that uses `getStaticPaths` with a stub. The implementor should run `astro check` after the first version and switch if needed — flagged inline.
