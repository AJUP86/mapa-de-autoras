// Single source of truth for the site's supported locales.
// Add a new language = one entry here + provide its i18n JSON catalog.

export const LOCALES = ["es", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";
