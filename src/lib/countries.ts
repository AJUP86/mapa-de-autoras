// Localized country list for the suggestion form's country picker.
//
// Fetched at Astro build time from the seeded `countries` table — the same
// 249 ISO 3166-1 rows. Sorted alphabetically by the locale's display name
// so the dropdown is intuitive in whichever language the user is in.

import { supabase } from "./supabase";

export interface CountryOption {
  iso_a3: string;
  name: string;
}

export async function getCountries(
  lang: "es" | "en",
): Promise<CountryOption[]> {
  const nameCol = lang === "es" ? "name_es" : "name_en";

  const { data, error } = await supabase
    .from("countries")
    .select(`iso_a3, ${nameCol}`)
    .order(nameCol, { ascending: true });

  if (error) {
    console.warn("[countries] getCountries() failed:", error.message);
    return [];
  }

  return ((data ?? []) as unknown as Array<Record<string, string>>).map(
    (row) => ({
      iso_a3: row.iso_a3,
      name: row[nameCol],
    }),
  );
}
