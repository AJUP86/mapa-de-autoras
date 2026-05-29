import es from "./es.json";
import en from "./en.json";

const catalogs = { es, en } as const;

export type Lang = keyof typeof catalogs;
export const LANGS: Lang[] = ["es", "en"];
export const DEFAULT_LANG: Lang = "es";

export function t(lang: Lang, key: string): string {
  const parts = key.split(".");
  let node: unknown = catalogs[lang];
  for (const part of parts) {
    if (node && typeof node === "object" && part in (node as object)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof node === "string" ? node : key;
}
