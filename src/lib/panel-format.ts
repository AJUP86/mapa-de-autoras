// panel-format.ts — Stage 11
//
// Small display helpers for the /map country panel: the letter on a book's
// color-block "cover" and an author's years line.

import { fmt } from "../i18n/format";

// A leading Spanish/English article (El, La, Los, Las, L', The, A). Words need
// a space after them so "Lagos" or "Americanah" keep their first letter.
const LEADING_ARTICLE = /^(?:(?:el|la|los|las|the|a)\s+|l['’]\s*)/i;

/** First letter of a title for its cover block, skipping a leading article and punctuation. */
export function coverLetter(title: string): string {
  const trimmed = title.trim();
  const rest = trimmed.replace(LEADING_ARTICLE, "") || trimmed;
  const letter = rest.match(/[\p{L}\p{N}]/u)?.[0] ?? rest.charAt(0);
  return letter.toLocaleUpperCase();
}

/**
 * "1960 – 2021", or the born template ("n. {year}") when only the birth year is
 * known, "? – 2021" when only the death year is known, "" when neither is.
 */
export function authorYears(
  birth: number | undefined,
  death: number | undefined,
  bornTemplate: string,
): string {
  if (birth != null && death != null) return `${birth} – ${death}`;
  if (birth != null) return fmt(bornTemplate, { year: birth });
  if (death != null) return `? – ${death}`;
  return "";
}
