export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      fields: {
        Row: {
          centroid_lat: number | null
          centroid_lon: number | null
          corners: Json
          created_at: string
          id: string
          name: string
          owner_id: string | null
          slug: string
          updated_at: string
          visibility: Database["public"]["Enums"]["visibility"]
        }
        Insert: {
          centroid_lat?: number | null
          centroid_lon?: number | null
          corners: Json
          created_at?: string
          id?: string
          name: string
          owner_id?: string | null
          slug: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Update: {
          centroid_lat?: number | null
          centroid_lon?: number | null
          corners?: Json
          created_at?: string
          id?: string
          name?: string
          owner_id?: string | null
          slug?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Relationships: []
      }
      match_media: {
        Row: {
          caption: string | null
          created_at: string
          height: number | null
          id: string
          match_id: string
          media_type: string
          mime_type: string | null
          owner_id: string
          sort_order: number
          storage_path: string
          updated_at: string
          visibility: Database["public"]["Enums"]["visibility"]
          width: number | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          match_id: string
          media_type?: string
          mime_type?: string | null
          owner_id: string
          sort_order?: number
          storage_path: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
          width?: number | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          height?: number | null
          id?: string
          match_id?: string
          media_type?: string
          mime_type?: string | null
          owner_id?: string
          sort_order?: number
          storage_path?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_media_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_private_notes: {
        Row: {
          created_at: string
          match_id: string
          note: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          match_id: string
          note?: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          match_id?: string
          note?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_private_notes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          break_files: Json
          break_session_starts: Json
          centroid_lat: number | null
          centroid_lon: number | null
          created_at: string
          file_names: Json | null
          format: string | null
          group_gap_min: number
          id: string
          location_label: string | null
          manual_splits: Json | null
          owner_id: string
          primary_field_id: string | null
          short_id: string
          source: string
          source_activity_id: string | null
          sport: string | null
          started_at: string | null
          title: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["visibility"]
        }
        Insert: {
          break_files?: Json
          break_session_starts?: Json
          centroid_lat?: number | null
          centroid_lon?: number | null
          created_at?: string
          file_names?: Json | null
          format?: string | null
          group_gap_min?: number
          id?: string
          location_label?: string | null
          manual_splits?: Json | null
          owner_id: string
          primary_field_id?: string | null
          short_id: string
          source?: string
          source_activity_id?: string | null
          sport?: string | null
          started_at?: string | null
          title?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Update: {
          break_files?: Json
          break_session_starts?: Json
          centroid_lat?: number | null
          centroid_lon?: number | null
          created_at?: string
          file_names?: Json | null
          format?: string | null
          group_gap_min?: number
          id?: string
          location_label?: string | null
          manual_splits?: Json | null
          owner_id?: string
          primary_field_id?: string | null
          short_id?: string
          source?: string
          source_activity_id?: string | null
          sport?: string | null
          started_at?: string | null
          title?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "matches_primary_field_id_fkey"
            columns: ["primary_field_id"]
            isOneToOne: false
            referencedRelation: "fields"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_analysis_defaults: {
        Row: {
          birth_date: string | null
          max_hr: number | null
          rest_hr: number | null
          user_id: string
        }
        Insert: {
          birth_date?: string | null
          max_hr?: number | null
          rest_hr?: number | null
          user_id: string
        }
        Update: {
          birth_date?: string | null
          max_hr?: number | null
          rest_hr?: number | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      sessions: {
        Row: {
          analysis_options: Json | null
          attacking_dir: number
          created_at: string
          duration_s: number | null
          end_time: string | null
          flips: Json | null
          id: string
          kind: string | null
          label: string | null
          match_id: string
          owner_id: string
          periods: Json | null
          sample_count: number | null
          seq: number
          side_dir: number
          start_time: string | null
          summary: Json | null
          updated_at: string
        }
        Insert: {
          analysis_options?: Json | null
          attacking_dir?: number
          created_at?: string
          duration_s?: number | null
          end_time?: string | null
          flips?: Json | null
          id?: string
          kind?: string | null
          label?: string | null
          match_id: string
          owner_id: string
          periods?: Json | null
          sample_count?: number | null
          seq: number
          side_dir?: number
          start_time?: string | null
          summary?: Json | null
          updated_at?: string
        }
        Update: {
          analysis_options?: Json | null
          attacking_dir?: number
          created_at?: string
          duration_s?: number | null
          end_time?: string | null
          flips?: Json | null
          id?: string
          kind?: string | null
          label?: string | null
          match_id?: string
          owner_id?: string
          periods?: Json | null
          sample_count?: number | null
          seq?: number
          side_dir?: number
          start_time?: string | null
          summary?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      strava_activities: {
        Row: {
          average_heartrate: number | null
          average_speed_mps: number | null
          created_at: string
          distance_m: number | null
          elapsed_time_s: number | null
          has_heartrate: boolean | null
          id: string
          imported_match_id: string | null
          map_summary_polyline: string | null
          max_heartrate: number | null
          max_speed_mps: number | null
          moving_time_s: number | null
          name: string | null
          raw_summary: Json | null
          sport_type: string | null
          start_date: string | null
          strava_activity_id: number
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          average_heartrate?: number | null
          average_speed_mps?: number | null
          created_at?: string
          distance_m?: number | null
          elapsed_time_s?: number | null
          has_heartrate?: boolean | null
          id?: string
          imported_match_id?: string | null
          map_summary_polyline?: string | null
          max_heartrate?: number | null
          max_speed_mps?: number | null
          moving_time_s?: number | null
          name?: string | null
          raw_summary?: Json | null
          sport_type?: string | null
          start_date?: string | null
          strava_activity_id: number
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          average_heartrate?: number | null
          average_speed_mps?: number | null
          created_at?: string
          distance_m?: number | null
          elapsed_time_s?: number | null
          has_heartrate?: boolean | null
          id?: string
          imported_match_id?: string | null
          map_summary_polyline?: string | null
          max_heartrate?: number | null
          max_speed_mps?: number | null
          moving_time_s?: number | null
          name?: string | null
          raw_summary?: Json | null
          sport_type?: string | null
          start_date?: string | null
          strava_activity_id?: number
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strava_activities_imported_match_id_fkey"
            columns: ["imported_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      strava_connections: {
        Row: {
          athlete_firstname: string | null
          athlete_id: number
          athlete_lastname: string | null
          athlete_username: string | null
          connected_at: string
          created_at: string
          last_sync_at: string | null
          scopes: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          athlete_firstname?: string | null
          athlete_id: number
          athlete_lastname?: string | null
          athlete_username?: string | null
          connected_at?: string
          created_at?: string
          last_sync_at?: string | null
          scopes?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          athlete_firstname?: string | null
          athlete_id?: number
          athlete_lastname?: string | null
          athlete_username?: string | null
          connected_at?: string
          created_at?: string
          last_sync_at?: string | null
          scopes?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strava_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_privileges: {
        Row: {
          created_at: string
          level: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          level?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          level?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_shared_match: { Args: { p_short_id: string }; Returns: Json }
      is_xpitch_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      visibility: "private" | "unlisted" | "public"
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
  public: {
    Enums: {
      visibility: ["private", "unlisted", "public"],
    },
  },
} as const
