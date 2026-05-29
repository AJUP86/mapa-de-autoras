import type { MapView } from "./AuthorsMap";

export type ContinentKey =
  | "world"
  | "europe"
  | "americas"
  | "africa"
  | "asia"
  | "oceania";

export const CONTINENT_VIEWS: Record<ContinentKey, MapView> = {
  world: { center: [0, 20], zoom: 1 },
  europe: { center: [15, 50], zoom: 3.5 },
  americas: { center: [-75, 10], zoom: 1.8 },
  africa: { center: [20, 0], zoom: 2.2 },
  asia: { center: [95, 30], zoom: 2 },
  oceania: { center: [140, -25], zoom: 2.5 },
};

const ORDER: ContinentKey[] = [
  "world",
  "europe",
  "americas",
  "africa",
  "asia",
  "oceania",
];

interface Props {
  view: MapView;
  onSetView: (next: MapView) => void;
  labels: {
    view: Record<ContinentKey, string>;
    zoom: { in: string; out: string; reset: string };
  };
}

export default function ContinentNav({ view, onSetView, labels }: Props) {
  const zoomBy = (factor: number) => {
    const next = Math.max(1, Math.min(8, view.zoom * factor));
    onSetView({ center: view.center, zoom: next });
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
      <div className="flex flex-wrap items-center justify-center gap-1 overflow-x-auto">
        {ORDER.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onSetView(CONTINENT_VIEWS[key])}
            className="rounded-full px-3 py-1 text-xs font-body uppercase tracking-wider text-ink/70 hover:text-oxblood hover:bg-bone transition-colors whitespace-nowrap"
          >
            {labels.view[key]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 border-l border-ink/10 pl-3 sm:pl-4">
        <ZoomButton
          ariaLabel={labels.zoom.out}
          onClick={() => zoomBy(1 / 1.5)}
          disabled={view.zoom <= 1.01}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </ZoomButton>
        <ZoomButton
          ariaLabel={labels.zoom.reset}
          onClick={() => onSetView(CONTINENT_VIEWS.world)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" />
          </svg>
        </ZoomButton>
        <ZoomButton
          ariaLabel={labels.zoom.in}
          onClick={() => zoomBy(1.5)}
          disabled={view.zoom >= 7.99}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </ZoomButton>
      </div>
    </div>
  );
}

function ZoomButton({
  ariaLabel,
  onClick,
  disabled,
  children,
}: {
  ariaLabel: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className="rounded-full w-8 h-8 flex items-center justify-center border border-ink/15 bg-bone text-ink/70 hover:border-oxblood/40 hover:text-oxblood disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}
