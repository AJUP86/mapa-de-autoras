// build-countries.ts — the country list for pages rendered at build time
// (/map, and the suggest form). getCountries() returns [] when Supabase cannot
// be reached; on a hosted (Cloudflare Pages) build that would ship a site with
// no countries to search or pick, so there it fails the build. CI (placeholder
// Supabase) and local builds keep the tolerant behavior.

import { getCountries, type CountryOption } from "./countries";

/** `countries`, or a build error when a hosted build got none. */
export function requireCountries(countries: CountryOption[], hosted: boolean): CountryOption[] {
  if (hosted && countries.length === 0) {
    throw new Error(
      "[build] getCountries() returned no countries — Supabase unreachable during the Pages build; retry the deployment.",
    );
  }
  return countries;
}

export async function getBuildCountries(lang: "es" | "en"): Promise<CountryOption[]> {
  return requireCountries(await getCountries(lang), process.env.CF_PAGES === "1");
}
