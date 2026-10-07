// input-modality.ts — Stage 11. The last input modality on /map, for focus
// moved by script: after a tap or click it gets no focus ring (and the search
// field is not focused at all after a tap, which would pop up the on-screen
// keyboard); keyboard users keep the ring.

import { useEffect, useRef, type RefObject } from "react";

/** pointerType of the last pointerdown ("mouse", "touch", "pen"), or null after a key press. */
export function useLastPointer(): RefObject<string | null> {
  const last = useRef<string | null>(null);
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      last.current = e.pointerType || "mouse";
    };
    const onKey = () => {
      last.current = null;
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);
  return last;
}

/** Focus `el` without scrolling; `quiet` hides its ring until it blurs (global.css `[data-quiet-focus]`). */
export function focusElement(el: HTMLElement, quiet: boolean) {
  if (quiet) {
    el.dataset.quietFocus = "";
    el.addEventListener("blur", () => delete el.dataset.quietFocus, { once: true });
  }
  el.focus({ preventScroll: true });
}
