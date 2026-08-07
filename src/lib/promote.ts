// promote.ts — Stage 7b-i
//
// Browser-side wrapper around the promote_suggestion() RPC. The RPC handles
// atomicity, the duplicate check, and (optionally) marking the linked
// suggestion as approved.

import { supabase } from "./supabase";
import type { AuthorStatus } from "./map-state";
import type { Json } from "~/types/supabase";

export interface PromoteAuthorInput {
  name: string;
  country_iso_a3: string;
  status: AuthorStatus;
  bio_es?: string;
  bio_en?: string;
  photo_url?: string;
  birth_year?: number;
  death_year?: number;
  published: boolean;
  reviewer_notes?: string;
}

export interface PromoteBookInput {
  title: string;
  year?: number;
  original_language?: string;
  cover_url?: string;
  description_es?: string;
  description_en?: string;
}

export type PromoteError =
  | { kind: "duplicate" }
  | { kind: "validation"; message: string }
  | { kind: "unauthorized" }
  | { kind: "unknown"; message: string };

export type PromoteResult = { ok: true; authorId: string } | { ok: false; error: PromoteError };

export async function promoteSuggestion(
  suggestionId: string | null,
  author: PromoteAuthorInput,
  books: PromoteBookInput[],
): Promise<PromoteResult> {
  const { data, error } = await supabase.rpc("promote_suggestion", {
    p_suggestion_id: suggestionId as unknown as string,
    p_author: author as unknown as Json,
    p_books: books as unknown as Json[],
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.startsWith("duplicate_author:")) return { ok: false, error: { kind: "duplicate" } };
    if (msg.startsWith("validation:"))
      return { ok: false, error: { kind: "validation", message: msg } };
    if (msg.startsWith("unauthorized:")) return { ok: false, error: { kind: "unauthorized" } };
    return { ok: false, error: { kind: "unknown", message: msg } };
  }
  return { ok: true, authorId: data as string };
}
