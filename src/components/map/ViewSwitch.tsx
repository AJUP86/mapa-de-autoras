// ViewSwitch.tsx — Stage 11. Map | List toggle at the bottom center of /map
// (both views). Hidden on phones while the country sheet is open, like the
// map controls. On desktop with the side panel open it centers in the part of
// the screen the panel leaves free: `md:pr-[448px]` = PANEL_INSET (layout.ts)
// + the 16 px side padding.

import type { MapView } from "~/lib/map-view";
import { IconMap } from "../icons";
import { IconList } from "./icons";

const VIEWS: MapView[] = ["map", "list"];

interface Props {
  view: MapView;
  labels: { aria: string; map: string; list: string };
  panelOpen: boolean;
  onChange: (view: MapView) => void;
}

export default function ViewSwitch({ view, labels, panelOpen, onChange }: Props) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)_+_18px)] ${
        panelOpen ? "max-md:hidden md:pr-[448px]" : ""
      }`}
    >
      <div
        role="group"
        aria-label={labels.aria}
        className="pointer-events-auto inline-flex rounded-full bg-ink p-1 shadow-float"
      >
        {VIEWS.map((v) => {
          const pressed = view === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange(v)}
              className={`inline-flex h-11 items-center gap-2 rounded-full px-[18px] text-[0.92rem] font-semibold transition-colors ${
                pressed ? "bg-bone text-ink" : "text-bone/80 hover:text-bone"
              }`}
            >
              {v === "map" ? <IconMap /> : <IconList />}
              {labels[v]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
