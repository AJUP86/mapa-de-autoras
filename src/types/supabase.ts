export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      authors: {
        Row: {
          bio_en: string | null
          bio_es: string | null
          birth_year: number | null
          country_iso_a3: string
          created_at: string
          death_year: number | null
          id: string
          name: string
          photo_url: string | null
          published: boolean
          slug: string
        }
        Insert: {
          bio_en?: string | null
          bio_es?: string | null
          birth_year?: number | null
          country_iso_a3: string
          created_at?: string
          death_year?: number | null
          id?: string
          name: string
          photo_url?: string | null
          published?: boolean
          slug: string
        }
        Update: {
          bio_en?: string | null
          bio_es?: string | null
          birth_year?: number | null
          country_iso_a3?: string
          created_at?: string
          death_year?: number | null
          id?: string
          name?: string
          photo_url?: string | null
          published?: boolean
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "authors_country_iso_a3_fkey"
            columns: ["country_iso_a3"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["iso_a3"]
          },
        ]
      }
      book_links: {
        Row: {
          affiliate_tag: string | null
          book_id: string
          id: string
          locale: string
          retailer: Database["public"]["Enums"]["retailer"]
          url: string
        }
        Insert: {
          affiliate_tag?: string | null
          book_id: string
          id?: string
          locale: string
          retailer: Database["public"]["Enums"]["retailer"]
          url: string
        }
        Update: {
          affiliate_tag?: string | null
          book_id?: string
          id?: string
          locale?: string
          retailer?: Database["public"]["Enums"]["retailer"]
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_links_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author_id: string
          cover_url: string | null
          description_en: string | null
          description_es: string | null
          display_order: number
          id: string
          original_language: string | null
          status: Database["public"]["Enums"]["book_status"]
          title: string
          year: number | null
        }
        Insert: {
          author_id: string
          cover_url?: string | null
          description_en?: string | null
          description_es?: string | null
          display_order?: number
          id?: string
          original_language?: string | null
          status?: Database["public"]["Enums"]["book_status"]
          title: string
          year?: number | null
        }
        Update: {
          author_id?: string
          cover_url?: string | null
          description_en?: string | null
          description_es?: string | null
          display_order?: number
          id?: string
          original_language?: string | null
          status?: Database["public"]["Enums"]["book_status"]
          title?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "books_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          display_label: string | null
          iso_a3: string
          iso_numeric: number
          name_en: string
          name_es: string
        }
        Insert: {
          display_label?: string | null
          iso_a3: string
          iso_numeric: number
          name_en: string
          name_es: string
        }
        Update: {
          display_label?: string | null
          iso_a3?: string
          iso_numeric?: number
          name_en?: string
          name_es?: string
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          confirm_token: string
          confirmed_at: string | null
          created_at: string
          email: string
          id: string
          locale: string
          status: Database["public"]["Enums"]["subscriber_status"]
        }
        Insert: {
          confirm_token: string
          confirmed_at?: string | null
          created_at?: string
          email: string
          id?: string
          locale: string
          status?: Database["public"]["Enums"]["subscriber_status"]
        }
        Update: {
          confirm_token?: string
          confirmed_at?: string | null
          created_at?: string
          email?: string
          id?: string
          locale?: string
          status?: Database["public"]["Enums"]["subscriber_status"]
        }
        Relationships: []
      }
      suggestion_books: {
        Row: {
          created_at: string
          display_order: number
          disposition: Database["public"]["Enums"]["suggestion_book_disposition"]
          id: string
          linked_book_id: string | null
          note: string | null
          proposed_author_name: string
          proposed_book_title: string
          proposed_country_iso_a3: string
          reason: string | null
          suggestion_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          disposition?: Database["public"]["Enums"]["suggestion_book_disposition"]
          id?: string
          linked_book_id?: string | null
          note?: string | null
          proposed_author_name: string
          proposed_book_title: string
          proposed_country_iso_a3: string
          reason?: string | null
          suggestion_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          disposition?: Database["public"]["Enums"]["suggestion_book_disposition"]
          id?: string
          linked_book_id?: string | null
          note?: string | null
          proposed_author_name?: string
          proposed_book_title?: string
          proposed_country_iso_a3?: string
          reason?: string | null
          suggestion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggestion_books_linked_book_id_fkey"
            columns: ["linked_book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestion_books_proposed_country_iso_a3_fkey"
            columns: ["proposed_country_iso_a3"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["iso_a3"]
          },
          {
            foreignKeyName: "suggestion_books_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestions: {
        Row: {
          accepted_newsletter: boolean
          created_at: string
          id: string
          locale: string
          notified_at: string | null
          status: Database["public"]["Enums"]["suggestion_status"]
          submitter_email: string
          submitter_name: string | null
        }
        Insert: {
          accepted_newsletter?: boolean
          created_at?: string
          id?: string
          locale?: string
          notified_at?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          submitter_email: string
          submitter_name?: string | null
        }
        Update: {
          accepted_newsletter?: boolean
          created_at?: string
          id?: string
          locale?: string
          notified_at?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          submitter_email?: string
          submitter_name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_add_book: {
        Args: { p_author: Json; p_book: Json }
        Returns: string
      }
      heartbeat: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      promote_suggestion: {
        Args: { p_author: Json; p_books: Json[]; p_suggestion_id: string }
        Returns: string
      }
      promote_suggestion_book: {
        Args: { p_author: Json; p_book: Json; p_entry_id: string }
        Returns: string
      }
      slugify: { Args: { input: string }; Returns: string }
    }
    Enums: {
      book_status: "to_read" | "reading" | "read"
      retailer: "amazon" | "bookshop" | "kobo" | "other"
      subscriber_status: "pending" | "confirmed" | "unsubscribed"
      suggestion_book_disposition:
        | "pending"
        | "promoted"
        | "rejected"
        | "already_present"
      suggestion_status: "pending" | "processed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      book_status: ["to_read", "reading", "read"],
      retailer: ["amazon", "bookshop", "kobo", "other"],
      subscriber_status: ["pending", "confirmed", "unsubscribed"],
      suggestion_book_disposition: [
        "pending",
        "promoted",
        "rejected",
        "already_present",
      ],
      suggestion_status: ["pending", "processed"],
    },
  },
} as const

