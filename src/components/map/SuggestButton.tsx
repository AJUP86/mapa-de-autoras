// SuggestButton.tsx — Stage 11. The floating "Sugerir" button at the bottom
// right of /map (map and list view): opens the suggest sheet. Phones: a 52 px
// icon-only circle, hidden while the country sheet is open (like the switch
// and the controls). Desktop: a pill with the visible word; with the side panel
// open it moves left of it (`md:right-[432px]` = PANEL_INSET in layout.ts) and,
// below `lg`, drops the word so it never runs into the centered Map | List switch.

import { IconPlus } from "./icons";

interface Props {
  label: string;
  /** Contains the visible word (label-in-name). */
  ariaLabel: string;
  panelOpen: boolean;
  onClick: () => void;
}

export default function SuggestButton({ label, ariaLabel, panelOpen, onClick }: Props) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={`absolute right-4 bottom-[calc(env(safe-area-inset-bottom,0px)_+_18px)] z-20 inline-flex size-[52px] items-center justify-center gap-2 rounded-full bg-oxblood font-semibold text-bone shadow-float hover:bg-oxblood-2 md:h-[50px] md:w-auto md:pr-5 md:pl-4 ${
        panelOpen ? "max-md:hidden md:right-[432px] md:max-lg:w-[50px] md:max-lg:px-0" : ""
      }`}
    >
      <IconPlus size={20} />
      <span className={`hidden md:inline ${panelOpen ? "md:max-lg:hidden" : ""}`}>{label}</span>
    </button>
  );
}
