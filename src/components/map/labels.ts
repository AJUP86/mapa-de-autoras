// labels.ts — Stage 11. Every string the /map island needs, resolved at
// build time in MapPage.astro and passed as one prop.

import { t } from "~/i18n/t";
import type { Locale } from "~/i18n/locales";
import type { BookStatus, Filter } from "~/lib/map-state";
import type { RegionKey } from "~/lib/map-region";

export interface MapPageLabels {
  ariaMap: string;
  home: string;
  language: { label: string; aria: string };
  filterGroup: string;
  filter: Record<Filter, string>;
  status: Record<BookStatus, string>;
  zoom: { in: string; out: string; start: string };
  panel: {
    eyebrow: string;
    close: string;
    expand: string;
    collapse: string;
    /** {country} */
    emptyCountry: string;
    /** {country} */
    suggestCountry: string;
    /** {country} */
    missing: string;
    suggest: string;
  };
  /** {n} */
  count: { authorOne: string; authorOther: string; bookOne: string; bookOther: string };
  /** {year} */
  yearsBorn: string;
  regions: Record<RegionKey, string>;
  /** {region} */
  regionHint: string;
  loading: string;
  error: string;
  retry: string;
}

export function mapPageLabels(lang: Locale): MapPageLabels {
  const l = (key: string) => t(lang, `map.${key}`);
  return {
    ariaMap: l("aria_map"),
    home: l("home_aria"),
    language: { label: l("language_label"), aria: l("language_aria") },
    filterGroup: l("filter_group_aria"),
    filter: {
      all: l("filter.all"),
      to_read: l("filter.to_read"),
      reading: l("filter.reading"),
      read: l("filter.read"),
    },
    status: {
      to_read: l("status.to_read"),
      reading: l("status.reading"),
      read: l("status.read"),
    },
    zoom: { in: l("zoom.in"), out: l("zoom.out"), start: l("zoom.start") },
    panel: {
      eyebrow: l("panel.eyebrow"),
      close: l("panel.close"),
      expand: l("panel.expand"),
      collapse: l("panel.collapse"),
      emptyCountry: l("panel.empty_country"),
      suggestCountry: l("panel.suggest_country"),
      missing: l("panel.missing"),
      suggest: l("panel.suggest"),
    },
    count: {
      authorOne: l("count.author_one"),
      authorOther: l("count.author_other"),
      bookOne: l("count.book_one"),
      bookOther: l("count.book_other"),
    },
    yearsBorn: l("years_born"),
    regions: {
      europe: l("view.europe"),
      americas: l("view.americas"),
      africa: l("view.africa"),
      asia: l("view.asia"),
      oceania: l("view.oceania"),
    },
    regionHint: l("region_hint"),
    loading: l("loading"),
    error: l("error"),
    retry: l("retry"),
  };
}
