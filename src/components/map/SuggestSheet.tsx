// SuggestSheet.tsx — Stage 11. The suggest form over /map: a modal dialog
// around the existing SuggestionForm (same Turnstile check, validation and
// Edge Function). Phones: a bottom sheet; desktop: a centered card. MapApp
// makes the rest of the map UI inert while it is open and returns focus to the
// opener on close; Esc and a click on the scrim close it.
//
// Mounted per open, so every open starts with a fresh form (a closed sheet
// drops its draft). Cloudflare's Turnstile script is added on the first open;
// SuggestionForm waits for it and renders / removes its own widget. A
// successful submit swaps the form for an inline thank-you instead of
// navigating to /thanks.

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import type { Locale } from "~/i18n/locales";
import type { CountryOption } from "~/lib/countries";
import SuggestionForm, { type SuggestionFormLabels } from "../SuggestionForm";
import { IconClose } from "./icons";
import { focusElement } from "./input-modality";
import type { MapPageLabels } from "./labels";

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const TURNSTILE_SCRIPT_ID = "cf-turnstile-api";

/** Adds the Turnstile script to the page, once (the id guards against a second copy). */
function loadTurnstile() {
  if (document.getElementById(TURNSTILE_SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = TURNSTILE_SCRIPT_ID;
  script.src = TURNSTILE_SRC;
  script.async = true;
  script.defer = true;
  document.head.append(script);
}

interface Props {
  open: boolean;
  /** ISO code preselected in the first book's country (the panel's country), if any. */
  initialCountry?: string;
  onClose: () => void;
  lang: Locale;
  labels: MapPageLabels["suggest"];
  closeLabel: string;
  formLabels: SuggestionFormLabels;
  /** Localized countries for the form's select. */
  countries: CountryOption[];
  turnstileSiteKey: string;
  submitUrl: string;
  /** MapApp's useLastPointer(): a tap-opened sheet does not focus a field (no on-screen keyboard). */
  lastPointer: RefObject<string | null>;
}

export default function SuggestSheet({ open, ...props }: Props) {
  return open ? <Sheet {...props} /> : null;
}

function Sheet({
  initialCountry,
  onClose,
  lang,
  labels,
  closeLabel,
  formLabels,
  countries,
  turnstileSiteKey,
  submitUrl,
  lastPointer,
}: Omit<Props, "open">) {
  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const thanksRef = useRef<HTMLHeadingElement>(null);
  // A click closes the sheet only when it also started on the scrim (not a
  // text selection dragged out of the card).
  const downOnScrim = useRef(false);
  const [done, setDone] = useState(false);

  // On open: keyboard / mouse → the first text field; touch / pen → the dialog
  // itself, so the on-screen keyboard does not pop up.
  useEffect(() => {
    loadTurnstile();
    const dialog = dialogRef.current;
    if (!dialog) return;
    const pointer = lastPointer.current;
    const field = dialog.querySelector<HTMLElement>('input[type="text"]');
    if (field && pointer !== "touch" && pointer !== "pen") field.focus();
    else focusElement(dialog, true);
  }, [lastPointer]);

  // The thank-you replaces the form (and the focused submit button): announce it.
  useEffect(() => {
    if (done) thanksRef.current?.focus();
  }, [done]);

  return (
    <div
      className="map-ui fixed inset-0 z-50 flex items-end justify-center bg-ink/40 md:items-center md:p-4"
      onPointerDown={(e) => {
        downOnScrim.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downOnScrim.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="max-h-[94%] w-full max-w-[540px] overflow-y-auto overscroll-contain rounded-t-[22px] bg-parchment px-5 pt-5 pb-[calc(env(safe-area-inset-bottom,0px)_+_24px)] text-ink shadow-sheet outline-none md:max-h-[90%] md:rounded-[22px] md:p-7"
      >
        {done ? (
          <div className="grid justify-items-start gap-3 py-3">
            <h2
              ref={thanksRef}
              id={headingId}
              tabIndex={-1}
              className="font-display text-[1.7rem] leading-tight font-semibold outline-none"
            >
              {labels.thanks.title}
            </h2>
            <p className="text-ink/75">{labels.thanks.body}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 min-h-[46px] rounded-full bg-ink px-5 text-[0.95rem] font-semibold text-bone hover:bg-ink/90"
            >
              {labels.thanks.cta}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <h2
                id={headingId}
                className="pt-1 font-display text-[1.7rem] leading-tight font-semibold"
              >
                {labels.title}
              </h2>
              <button
                type="button"
                aria-label={closeLabel}
                onClick={onClose}
                className="-mr-2 grid size-11 flex-none place-items-center rounded-full hover:bg-bone"
              >
                <IconClose />
              </button>
            </div>
            <p className="mt-2 text-ink/75">{labels.intro}</p>
            <div className="mt-6">
              <SuggestionForm
                labels={formLabels}
                countries={countries}
                locale={lang}
                turnstileSiteKey={turnstileSiteKey}
                submitUrl={submitUrl}
                initialCountry={initialCountry}
                onSuccess={() => setDone(true)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
