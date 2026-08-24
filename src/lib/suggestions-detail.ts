// suggestions-detail.ts — Stage 8.5 (book-first)
//
// Read helper for a single suggestion (the admin review page). Uses the authed
// supabase client; RLS gates everything via is_admin().
//
// A suggestion is now an envelope (submitter + lifecycle) with a nested list of
// independently-processed `suggestion_books` children. Writes live here again:
// per-entry disposition changes (reject / already-present / reopen) and the
// "Finish & notify" flip that processes the whole envelope.

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

export interface SuggestionBookEntry {
  entryId: string;
  suggestionId: string;
  proposed_author_name: string;
  proposed_country_iso_a3: string;
  proposed_book_title: string;
  note: string | null;
  disposition: SuggestionBookDisposition;
  submitted_on: string; // parent suggestion.created_at
  submitter_email: string; // parent
  submitter_name: string | null;
}

export async function getSuggestionBookEntry(entryId: string): Promise<SuggestionBookEntry | null> {
  const { data, error } = await supabase
    .from("suggestion_books")
    .select(
      "id, suggestion_id, proposed_author_name, proposed_country_iso_a3, proposed_book_title, note, disposition, suggestions ( created_at, submitter_email, submitter_name )",
    )
    .eq("id", entryId)
    .maybeSingle();
  if (error) {
    console.error("[suggestions-detail] get entry failed:", error.message);
    throw error;
  }
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    suggestion_id: string;
    proposed_author_name: string;
    proposed_country_iso_a3: string;
    proposed_book_title: string;
    note: string | null;
    disposition: SuggestionBookDisposition;
    suggestions: {
      created_at: string;
      submitter_email: string;
      submitter_name: string | null;
    } | null;
  };
  return {
    entryId: row.id,
    suggestionId: row.suggestion_id,
    proposed_author_name: row.proposed_author_name,
    proposed_country_iso_a3: row.proposed_country_iso_a3,
    proposed_book_title: row.proposed_book_title,
    note: row.note,
    disposition: row.disposition,
    submitted_on: row.suggestions?.created_at ?? "",
    submitter_email: row.suggestions?.submitter_email ?? "",
    submitter_name: row.suggestions?.submitter_name ?? null,
  };
}

export async function rejectSuggestionBook(entryId: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from("suggestion_books")
    .update({ disposition: "rejected", reason: reason.trim() || null })
    .eq("id", entryId);
  if (error) {
    console.error("[suggestions-detail] reject failed:", error.message);
    throw error;
  }
}

export async function markSuggestionBookAlreadyPresent(entryId: string): Promise<void> {
  const { error } = await supabase
    .from("suggestion_books")
    .update({ disposition: "already_present" })
    .eq("id", entryId);
  if (error) {
    console.error("[suggestions-detail] mark already-present failed:", error.message);
    throw error;
  }
}

export async function reopenSuggestionBook(entryId: string): Promise<void> {
  const { error } = await supabase
    .from("suggestion_books")
    .update({ disposition: "pending", reason: null, linked_book_id: null })
    .eq("id", entryId);
  if (error) {
    console.error("[suggestions-detail] reopen failed:", error.message);
    throw error;
  }
}

export async function finishSuggestion(suggestionId: string): Promise<void> {
  const { error } = await supabase
    .from("suggestions")
    .update({ status: "processed" })
    .eq("id", suggestionId);
  if (error) {
    console.error("[suggestions-detail] finish failed:", error.message);
    throw error;
  }
}
