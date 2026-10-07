// labels.ts — Stage 11. Every string the /map island needs, resolved at
// build time in MapPage.astro and passed as one prop.

import { t } from "~/i18n/t";
import type { Locale } from "~/i18n/locales";
import type { BookStatus, Filter } from "~/lib/map-state";
import type { RegionKey } from "~/lib/map-region";

export interface MapPageLabels {
  /** Document title per view ("Mapa · mapa de autoras", "Todos los libros · mapa de autoras"). */
  pageTitle: { map: string; list: string };
  ariaMap: string;
  home: string;
  language: { label: string; aria: string };
  filterGroup: string;
  filter: Record<Filter, string>;
  search: { label: string; placeholder: string; listPlaceholder: string; clear: string };
  results: {
    regions: string;
    countries: string;
    authors: string;
    books: string;
    noAuthors: string;
    /** {q} */
    none: string;
    suggest: string;
  };
  viewSwitch: { aria: string; map: string; list: string };
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
  count: {
    authorOne: string;
    authorOther: string;
    bookOne: string;
    bookOther: string;
    countryOne: string;
    countryOther: string;
  };
  /** {year} */
  yearsBorn: string;
  regions: Record<RegionKey, string>;
  /** {region} */
  regionHint: string;
  loading: string;
  error: string;
  retry: string;
  list: {
    /** Visually hidden h1 of the list view. */
    heading: string;
    /** {books} {authors} {countries}, each already a count phrase */
    summary: string;
    showOnMap: string;
    /** {q} */
    emptyQuery: string;
    emptyFilter: string;
    suggest: string;
  };
}

export function mapPageLabels(lang: Locale): MapPageLabels {
  const l = (key: string) => t(lang, `map.${key}`);
  const site = t(lang, "meta.title");
  return {
    pageTitle: {
      map: `${l("page_title")} · ${site}`,
      list: `${t(lang, "books.title")} · ${site}`,
    },
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
    search: {
      label: l("search_label"),
      placeholder: l("search_placeholder"),
      listPlaceholder: l("list_search_placeholder"),
      clear: l("search_clear"),
    },
    results: {
      regions: l("results.regions"),
      countries: l("results.countries"),
      authors: l("results.authors"),
      books: l("results.books"),
      noAuthors: l("results.no_authors"),
      none: l("results.none"),
      suggest: l("results.suggest"),
    },
    viewSwitch: { aria: l("view_switch_aria"), map: l("view_map"), list: l("view_list") },
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
      countryOne: l("count.country_one"),
      countryOther: l("count.country_other"),
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
    list: {
      heading: t(lang, "books.title"),
      summary: l("list.summary"),
      showOnMap: l("list.show_on_map"),
      emptyQuery: l("list.empty_query"),
      emptyFilter: l("list.empty_filter"),
      suggest: l("list.suggest"),
    },
  };
}
