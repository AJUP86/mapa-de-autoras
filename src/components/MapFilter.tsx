import type { Filter, MapLabels } from "~/lib/map-state";

interface Props {
  value: Filter;
  onChange: (next: Filter) => void;
  labels: MapLabels["filter"];
}

// Visitor → present → past of Danny's reading journey.
const OPTIONS: Filter[] = ["all", "discoveries", "currently_reading", "read"];

export default function MapFilter({ value, onChange, labels }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Map filter"
      className="inline-flex items-center rounded-full border border-ink/15 bg-bone p-1 text-sm font-body shadow-[0_1px_0_var(--c-shadow)]"
    >
      {OPTIONS.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option)}
            className={
              "rounded-full px-4 py-1.5 transition-colors " +
              (active ? "bg-oxblood text-parchment shadow-sm" : "text-ink/70 hover:text-ink")
            }
          >
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}
