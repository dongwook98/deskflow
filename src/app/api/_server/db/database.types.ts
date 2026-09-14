// 생성 파일. 직접 수정 금지. 마이그레이션 변경 후 재생성:
//   supabase gen types typescript --linked --schema public > src/app/api/_server/db/database.types.ts
// (첫 두 줄 주석은 다시 붙인다)

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
      profiles: {
        Row: {
          created_at: string
          id: string
          name: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          id: string
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      reservations: {
        Row: {
          cancelled_at: string | null
          created_at: string
          end_at: string
          id: string
          seat_id: string
          start_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          end_at: string
          id?: string
          seat_id: string
          start_at: string
          status?: Database["public"]["Enums"]["reservation_status"]
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          end_at?: string
          id?: string
          seat_id?: string
          start_at?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          created_by: string
          description: string
          height: number
          id: string
          layout_version: number
          name: string
          updated_at: string
          width: number
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string
          height: number
          id?: string
          layout_version?: number
          name: string
          updated_at?: string
          width: number
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          height?: number
          id?: string
          layout_version?: number
          name?: string
          updated_at?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seats: {
        Row: {
          id: string
          name: string
          space_object_id: string
          status: Database["public"]["Enums"]["seat_status"]
        }
        Insert: {
          id?: string
          name: string
          space_object_id: string
          status?: Database["public"]["Enums"]["seat_status"]
        }
        Update: {
          id?: string
          name?: string
          space_object_id?: string
          status?: Database["public"]["Enums"]["seat_status"]
        }
        Relationships: [
          {
            foreignKeyName: "seats_space_object_id_fkey"
            columns: ["space_object_id"]
            isOneToOne: true
            referencedRelation: "space_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      space_objects: {
        Row: {
          created_at: string
          height: number
          id: string
          room_id: string
          rotation: number
          type: Database["public"]["Enums"]["object_type"]
          updated_at: string
          width: number
          x: number
          y: number
          z_index: number
        }
        Insert: {
          created_at?: string
          height: number
          id?: string
          room_id: string
          rotation?: number
          type: Database["public"]["Enums"]["object_type"]
          updated_at?: string
          width: number
          x: number
          y: number
          z_index?: number
        }
        Update: {
          created_at?: string
          height?: number
          id?: string
          room_id?: string
          rotation?: number
          type?: Database["public"]["Enums"]["object_type"]
          updated_at?: string
          width?: number
          x?: number
          y?: number
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "space_objects_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      reservation_details: {
        Row: {
          cancelled_at: string | null
          created_at: string | null
          end_at: string | null
          id: string | null
          room_id: string | null
          room_name: string | null
          seat_id: string | null
          seat_name: string | null
          start_at: string | null
          status: Database["public"]["Enums"]["reservation_status"] | null
          user_id: string | null
          user_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_objects_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_seat_availability: {
        Args: { p_end_at: string; p_room_id: string; p_start_at: string }
        Returns: {
          mine: boolean
          seat_id: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      save_room_layout: {
        Args: { p_expected_version: number; p_objects: Json; p_room_id: string }
        Returns: number
      }
    }
    Enums: {
      object_type: "seat" | "table" | "wall"
      reservation_status: "reserved" | "cancelled"
      seat_status: "available" | "disabled"
      user_role: "user" | "admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      object_type: ["seat", "table", "wall"],
      reservation_status: ["reserved", "cancelled"],
      seat_status: ["available", "disabled"],
      user_role: ["user", "admin"],
    },
  },
} as const
