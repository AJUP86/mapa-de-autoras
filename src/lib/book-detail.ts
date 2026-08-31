// book-detail.ts — Stage 8.6
//
// One book's curated content: synopsis (books.description_*), quotes
// (book_quotes) and buy links (book_links).
//
// The public read uses the anon client — RLS returns the book only when its
// author is published — and deliberately does NOT select affiliate_tag.
// Writes go through the admin-only set_book_content RPC, which replaces the
// quote + link lists atomically.

import { supabase } from "./supabase";
import type { BookStatus } from "./map-state";
import type { Locale } from "~/i18n/locales";
import type { Json } from "~/types/supabase";

export interface BookQuoteRow {
  id: string;
  quote_es: string;
  quote_en: string;
  location: string | null;
  display_order: number;
}

export interface BookLinkRow {
  retailer: string;
  url: string;
  locale: string;
}

export interface LocalizedQuote {
  id: string;
  text: string;
  location: string | null;
}

export interface BookDetail {
  id: string;
  title: string;
  year: number | null;
  originalLanguage: string | null;
  coverUrl: string | null;
  synopsis: string | null;
  status: BookStatus;
  authorName: string;
  country: string;
  countryName: string;
  quotes: LocalizedQuote[];
  links: BookLinkRow[];
}

export interface BookEditContent {
  id: string;
  title: string;
  authorName: string;
  year: number | null;
  status: BookStatus;
  descriptionEs: string;
  descriptionEn: string;
  quotes: { quote_es: string; quote_en: string; location: string }[];
  links: { retailer: string; url: string; affiliate_tag: string; locale: string }[];
}

export type SaveContentError =
  | { kind: "validation"; message: string }
  | { kind: "unauthorized" }
  | { kind: "unknown"; message: string };

export type SaveContentResult = { ok: true } | { ok: false; error: SaveContentError };

/** Sort by display_order and pick the reader's language. Pure. */
export function localizeQuotes(rows: BookQuoteRow[], lang: Locale): LocalizedQuote[] {
  return [...rows]
    .sort((a, b) => a.display_order - b.display_order)
    .map((r) => ({
      id: r.id,
      text: lang === "en" ? r.quote_en : r.quote_es,
      location: r.location,
    }));
}

/** Links for the reader's locale; if none match, show them all. Pure. */
export function visibleLinks(links: BookLinkRow[], lang: Locale): BookLinkRow[] {
  const forLang = links.filter((l) => l.locale === lang);
  return forLang.length > 0 ? forLang : links;
}

/** Public read (anon client). RLS returns nothing for unpublished authors. */
export async function getBookDetail(id: string, lang: Locale): Promise<BookDetail | null> {
  const { data, error } = await supabase
    .from("books")
    .select(
      "id, title, year, original_language, cover_url, description_es, description_en, status, authors!inner(name, country_iso_a3, countries!inner(name_es, name_en)), book_quotes(id, quote_es, quote_en, location, display_order), book_links(retailer, url, locale)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    // 22P02 = invalid_text_representation: a non-uuid id from the URL is a
    // "not found", not a server error.
    if (error.code === "22P02") return null;
    console.error("[book-detail] get failed:", error.message);
    throw error;
  }
  if (!data) return null;
  const row = data;
  return {
    id: row.id,
    title: row.title,
    year: row.year,
    originalLanguage: row.original_language,
    coverUrl: row.cover_url,
    synopsis: lang === "en" ? row.description_en : row.description_es,
    status: row.status,
    authorName: row.authors.name,
    country: row.authors.country_iso_a3,
    countryName: lang === "en" ? row.authors.countries.name_en : row.authors.countries.name_es,
    quotes: localizeQuotes(row.book_quotes, lang),
    links: row.book_links,
  };
}

/** Admin read (authed client) — includes affiliate_tag for editing. */
export async function getBookForEdit(id: string): Promise<BookEditContent | null> {
  const { data, error } = await supabase
    .from("books")
    .select(
      "id, title, year, status, description_es, description_en, authors!inner(name), book_quotes(id, quote_es, quote_en, location, display_order), book_links(retailer, url, affiliate_tag, locale)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    // 22P02 = invalid_text_representation: a non-uuid id from the URL is a
    // "not found", not a server error.
    if (error.code === "22P02") return null;
    console.error("[book-detail] get for edit failed:", error.message);
    throw error;
  }
  if (!data) return null;
  const row = data;
  return {
    id: row.id,
    title: row.title,
    authorName: row.authors.name,
    year: row.year,
    status: row.status,
    descriptionEs: row.description_es ?? "",
    descriptionEn: row.description_en ?? "",
    quotes: [...row.book_quotes]
      .sort((a, b) => a.display_order - b.display_order)
      .map((q) => ({ quote_es: q.quote_es, quote_en: q.quote_en, location: q.location ?? "" })),
    links: row.book_links.map((l) => ({
      retailer: l.retailer,
      url: l.url,
      affiliate_tag: l.affiliate_tag ?? "",
      locale: l.locale,
    })),
  };
}

/** Admin write — atomic replace via the set_book_content RPC. */
export async function setBookContent(
  bookId: string,
  description: { es: string; en: string },
  quotes: { quote_es: string; quote_en: string; location?: string }[],
  links: { retailer: string; url: string; affiliate_tag?: string; locale?: string }[],
): Promise<SaveContentResult> {
  const { error } = await supabase.rpc("set_book_content", {
    p_book_id: bookId,
    p_description: description as unknown as Json,
    p_quotes: quotes as unknown as Json,
    p_links: links as unknown as Json,
  });
  if (error) {
    const msg = error.message ?? "";
    // 42501 = insufficient_privilege: the GRANT rejected the call before the
    // function body ran (anon or expired session) — same user-facing meaning
    // as the in-function is_admin() guard.
    if (msg.startsWith("unauthorized:") || error.code === "42501")
      return { ok: false, error: { kind: "unauthorized" } };
    if (msg.startsWith("validation:"))
      return { ok: false, error: { kind: "validation", message: msg } };
    return { ok: false, error: { kind: "unknown", message: msg } };
  }
  return { ok: true };
}
