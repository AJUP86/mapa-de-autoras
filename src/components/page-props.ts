// page-props.ts — Stage 11. Build-time props for the /map and /book islands,
// shared by the open pages (MapPage.astro, BookDetailPage.astro) and, while
// the map is closed, by the admin layers on the "Abre pronto" page (spec §5.5).

import { t } from "~/i18n/t";
import type { Locale } from "~/i18n/locales";
import { getBuildCountries } from "~/lib/build-countries";
import type { AdminLayerLabels } from "./AdminOnly";
import type { BookDetailProps } from "./BookDetail";
import { bookDetailLabels } from "./book-labels";
import type { MapAppProps } from "./map/MapApp";
import { mapPageLabels } from "./map/labels";
import { suggestFormLabels } from "./suggest-labels";

/** The book page's `<main>` container (open page and admin layer). */
export const BOOK_MAIN_CLASS = "mx-auto max-w-3xl px-6 py-12 sm:py-16";

export async function mapAppProps(lang: Locale): Promise<MapAppProps> {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL ?? "";
  return {
    lang,
    labels: mapPageLabels(lang),
    // Localized country names for the panel and the search, resolved at build time.
    countries: await getBuildCountries(lang),
    // The panel's book view and the suggest sheet (same strings and endpoint as /book and /suggest).
    bookLabels: bookDetailLabels(lang),
    suggestLabels: suggestFormLabels(lang),
    turnstileSiteKey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? "",
    submitUrl: `${supabaseUrl}/functions/v1/submit_suggestion`,
  };
}

/** The admin layer's "could not load" message (AdminLoadBoundary). */
export function adminLayerLabels(lang: Locale): AdminLayerLabels {
  return { loadError: t(lang, "admin_layer.load_error"), reload: t(lang, "admin_layer.reload") };
}

export function bookDetailProps(lang: Locale): BookDetailProps {
  return {
    lang,
    labels: bookDetailLabels(lang),
    listHref: `/${lang}/map?view=list`,
    siteTitle: t(lang, "meta.title"),
  };
}
