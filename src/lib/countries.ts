// countries.ts — Stage 7b-i (extended from Stage 6)
//
// Loads the ISO-3166-1 country list from public.countries (seeded in Stage 3).
// RLS allows anon read.
//
// Two consumer shapes:
//   - getCountries(lang) → CountryOption[]   — single localized name; used by
//     the public suggest form (Stage 6).
//   - getCountriesBilingual() → CountryRow[] — both names; used by the admin
//     PromoteForm (Stage 7b-i E1) which renders ES labels but stores ISO.

import { supabase } from "./supabase";

export interface CountryOption {
  iso_a3: string;
  name: string;
}

export interface CountryRow {
  iso_a3: string;
  name_es: string;
  name_en: string;
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

let bilingualCache: CountryRow[] | null = null;

export async function getCountriesBilingual(): Promise<CountryRow[]> {
  if (bilingualCache) return bilingualCache;
  const { data, error } = await supabase
    .from("countries")
    .select("iso_a3, name_es, name_en")
    .order("name_es", { ascending: true });
  if (error) {
    console.error("[countries] getCountriesBilingual() failed:", error.message);
    throw error;
  }
  bilingualCache = (data ?? []) as CountryRow[];
  return bilingualCache;
}
