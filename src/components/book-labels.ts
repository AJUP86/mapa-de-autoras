// book-labels.ts — Stage 11. Every string a book view needs (the full page
// /[lang]/book and the compact view in the /map panel), resolved at build time.

import { t } from "~/i18n/t";
import type { Locale } from "~/i18n/locales";

export interface BookDetailLabels {
  loading: string;
  error: string;
  not_found: string;
  back_to_list: string;
  country_label: string;
  year_label: string;
  language_label: string;
  synopsis_heading: string;
  quotes_heading: string;
  buy_heading: string;
  affiliate_disclosure: string;
  /** Link from the panel's book view to the full page. */
  open_page: string;
  retailer: { amazon: string; bookshop: string; kobo: string; other: string };
  status: { to_read: string; reading: string; read: string };
}

export function bookDetailLabels(lang: Locale): BookDetailLabels {
  return {
    loading: t(lang, "book.loading"),
    error: t(lang, "book.error"),
    not_found: t(lang, "book.not_found"),
    back_to_list: t(lang, "book.back_to_list"),
    country_label: t(lang, "book.country_label"),
    year_label: t(lang, "book.year_label"),
    language_label: t(lang, "book.language_label"),
    synopsis_heading: t(lang, "book.synopsis_heading"),
    quotes_heading: t(lang, "book.quotes_heading"),
    buy_heading: t(lang, "book.buy_heading"),
    affiliate_disclosure: t(lang, "book.affiliate_disclosure"),
    open_page: t(lang, "book.open_page"),
    retailer: {
      amazon: t(lang, "book.retailer.amazon"),
      bookshop: t(lang, "book.retailer.bookshop"),
      kobo: t(lang, "book.retailer.kobo"),
      other: t(lang, "book.retailer.other"),
    },
    status: {
      to_read: t(lang, "map.status.to_read"),
      reading: t(lang, "map.status.reading"),
      read: t(lang, "map.status.read"),
    },
  };
}
