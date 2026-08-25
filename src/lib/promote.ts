// promote.ts — Stage 8.5 (book-first)
//
// Browser-side wrapper around the promote_suggestion_book() RPC. The RPC
// operates on a single suggestion_books entry: it upserts the author by
// (lower(name), country_iso_a3) — so a duplicate author is no longer a
// dead-end — inserts the book, and resolves the entry to `promoted`.

import { supabase } from "./supabase";
import type { BookStatus } from "./map-state";
import type { Json } from "~/types/supabase";

export interface PromoteAuthorInput {
  name: string;
  country_iso_a3: string;
  bio_es?: string;
  bio_en?: string;
  photo_url?: string;
  birth_year?: number;
  death_year?: number;
  published: boolean;
}

export interface PromoteBookInput {
  title: string;
  year?: number;
  original_language?: string;
  cover_url?: string;
  description_es?: string;
  description_en?: string;
  status?: BookStatus;
}

export type PromoteError =
  | { kind: "validation"; message: string }
  | { kind: "unauthorized" }
  | { kind: "unknown"; message: string };

export type PromoteResult = { ok: true; bookId: string } | { ok: false; error: PromoteError };

export async function promoteSuggestionBook(
  entryId: string,
  author: PromoteAuthorInput,
  book: PromoteBookInput,
): Promise<PromoteResult> {
  const { data, error } = await supabase.rpc("promote_suggestion_book", {
    p_entry_id: entryId,
    p_author: author as unknown as Json,
    p_book: book as unknown as Json,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.startsWith("validation:"))
      return { ok: false, error: { kind: "validation", message: msg } };
    if (msg.startsWith("unauthorized:")) return { ok: false, error: { kind: "unauthorized" } };
    return { ok: false, error: { kind: "unknown", message: msg } };
  }
  return { ok: true, bookId: data as string };
}

export async function adminAddBook(
  author: PromoteAuthorInput,
  book: PromoteBookInput,
): Promise<PromoteResult> {
  const { data, error } = await supabase.rpc("admin_add_book", {
    p_author: author as unknown as Json,
    p_book: book as unknown as Json,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.startsWith("validation:"))
      return { ok: false, error: { kind: "validation", message: msg } };
    if (msg.startsWith("unauthorized:")) return { ok: false, error: { kind: "unauthorized" } };
    return { ok: false, error: { kind: "unknown", message: msg } };
  }
  return { ok: true, bookId: data as string };
}
