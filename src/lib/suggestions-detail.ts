// suggestions-detail.ts — Stage 8.5 (book-first)
//
// Read helper for a single suggestion (the admin review page). Uses the authed
// supabase client; RLS gates everything via is_admin().
//
// A suggestion is now an envelope (submitter + lifecycle) with a nested list of
// independently-processed `suggestion_books` children. Per-book disposition
// writes and the "Finish & notify" flip are Task 10's job (SuggestionReview.tsx
// is rewritten there), so no write helpers live here anymore.

import { supabase } from "./supabase";

export type SuggestionBookDisposition = "pending" | "promoted" | "rejected" | "already_present";

export interface SuggestionBook {
  id: string;
  proposed_author_name: string;
  proposed_country_iso_a3: string;
  proposed_book_title: string;
  note: string | null;
  disposition: SuggestionBookDisposition;
  reason: string | null;
  linked_book_id: string | null;
  display_order: number;
}

export interface SuggestionDetail {
  id: string;
  created_at: string;
  status: "pending" | "processed";
  submitter_email: string;
  submitter_name: string | null;
  locale: "es" | "en";
  accepted_newsletter: boolean;
  notified_at: string | null;
  suggestion_books: SuggestionBook[];
}

export async function getSuggestion(id: string): Promise<SuggestionDetail | null> {
  const { data, error } = await supabase
    .from("suggestions")
    .select(
      "id, created_at, status, submitter_email, submitter_name, locale, accepted_newsletter, notified_at, suggestion_books(id, proposed_author_name, proposed_country_iso_a3, proposed_book_title, note, disposition, reason, linked_book_id, display_order)",
    )
    .eq("id", id)
    .order("display_order", { ascending: true, referencedTable: "suggestion_books" })
    .maybeSingle();
  if (error) {
    console.error("[suggestions-detail] get failed:", error.message);
    throw error;
  }
  return (data as unknown as SuggestionDetail) ?? null;
}
