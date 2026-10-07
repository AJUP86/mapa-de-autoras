// MapControls.tsx — Stage 11. Bottom-right map buttons: zoom in/out (desktop
// only — phones pinch) and re-center (back to the starting view). Hidden on
// phones while the country sheet is open; moved left of the side panel on
// desktop. `md:` and 432 px mirror layout.ts (DESKTOP_MIN_WIDTH, PANEL_INSET).

import { IconLocate, IconMinus, IconPlus } from "./icons";

interface Props {
  labels: { in: string; out: string; start: string };
  panelOpen: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onStart: () => void;
}

const BUTTON = "grid size-11 place-items-center bg-bone text-ink hover:bg-parchment";

export default function MapControls({ labels, panelOpen, onZoomIn, onZoomOut, onStart }: Props) {
  return (
    <div
      className={`absolute right-4 bottom-[calc(env(safe-area-inset-bottom,0px)_+_92px)] z-10 grid gap-2 ${
        panelOpen ? "max-md:hidden md:right-[432px]" : ""
      }`}
    >
      {/* No overflow clipping on the group: it would cut the buttons' focus rings. */}
      <div className="hidden rounded-full shadow-float md:grid">
        <button
          type="button"
          aria-label={labels.in}
          onClick={onZoomIn}
          className={`${BUTTON} rounded-t-full`}
        >
          <IconPlus />
        </button>
        <button
          type="button"
          aria-label={labels.out}
          onClick={onZoomOut}
          className={`${BUTTON} rounded-b-full border-t border-ink/10`}
        >
          <IconMinus />
        </button>
      </div>
      <button
        type="button"
        aria-label={labels.start}
        onClick={onStart}
        className={`${BUTTON} rounded-full shadow-float`}
      >
        <IconLocate />
      </button>
    </div>
  );
}
