// CountrySheet.tsx — Stage 11. Shell of the /map country panel: a bottom
// sheet on phones (about 56% high; the handle expands it to full height) and a
// 400 px side panel on desktop. Non-modal dialog: the map stays usable.
// Sizes and the `md:` breakpoint mirror layout.ts (SHEET_HEIGHT_RATIO,
// SHEET_MAX_HEIGHT, PANEL_WIDTH, PANEL_GAP, DESKTOP_MIN_WIDTH): MapApp's map
// insets use those, so change both together.

import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  open: boolean;
  /** Accessible name of the dialog (the country name). */
  label: string;
  /** Content identity (the selected country): a change collapses the sheet and scrolls to the top. */
  resetKey: string | null;
  expandLabel: string;
  collapseLabel: string;
  children: ReactNode;
}

export default function CountrySheet({
  open,
  label,
  resetKey,
  expandLabel,
  collapseLabel,
  children,
}: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const pointerInput = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [shownKey, setShownKey] = useState(resetKey);

  // New country (or closed): start collapsed — adjusted during render so the
  // old expanded height never flashes.
  if (shownKey !== resetKey) {
    setShownKey(resetKey);
    setExpanded(false);
  }

  // Last input modality: a tap on the map should not leave a focus ring on ✕.
  useEffect(() => {
    const onPointer = () => (pointerInput.current = true);
    const onKey = () => (pointerInput.current = false);
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);

  // On open and on every new country: back to the top, focus the close button
  // (ring hidden until it blurs when the panel was opened by pointer/touch).
  useEffect(() => {
    if (!open) return;
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    const target = rootRef.current?.querySelector<HTMLElement>("[data-autofocus]");
    if (!target) return;
    if (pointerInput.current) {
      target.dataset.quietFocus = "";
      target.addEventListener("blur", () => delete target.dataset.quietFocus, { once: true });
    }
    target.focus({ preventScroll: true });
  }, [open, resetKey]);

  if (!open) return null;

  return (
    <section
      ref={rootRef}
      role="dialog"
      aria-modal="false"
      aria-label={label}
      className={`absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[22px] bg-bone pb-[env(safe-area-inset-bottom,0px)] shadow-sheet transition-[height] duration-[250ms] ease-out motion-reduce:transition-none md:inset-x-auto md:top-4 md:right-4 md:bottom-4 md:h-auto md:w-[400px] md:rounded-[20px] md:pb-0 md:shadow-float ${
        expanded ? "h-[calc(100%_-_env(safe-area-inset-top,0px)_-_20px)]" : "h-[min(56%,540px)]"
      }`}
    >
      {/* Phones only. 44 px tall for the finger; it overlaps the header's top padding. */}
      <button
        type="button"
        aria-label={expanded ? collapseLabel : expandLabel}
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
        className="relative z-[2] -mb-[22px] mx-auto block h-11 w-28 flex-none rounded-full pt-2 md:hidden"
      >
        <span
          aria-hidden="true"
          className="mx-auto block h-[5px] w-[42px] rounded-full bg-ink/15"
        />
      </button>
      {/* Rounded on desktop so the sticky header keeps the panel's corners (no clipping on the
          section itself: it would cut the handle's focus ring). */}
      <div
        ref={bodyRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain md:rounded-[20px]"
      >
        {children}
      </div>
    </section>
  );
}
