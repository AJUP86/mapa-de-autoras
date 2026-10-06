// labels.ts — Stage 11. Every string the /map island needs, resolved at
// build time in MapPage.astro and passed as one prop.

import { t } from "~/i18n/t";
import type { Locale } from "~/i18n/locales";

export interface MapPageLabels {
  ariaMap: string;
}

export function mapPageLabels(lang: Locale): MapPageLabels {
  return {
    ariaMap: t(lang, "map.aria_map"),
  };
}
