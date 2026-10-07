// FilterChips.tsx — Stage 11. Status filter for /map: one horizontally
// scrollable row of toggle chips (Todas · Por leer · Leyendo · Leídas).

import type { Filter } from "~/lib/map-state";
import { STATUS_FILL } from "../status-colors";

const FILTERS: Filter[] = ["all", "to_read", "reading", "read"];

interface Props {
  value: Filter;
  onChange: (filter: Filter) => void;
  labels: Record<Filter, string>;
  groupLabel: string;
}

export default function FilterChips({ value, onChange, labels, groupLabel }: Props) {
  return (
    // Bleeds to the screen edges so the row scrolls edge to edge; the vertical
    // padding leaves room for the chip shadows, focus ring and 44 px hit area.
    <div
      role="group"
      aria-label={groupLabel}
      className="pointer-events-auto -mx-4 -mb-2 -mt-[5px] flex w-max max-w-[calc(100%+2rem)] gap-1.5 overflow-x-auto px-4 pb-2 pt-[5px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {FILTERS.map((f) => {
        const pressed = value === f;
        return (
          <button
            key={f}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(f)}
            // 34 px chip; the ::before extends the tap area to 44 px.
            className={`relative inline-flex h-[34px] flex-none items-center gap-[7px] whitespace-nowrap rounded-full px-3 text-[0.86rem] font-medium shadow-float transition-colors before:absolute before:inset-x-0 before:-inset-y-[5px] before:content-[''] ${
              pressed ? "bg-ink text-bone" : "bg-bone text-ink hover:bg-parchment"
            }`}
          >
            {f !== "all" && (
              <span
                aria-hidden="true"
                className={`size-[9px] flex-none rounded-full ${STATUS_FILL[f]}`}
              />
            )}
            {labels[f]}
          </button>
        );
      })}
    </div>
  );
}
