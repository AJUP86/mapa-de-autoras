// Database types for the public schema.
//
// Hand-crafted to mirror supabase/migrations/0001_init.sql. Once the local
// Supabase stack is up, you can regenerate this file with:
//
//   supabase gen types typescript --local > src/types/supabase.ts
//
// The generated output is more verbose (it adds Insert/Update + Relationships
// helpers) but functionally compatible — code reading `Database['public']
// ['Tables']['authors']['Row']` will keep working unchanged.

export type AuthorStatusEnum     = "read" | "discovery";
export type SuggestionStatusEnum = "pending" | "approved" | "rejected";
export type SubscriberStatusEnum = "pending" | "confirmed" | "unsubscribed";
export type RetailerEnum         = "amazon" | "bookshop" | "kobo" | "other";

export interface Database {
  public: {
    Tables: {
      countries: {
        Row: {
          iso_a3: string;
          iso_numeric: number;
          name_en: string;
          name_es: string;
          display_label: string | null;
        };
      };
      authors: {
        Row: {
          id: string;
          name: string;
          slug: string;
          country_iso_a3: string;
          bio_en: string | null;
          bio_es: string | null;
          photo_url: string | null;
          birth_year: number | null;
          death_year: number | null;
          status: AuthorStatusEnum;
          published: boolean;
          created_at: string;
        };
      };
      books: {
        Row: {
          id: string;
          author_id: string;
          title: string;
          original_language: string | null;
          year: number | null;
          cover_url: string | null;
          description_en: string | null;
          description_es: string | null;
          display_order: number;
        };
      };
      book_links: {
        Row: {
          id: string;
          book_id: string;
          retailer: RetailerEnum;
          locale: string;
          url: string;
          affiliate_tag: string | null;
        };
      };
      // suggestions + subscribers will be added in Stage 6 — they aren't read
      // from the public landing page so omitting them keeps this file minimal.
    };
    Enums: {
      author_status: AuthorStatusEnum;
      suggestion_status: SuggestionStatusEnum;
      subscriber_status: SubscriberStatusEnum;
      retailer: RetailerEnum;
    };
  };
}
