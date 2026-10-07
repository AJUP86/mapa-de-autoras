// WaitlistCard.tsx — Stage 11. The home's waitlist card (before release):
// "Abre pronto" pulse, title, email field + submit in one row (stacked when
// the card is narrow), the optional news box (unticked), fine print with the
// privacy link. States: idle → submitting → done | not_available | error, plus
// the client-side "invalid" check. joinWaitlist() is a stub until Stage 12.

import { useEffect, useId, useRef, useState, type SubmitEvent } from "react";
import { fmt } from "~/i18n/format";
import type { Locale } from "~/i18n/locales";
import { isValidEmail, joinWaitlist, type WaitlistResult } from "~/lib/waitlist";
import type { WaitlistLabels } from "./waitlist-labels";

type Phase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "invalid" }
  | { kind: "not_available" }
  | { kind: "error" }
  | { kind: "done"; email: string };

interface Props {
  lang: Locale;
  labels: WaitlistLabels;
}

export default function WaitlistCard({ lang, labels }: Props) {
  const id = useId();
  const titleId = `${id}-title`;
  const emailId = `${id}-email`;
  const errorId = `${id}-error`;
  const [email, setEmail] = useState("");
  const [news, setNews] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  const submitting = phase.kind === "submitting";
  const invalid = phase.kind === "invalid";

  // The form (and the button that had focus) is replaced: move focus to the result.
  useEffect(() => {
    if (phase.kind === "done") doneRef.current?.focus();
  }, [phase.kind]);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const value = email.trim();
    if (!isValidEmail(value)) {
      setPhase({ kind: "invalid" });
      inputRef.current?.focus();
      return;
    }
    setPhase({ kind: "submitting" });
    let result: WaitlistResult;
    try {
      result = await joinWaitlist({ email: value, locale: lang, news });
    } catch {
      result = { ok: false, reason: "error" };
    }
    if (result.ok) {
      setPhase({ kind: "done", email: value });
    } else if (result.reason === "invalid") {
      setPhase({ kind: "invalid" });
      inputRef.current?.focus();
    } else {
      setPhase({ kind: result.reason });
    }
  }

  return (
    <section aria-labelledby={titleId} className="rounded-[20px] bg-bone p-6 shadow-float sm:p-7">
      <p className="flex items-center gap-2 text-[0.72rem] font-semibold tracking-[0.16em] text-oxblood uppercase">
        <span
          aria-hidden="true"
          className="size-2 flex-none rounded-full bg-oxblood motion-safe:animate-soon-pulse"
        />
        {labels.soon}
      </p>

      {phase.kind === "done" ? (
        <div className="mt-3.5">
          <h2
            id={titleId}
            ref={doneRef}
            tabIndex={-1}
            className="font-display text-[1.4rem] leading-[1.2] font-semibold text-ink focus:outline-none"
          >
            {labels.doneTitle}
          </h2>
          <p className="mt-2 text-ink/75">{fmt(labels.doneText, { email: phase.email })}</p>
        </div>
      ) : (
        <>
          <h2
            id={titleId}
            className="mt-3.5 font-display text-[1.6rem] leading-[1.15] font-semibold tracking-[-0.01em] text-ink"
          >
            {labels.title}
          </h2>
          <p className="mt-2 text-ink/75">{labels.text}</p>

          {/* No `name` attributes: a submit before hydration reloads the page
              without putting the email in the URL. */}
          <form noValidate onSubmit={onSubmit} className="@container mt-4">
            <label htmlFor={emailId} className="sr-only">
              {labels.emailLabel}
            </label>
            <div className="flex flex-col gap-2 @min-[20rem]:flex-row">
              <input
                ref={inputRef}
                id={emailId}
                type="email"
                inputMode="email"
                autoComplete="email"
                enterKeyHint="send"
                spellCheck={false}
                placeholder={labels.emailPlaceholder}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (invalid) setPhase({ kind: "idle" });
                }}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? errorId : undefined}
                className="h-12 w-full min-w-0 rounded-full @min-[20rem]:flex-1 border-[1.5px] border-ink/15 bg-parchment px-[18px] text-base text-ink placeholder:text-ink/55 focus:border-ink focus:outline-none aria-[invalid=true]:border-oxblood"
              />
              <button
                type="submit"
                aria-disabled={submitting || undefined}
                className="h-12 flex-none rounded-full bg-oxblood px-5 text-[0.95rem] font-semibold whitespace-nowrap text-bone hover:bg-oxblood-2 aria-disabled:cursor-wait aria-disabled:opacity-75"
              >
                {submitting ? labels.submitting : labels.submit}
              </button>
            </div>
            {invalid && (
              <p id={errorId} role="alert" className="mt-2 text-[0.88rem] font-medium text-oxblood">
                {labels.invalid}
              </p>
            )}
            <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 text-[0.95rem] text-ink/85">
              <input
                type="checkbox"
                checked={news}
                onChange={(e) => setNews(e.target.checked)}
                className="size-5 flex-none cursor-pointer accent-oxblood"
              />
              {labels.newsLabel}
            </label>
          </form>

          <div role="status">
            {phase.kind === "not_available" && (
              <p className="mt-2 rounded-xl bg-parchment px-4 py-3 text-[0.95rem] text-ink">
                {labels.notAvailable}
              </p>
            )}
          </div>
          {phase.kind === "error" && (
            <p role="alert" className="mt-2 text-[0.88rem] font-medium text-oxblood">
              {labels.error}
            </p>
          )}

          <p className="mt-3 text-[0.78rem] leading-[1.45] text-ink/70">
            {labels.fine}{" "}
            <a
              href={labels.privacyHref}
              className="font-medium text-ink underline underline-offset-2 hover:text-oxblood"
            >
              {labels.privacyLink}
            </a>
          </p>
        </>
      )}
    </section>
  );
}
