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
      _internal_cron_auth: {
        Row: {
          created_at: string
          id: boolean
          token: string
        }
        Insert: {
          created_at?: string
          id?: boolean
          token: string
        }
        Update: {
          created_at?: string
          id?: boolean
          token?: string
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action: string
          actor_name: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          new_value: string | null
          poc_role_type: string | null
          previous_value: string | null
          source: string
        }
        Insert: {
          action: string
          actor_name: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          new_value?: string | null
          poc_role_type?: string | null
          previous_value?: string | null
          source?: string
        }
        Update: {
          action?: string
          actor_name?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          new_value?: string | null
          poc_role_type?: string | null
          previous_value?: string | null
          source?: string
        }
        Relationships: []
      }
      ai_usage_events: {
        Row: {
          created_at: string
          error_message: string | null
          feature: string
          id: string
          latency_ms: number | null
          metadata: Json
          model: string | null
          prompt_tokens: number
          request_id: string | null
          response_tokens: number
          status: string
          total_tokens: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          feature: string
          id?: string
          latency_ms?: number | null
          metadata?: Json
          model?: string | null
          prompt_tokens?: number
          request_id?: string | null
          response_tokens?: number
          status?: string
          total_tokens?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          feature?: string
          id?: string
          latency_ms?: number | null
          metadata?: Json
          model?: string | null
          prompt_tokens?: number
          request_id?: string | null
          response_tokens?: number
          status?: string
          total_tokens?: number
          user_id?: string | null
        }
        Relationships: []
      }
      alumni_records: {
        Row: {
          cohort: string | null
          company_2: string | null
          company_3: string | null
          company_4: string | null
          company_5: string | null
          company_6: string | null
          current_city: string | null
          current_company: string | null
          current_role_title: string | null
          current_state: string | null
          domain_1: string | null
          domain_2: string | null
          id: string
          industry: string | null
          linkedin_profile: string | null
          location: string | null
          mu_email_id: string | null
          role_2: string | null
          role_4: string | null
          role_5: string | null
          role_6: string | null
          source_file_name: string | null
          student_name: string
          updated_at: string
          uploaded_at: string
          uploaded_by_admin_email: string | null
          uploaded_by_admin_id: string | null
        }
        Insert: {
          cohort?: string | null
          company_2?: string | null
          company_3?: string | null
          company_4?: string | null
          company_5?: string | null
          company_6?: string | null
          current_city?: string | null
          current_company?: string | null
          current_role_title?: string | null
          current_state?: string | null
          domain_1?: string | null
          domain_2?: string | null
          id?: string
          industry?: string | null
          linkedin_profile?: string | null
          location?: string | null
          mu_email_id?: string | null
          role_2?: string | null
          role_4?: string | null
          role_5?: string | null
          role_6?: string | null
          source_file_name?: string | null
          student_name: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by_admin_email?: string | null
          uploaded_by_admin_id?: string | null
        }
        Update: {
          cohort?: string | null
          company_2?: string | null
          company_3?: string | null
          company_4?: string | null
          company_5?: string | null
          company_6?: string | null
          current_city?: string | null
          current_company?: string | null
          current_role_title?: string | null
          current_state?: string | null
          domain_1?: string | null
          domain_2?: string | null
          id?: string
          industry?: string | null
          linkedin_profile?: string | null
          location?: string | null
          mu_email_id?: string | null
          role_2?: string | null
          role_4?: string | null
          role_5?: string | null
          role_6?: string | null
          source_file_name?: string | null
          student_name?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by_admin_email?: string | null
          uploaded_by_admin_id?: string | null
        }
        Relationships: []
      }
      copilot_cache: {
        Row: {
          cache_key: string
          created_at: string
          response: Json
          ttl_seconds: number
        }
        Insert: {
          cache_key: string
          created_at?: string
          response: Json
          ttl_seconds?: number
        }
        Update: {
          cache_key?: string
          created_at?: string
          response?: Json
          ttl_seconds?: number
        }
        Relationships: []
      }
      copilot_messages: {
        Row: {
          attachments: Json
          content: string
          created_at: string
          id: string
          mentions: Json
          metadata: Json
          role: string
          thread_id: string
          ts: number
        }
        Insert: {
          attachments?: Json
          content?: string
          created_at?: string
          id?: string
          mentions?: Json
          metadata?: Json
          role: string
          thread_id: string
          ts: number
        }
        Update: {
          attachments?: Json
          content?: string
          created_at?: string
          id?: string
          mentions?: Json
          metadata?: Json
          role?: string
          thread_id?: string
          ts?: number
        }
        Relationships: []
      }
      copilot_threads: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          last_message_at: string
          metadata: Json
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          last_message_at?: string
          metadata?: Json
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          last_message_at?: string
          metadata?: Json
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      copilot_turns: {
        Row: {
          cache_hit: boolean | null
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          intent: string | null
          latency_ms: number | null
          mode: string | null
          model: string | null
          prompt_chars: number | null
          prompt_tokens: number | null
          response_chars: number | null
          response_tokens: number | null
          role: string | null
          scope: string | null
          scope_applied_count: number
          scope_broadened_count: number
          scope_missing_count: number
          scope_summary: Json
          started_at: string
          status: string | null
          thread_id: string | null
          tool_calls_count: number | null
          tool_rounds: number | null
          tools_used: Json | null
          total_tokens: number | null
          used_write_tool: boolean | null
          user_id: string | null
        }
        Insert: {
          cache_hit?: boolean | null
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          intent?: string | null
          latency_ms?: number | null
          mode?: string | null
          model?: string | null
          prompt_chars?: number | null
          prompt_tokens?: number | null
          response_chars?: number | null
          response_tokens?: number | null
          role?: string | null
          scope?: string | null
          scope_applied_count?: number
          scope_broadened_count?: number
          scope_missing_count?: number
          scope_summary?: Json
          started_at?: string
          status?: string | null
          thread_id?: string | null
          tool_calls_count?: number | null
          tool_rounds?: number | null
          tools_used?: Json | null
          total_tokens?: number | null
          used_write_tool?: boolean | null
          user_id?: string | null
        }
        Update: {
          cache_hit?: boolean | null
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          intent?: string | null
          latency_ms?: number | null
          mode?: string | null
          model?: string | null
          prompt_chars?: number | null
          prompt_tokens?: number | null
          response_chars?: number | null
          response_tokens?: number | null
          role?: string | null
          scope?: string | null
          scope_applied_count?: number
          scope_broadened_count?: number
          scope_missing_count?: number
          scope_summary?: Json
          started_at?: string
          status?: string | null
          thread_id?: string | null
          tool_calls_count?: number | null
          tool_rounds?: number | null
          tools_used?: Json | null
          total_tokens?: number | null
          used_write_tool?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      data_source_status: {
        Row: {
          current_status: string
          id: string
          last_file_name: string | null
          last_uploaded_at: string | null
          last_uploaded_by_admin_email: string | null
          last_uploaded_by_admin_id: string | null
          source_type: string
          total_records: number
          updated_at: string
        }
        Insert: {
          current_status?: string
          id?: string
          last_file_name?: string | null
          last_uploaded_at?: string | null
          last_uploaded_by_admin_email?: string | null
          last_uploaded_by_admin_id?: string | null
          source_type: string
          total_records?: number
          updated_at?: string
        }
        Update: {
          current_status?: string
          id?: string
          last_file_name?: string | null
          last_uploaded_at?: string | null
          last_uploaded_by_admin_email?: string | null
          last_uploaded_by_admin_id?: string | null
          source_type?: string
          total_records?: number
          updated_at?: string
        }
        Relationships: []
      }
      data_source_sync_history: {
        Row: {
          created_at: string
          error_rows: number
          file_name: string | null
          id: string
          inserted_rows: number
          skipped_rows: number
          source_type: string
          status: string
          total_rows: number
          updated_rows: number
          uploaded_by_admin_email: string | null
          uploaded_by_admin_id: string | null
          validation_summary: Json
        }
        Insert: {
          created_at?: string
          error_rows?: number
          file_name?: string | null
          id?: string
          inserted_rows?: number
          skipped_rows?: number
          source_type: string
          status?: string
          total_rows?: number
          updated_rows?: number
          uploaded_by_admin_email?: string | null
          uploaded_by_admin_id?: string | null
          validation_summary?: Json
        }
        Update: {
          created_at?: string
          error_rows?: number
          file_name?: string | null
          id?: string
          inserted_rows?: number
          skipped_rows?: number
          source_type?: string
          status?: string
          total_rows?: number
          updated_rows?: number
          uploaded_by_admin_email?: string | null
          uploaded_by_admin_id?: string | null
          validation_summary?: Json
        }
        Relationships: []
      }
      domains: {
        Row: {
          active_lmps: number
          aliases: string[] | null
          closed: number
          conversion_rate: number
          converted_lmps: number
          created_at: string
          dormant: number
          id: string
          name: string
          offer_received: number
          on_hold: number
          poc_count: number
          slug: string
          student_count: number
          total_lmps: number
          updated_at: string
        }
        Insert: {
          active_lmps?: number
          aliases?: string[] | null
          closed?: number
          conversion_rate?: number
          converted_lmps?: number
          created_at?: string
          dormant?: number
          id?: string
          name: string
          offer_received?: number
          on_hold?: number
          poc_count?: number
          slug: string
          student_count?: number
          total_lmps?: number
          updated_at?: string
        }
        Update: {
          active_lmps?: number
          aliases?: string[] | null
          closed?: number
          conversion_rate?: number
          converted_lmps?: number
          created_at?: string
          dormant?: number
          id?: string
          name?: string
          offer_received?: number
          on_hold?: number
          poc_count?: number
          slug?: string
          student_count?: number
          total_lmps?: number
          updated_at?: string
        }
        Relationships: []
      }
      feedback_form_templates: {
        Row: {
          audience: string
          fields: Json
          id: string
          submit_label: string
          subtitle: string
          theme: Json
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audience: string
          fields?: Json
          id?: string
          submit_label?: string
          subtitle?: string
          theme?: Json
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience?: string
          fields?: Json
          id?: string
          submit_label?: string
          subtitle?: string
          theme?: Json
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      field_mapping_registry: {
        Row: {
          app_field: string | null
          created_at: string
          data_coverage_pct: number | null
          id: string
          is_mapped: boolean
          last_verified_at: string | null
          notes: string | null
          sheet_column: string
          sync_direction: string
          tab_name: string
          updated_at: string
        }
        Insert: {
          app_field?: string | null
          created_at?: string
          data_coverage_pct?: number | null
          id?: string
          is_mapped?: boolean
          last_verified_at?: string | null
          notes?: string | null
          sheet_column: string
          sync_direction?: string
          tab_name: string
          updated_at?: string
        }
        Update: {
          app_field?: string | null
          created_at?: string
          data_coverage_pct?: number | null
          id?: string
          is_mapped?: boolean
          last_verified_at?: string | null
          notes?: string | null
          sheet_column?: string
          sync_direction?: string
          tab_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      lmp_candidates: {
        Row: {
          added_by: string | null
          created_at: string
          email: string | null
          id: string
          lmp_id: string
          mentor_id: string | null
          metadata: Json | null
          offer_status: string | null
          pipeline_stage: string | null
          r1_status: string | null
          r2_status: string | null
          r3_status: string | null
          remarks: string | null
          roll_no: string | null
          session_status: string | null
          status: string | null
          student_id: string | null
          student_name: string
          sync_source: string | null
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lmp_id: string
          mentor_id?: string | null
          metadata?: Json | null
          offer_status?: string | null
          pipeline_stage?: string | null
          r1_status?: string | null
          r2_status?: string | null
          r3_status?: string | null
          remarks?: string | null
          roll_no?: string | null
          session_status?: string | null
          status?: string | null
          student_id?: string | null
          student_name: string
          sync_source?: string | null
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lmp_id?: string
          mentor_id?: string | null
          metadata?: Json | null
          offer_status?: string | null
          pipeline_stage?: string | null
          r1_status?: string | null
          r2_status?: string | null
          r3_status?: string | null
          remarks?: string | null
          roll_no?: string | null
          session_status?: string | null
          status?: string | null
          student_id?: string | null
          student_name?: string
          sync_source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lmp_candidates_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_candidates_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_candidates_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_candidates_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "mentors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_candidates_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "mentors_union_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_candidates_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_candidates_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students_with_load"
            referencedColumns: ["id"]
          },
        ]
      }
      lmp_checklists: {
        Row: {
          attachment_meta: Json | null
          completed: boolean
          created_at: string
          id: string
          item_key: string
          lmp_id: string
          note: string | null
          notes_meta: Json
          updated_at: string
        }
        Insert: {
          attachment_meta?: Json | null
          completed?: boolean
          created_at?: string
          id?: string
          item_key: string
          lmp_id: string
          note?: string | null
          notes_meta?: Json
          updated_at?: string
        }
        Update: {
          attachment_meta?: Json | null
          completed?: boolean
          created_at?: string
          id?: string
          item_key?: string
          lmp_id?: string
          note?: string | null
          notes_meta?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lmp_checklists_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_checklists_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_checklists_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      lmp_comments: {
        Row: {
          author_color: string | null
          author_initials: string | null
          author_name: string
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          lmp_id: string
          source: string
          ts: string
        }
        Insert: {
          author_color?: string | null
          author_initials?: string | null
          author_name: string
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          lmp_id: string
          source?: string
          ts?: string
        }
        Update: {
          author_color?: string | null
          author_initials?: string | null
          author_name?: string
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          lmp_id?: string
          source?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "lmp_comments_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_comments_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_comments_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      lmp_daily_logs: {
        Row: {
          author_email: string | null
          author_name: string
          chips: string[]
          created_at: string
          entry_type: string
          id: string
          lmp_id: string
          metadata: Json
          text: string
        }
        Insert: {
          author_email?: string | null
          author_name?: string
          chips?: string[]
          created_at?: string
          entry_type?: string
          id?: string
          lmp_id: string
          metadata?: Json
          text?: string
        }
        Update: {
          author_email?: string | null
          author_name?: string
          chips?: string[]
          created_at?: string
          entry_type?: string
          id?: string
          lmp_id?: string
          metadata?: Json
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "lmp_daily_logs_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_daily_logs_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_daily_logs_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      lmp_guide_manual: {
        Row: {
          created_at: string
          description: string | null
          id: string
          title: string
          updated_at: string
          updated_by: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          url?: string | null
        }
        Relationships: []
      }
      lmp_guide_nodes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lmp_guide_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "lmp_guide_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      lmp_mentors: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          created_at: string
          feedback_avg: number | null
          feedback_count: number | null
          id: string
          lmp_id: string
          match_score: number | null
          mentor_id: string
          mentor_source: string | null
          notes: string | null
          session_count: number
          status: string
          student_id: string | null
          sync_source: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string
          feedback_avg?: number | null
          feedback_count?: number | null
          id?: string
          lmp_id: string
          match_score?: number | null
          mentor_id: string
          mentor_source?: string | null
          notes?: string | null
          session_count?: number
          status?: string
          student_id?: string | null
          sync_source?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string
          feedback_avg?: number | null
          feedback_count?: number | null
          id?: string
          lmp_id?: string
          match_score?: number | null
          mentor_id?: string
          mentor_source?: string | null
          notes?: string | null
          session_count?: number
          status?: string
          student_id?: string | null
          sync_source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lmp_mentors_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_mentors_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_mentors_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_mentors_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "mentors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_mentors_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "mentors_union_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_mentors_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_mentors_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students_with_load"
            referencedColumns: ["id"]
          },
        ]
      }
      lmp_poc_links: {
        Row: {
          assigned_at: string | null
          assignment_source: string | null
          created_at: string
          id: string
          is_active: boolean | null
          lmp_id: string
          poc_id: string
          raw_sheet_value: string | null
          removed_at: string | null
          role: string
        }
        Insert: {
          assigned_at?: string | null
          assignment_source?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          lmp_id: string
          poc_id: string
          raw_sheet_value?: string | null
          removed_at?: string | null
          role: string
        }
        Update: {
          assigned_at?: string | null
          assignment_source?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          lmp_id?: string
          poc_id?: string
          raw_sheet_value?: string | null
          removed_at?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "lmp_poc_links_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_poc_links_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_poc_links_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_poc_links_poc_id_fkey"
            columns: ["poc_id"]
            isOneToOne: false
            referencedRelation: "poc_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_poc_links_poc_id_fkey"
            columns: ["poc_id"]
            isOneToOne: false
            referencedRelation: "poc_profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_poc_links_poc_id_fkey"
            columns: ["poc_id"]
            isOneToOne: false
            referencedRelation: "poc_profiles_with_load"
            referencedColumns: ["id"]
          },
        ]
      }
      lmp_process_drafts: {
        Row: {
          company: string | null
          created_at: string
          created_by: string
          created_by_name: string | null
          domain: string | null
          id: string
          jd_file_name: string | null
          jd_text: string | null
          parsed_jd: Json | null
          role: string | null
          selected_candidates: Json
          selection: Json | null
          step: number
          type: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          created_by?: string
          created_by_name?: string | null
          domain?: string | null
          id?: string
          jd_file_name?: string | null
          jd_text?: string | null
          parsed_jd?: Json | null
          role?: string | null
          selected_candidates?: Json
          selection?: Json | null
          step?: number
          type?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          created_by?: string
          created_by_name?: string | null
          domain?: string | null
          id?: string
          jd_file_name?: string | null
          jd_text?: string | null
          parsed_jd?: Json | null
          role?: string | null
          selected_candidates?: Json
          selection?: Json | null
          step?: number
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lmp_outreach_feedback: {
        Row: {
          id: string
          lmp_id: string
          feedback: string
          created_by: string | null
          created_by_name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lmp_id: string
          feedback: string
          created_by?: string | null
          created_by_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          lmp_id?: string
          feedback?: string
          created_by?: string | null
          created_by_name?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lmp_outreach_feedback_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_outreach_feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "poc_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lmp_processes: {
        Row: {
          admin_owner: string | null
          allocation_path: string | null
          allocation_reason: string | null
          allocator: string | null
          assignment_review: boolean | null
          behavioral_status: string | null
          closing_date: string | null
          comments: string | null
          company: string
          convert_names: string | null
          created_at: string
          created_by: string | null
          daily_progress: string | null
          date: string | null
          domain_id: string | null
          domain_raw: string | null
          final_convert: string | null
          historical_tag: string | null
          id: string
          is_archived: boolean | null
          jd_file_name: string | null
          jd_label: string | null
          jd_seniority: string | null
          jd_skills: Json | null
          jd_source: string | null
          jd_text: string | null
          jd_uploaded_at: string | null
          jd_uploaded_by: string | null
          jd_url: string | null
          last_progress_updated_at: string | null
          lmp_code: string | null
          match_tag: string | null
          mentor_aligned: boolean | null
          mentor_rating: number | null
          mentor_selected: string | null
          mentor_suggestions: Json | null
          mentor_suggestions_at: string | null
          mentor_suggestions_context: Json | null
          next_progress_date: string | null
          next_progress_reminder_type: string | null
          next_progress_status: string | null
          next_progress_type: string | null
          one_to_one_mock: boolean | null
          outreach_poc: string | null
          outreach_poc_ids: string[] | null
          placement_progress: string | null
          prep_doc: string | null
          prep_doc_link: string | null
          prep_doc_shared: boolean | null
          prep_poc: string | null
          prep_poc_id: string | null
          prep_progress: string | null
          r1_shortlisted: string | null
          r2_shortlisted: string | null
          r3_shortlisted: string | null
          remarks: string | null
          reminder_version: number | null
          role: string
          score_breakdown: Json | null
          sheet_row_id: string | null
          status: string
          support_poc: string | null
          support_poc_id: string | null
          feedback_by_outreach: string | null
          sync_source: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          admin_owner?: string | null
          allocation_path?: string | null
          allocation_reason?: string | null
          allocator?: string | null
          assignment_review?: boolean | null
          behavioral_status?: string | null
          closing_date?: string | null
          comments?: string | null
          company: string
          convert_names?: string | null
          created_at?: string
          created_by?: string | null
          daily_progress?: string | null
          date?: string | null
          domain_id?: string | null
          domain_raw?: string | null
          feedback_by_outreach?: string | null
          final_convert?: string | null
          historical_tag?: string | null
          is_archived?: boolean | null
          id?: string
          jd_file_name?: string | null
          jd_label?: string | null
          jd_seniority?: string | null
          jd_skills?: Json | null
          jd_source?: string | null
          jd_text?: string | null
          jd_uploaded_at?: string | null
          jd_uploaded_by?: string | null
          jd_url?: string | null
          last_progress_updated_at?: string | null
          lmp_code?: string | null
          match_tag?: string | null
          mentor_aligned?: boolean | null
          mentor_rating?: number | null
          mentor_selected?: string | null
          mentor_suggestions?: Json | null
          mentor_suggestions_at?: string | null
          mentor_suggestions_context?: Json | null
          next_progress_date?: string | null
          next_progress_reminder_type?: string | null
          next_progress_status?: string | null
          next_progress_type?: string | null
          one_to_one_mock?: boolean | null
          outreach_poc?: string | null
          outreach_poc_ids?: string[] | null
          placement_progress?: string | null
          prep_doc?: string | null
          prep_doc_link?: string | null
          prep_doc_shared?: boolean | null
          prep_poc?: string | null
          prep_poc_id?: string | null
          prep_progress?: string | null
          r1_shortlisted?: string | null
          r2_shortlisted?: string | null
          r3_shortlisted?: string | null
          remarks?: string | null
          reminder_version?: number | null
          role: string
          score_breakdown?: Json | null
          sheet_row_id?: string | null
          status?: string
          support_poc?: string | null
          support_poc_id?: string | null
          sync_source?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          admin_owner?: string | null
          allocation_path?: string | null
          allocation_reason?: string | null
          allocator?: string | null
          assignment_review?: boolean | null
          behavioral_status?: string | null
          closing_date?: string | null
          comments?: string | null
          company?: string
          convert_names?: string | null
          created_at?: string
          created_by?: string | null
          daily_progress?: string | null
          date?: string | null
          domain_id?: string | null
          domain_raw?: string | null
          feedback_by_outreach?: string | null
          final_convert?: string | null
          historical_tag?: string | null
          is_archived?: boolean | null
          id?: string
          jd_file_name?: string | null
          jd_label?: string | null
          jd_seniority?: string | null
          jd_skills?: Json | null
          jd_source?: string | null
          jd_text?: string | null
          jd_uploaded_at?: string | null
          jd_uploaded_by?: string | null
          jd_url?: string | null
          last_progress_updated_at?: string | null
          lmp_code?: string | null
          match_tag?: string | null
          mentor_aligned?: boolean | null
          mentor_rating?: number | null
          mentor_selected?: string | null
          mentor_suggestions?: Json | null
          mentor_suggestions_at?: string | null
          mentor_suggestions_context?: Json | null
          next_progress_date?: string | null
          next_progress_reminder_type?: string | null
          next_progress_status?: string | null
          next_progress_type?: string | null
          one_to_one_mock?: boolean | null
          outreach_poc?: string | null
          outreach_poc_ids?: string[] | null
          placement_progress?: string | null
          prep_doc?: string | null
          prep_doc_link?: string | null
          prep_doc_shared?: boolean | null
          prep_poc?: string | null
          prep_poc_id?: string | null
          prep_progress?: string | null
          r1_shortlisted?: string | null
          r2_shortlisted?: string | null
          r3_shortlisted?: string | null
          remarks?: string | null
          reminder_version?: number | null
          role?: string
          score_breakdown?: Json | null
          sheet_row_id?: string | null
          status?: string
          support_poc?: string | null
          support_poc_id?: string | null
          sync_source?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lmp_processes_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
      lmp_progress_reminders: {
        Row: {
          created_at: string
          id: string
          lmp_id: string
          next_progress_date: string
          poc_email: string | null
          reminder_version: number
          sent_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          lmp_id: string
          next_progress_date: string
          poc_email?: string | null
          reminder_version?: number
          sent_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          lmp_id?: string
          next_progress_date?: string
          poc_email?: string | null
          reminder_version?: number
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lmp_progress_reminders_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_progress_reminders_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_progress_reminders_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      lmp_timeline: {
        Row: {
          actor: string | null
          created_at: string
          description: string
          event_type: string
          id: string
          lmp_id: string
          metadata: Json | null
        }
        Insert: {
          actor?: string | null
          created_at?: string
          description: string
          event_type?: string
          id?: string
          lmp_id: string
          metadata?: Json | null
        }
        Update: {
          actor?: string | null
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          lmp_id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lmp_timeline_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_timeline_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmp_timeline_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      mentors: {
        Row: {
          availability: string
          company: string | null
          company_experience: string[] | null
          created_at: string
          currency: string | null
          decision_tags: Json | null
          designation: string | null
          email: string | null
          enrichment: Json | null
          enrichment_updated_at: string | null
          functional_domain: string | null
          id: string
          industry: string | null
          layer: string | null
          linkedin: string | null
          mentor_code: string | null
          mentor_union: boolean | null
          mentorship_history: Json | null
          name: string
          outcome_pct: number | null
          overall_score: number | null
          past_experience: Json | null
          payment_type: string | null
          phone: string | null
          rate: number | null
          rating: number | null
          remuneration_inr: number | null
          reviews: number | null
          role: string | null
          score_company: number | null
          score_industry: number | null
          score_role: number | null
          score_seniority: number | null
          score_skills: number | null
          seniority: string | null
          skill_tags: string[] | null
          source: string
          sync_source: string | null
          updated_at: string
          years_of_experience: number | null
        }
        Insert: {
          availability?: string
          company?: string | null
          company_experience?: string[] | null
          created_at?: string
          currency?: string | null
          decision_tags?: Json | null
          designation?: string | null
          email?: string | null
          enrichment?: Json | null
          enrichment_updated_at?: string | null
          functional_domain?: string | null
          id?: string
          industry?: string | null
          layer?: string | null
          linkedin?: string | null
          mentor_code?: string | null
          mentor_union?: boolean | null
          mentorship_history?: Json | null
          name: string
          outcome_pct?: number | null
          overall_score?: number | null
          past_experience?: Json | null
          payment_type?: string | null
          phone?: string | null
          rate?: number | null
          rating?: number | null
          remuneration_inr?: number | null
          reviews?: number | null
          role?: string | null
          score_company?: number | null
          score_industry?: number | null
          score_role?: number | null
          score_seniority?: number | null
          score_skills?: number | null
          seniority?: string | null
          skill_tags?: string[] | null
          source?: string
          sync_source?: string | null
          updated_at?: string
          years_of_experience?: number | null
        }
        Update: {
          availability?: string
          company?: string | null
          company_experience?: string[] | null
          created_at?: string
          currency?: string | null
          decision_tags?: Json | null
          designation?: string | null
          email?: string | null
          enrichment?: Json | null
          enrichment_updated_at?: string | null
          functional_domain?: string | null
          id?: string
          industry?: string | null
          layer?: string | null
          linkedin?: string | null
          mentor_code?: string | null
          mentor_union?: boolean | null
          mentorship_history?: Json | null
          name?: string
          outcome_pct?: number | null
          overall_score?: number | null
          past_experience?: Json | null
          payment_type?: string | null
          phone?: string | null
          rate?: number | null
          rating?: number | null
          remuneration_inr?: number | null
          reviews?: number | null
          role?: string | null
          score_company?: number | null
          score_industry?: number | null
          score_role?: number | null
          score_seniority?: number | null
          score_skills?: number | null
          seniority?: string | null
          skill_tags?: string[] | null
          source?: string
          sync_source?: string | null
          updated_at?: string
          years_of_experience?: number | null
        }
        Relationships: []
      }
      poc_profiles: {
        Row: {
          access_level: string
          active_load: number
          aliases: string[] | null
          approved_user_id: string | null
          behavioral_pool_member: boolean | null
          closed_count: number
          color: string | null
          company_experience: string[] | null
          conversion_rate: number
          converted_count: number
          created_at: string
          cross_domain_count: number
          domain_tags: string[]
          dormant_count: number
          email: string | null
          historical_load: number
          id: string
          initials: string | null
          label: string | null
          last_activity_at: string | null
          last_assigned_at: string | null
          max_threshold: number | null
          mentor_coverage: number
          name: string
          offer_received_count: number
          on_hold_count: number
          ongoing_count: number
          poc_code: string | null
          prep_coverage: number
          primary_domain: string | null
          recruiter_ownership: string[] | null
          role_type: string
          skill_tags: string[] | null
          status: string
          updated_at: string
        }
        Insert: {
          access_level?: string
          active_load?: number
          aliases?: string[] | null
          approved_user_id?: string | null
          behavioral_pool_member?: boolean | null
          closed_count?: number
          color?: string | null
          company_experience?: string[] | null
          conversion_rate?: number
          converted_count?: number
          created_at?: string
          cross_domain_count?: number
          domain_tags?: string[]
          dormant_count?: number
          email?: string | null
          historical_load?: number
          id?: string
          initials?: string | null
          label?: string | null
          last_activity_at?: string | null
          last_assigned_at?: string | null
          max_threshold?: number | null
          mentor_coverage?: number
          name: string
          offer_received_count?: number
          on_hold_count?: number
          ongoing_count?: number
          poc_code?: string | null
          prep_coverage?: number
          primary_domain?: string | null
          recruiter_ownership?: string[] | null
          role_type?: string
          skill_tags?: string[] | null
          status?: string
          updated_at?: string
        }
        Update: {
          access_level?: string
          active_load?: number
          aliases?: string[] | null
          approved_user_id?: string | null
          behavioral_pool_member?: boolean | null
          closed_count?: number
          color?: string | null
          company_experience?: string[] | null
          conversion_rate?: number
          converted_count?: number
          created_at?: string
          cross_domain_count?: number
          domain_tags?: string[]
          dormant_count?: number
          email?: string | null
          historical_load?: number
          id?: string
          initials?: string | null
          label?: string | null
          last_activity_at?: string | null
          last_assigned_at?: string | null
          max_threshold?: number | null
          mentor_coverage?: number
          name?: string
          offer_received_count?: number
          on_hold_count?: number
          ongoing_count?: number
          poc_code?: string | null
          prep_coverage?: number
          primary_domain?: string | null
          recruiter_ownership?: string[] | null
          role_type?: string
          skill_tags?: string[] | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          access_status: string | null
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean | null
          last_login_at: string | null
          permissions: Json | null
          role: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          access_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          permissions?: Json | null
          role?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          access_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          permissions?: Json | null
          role?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      rag_embeddings: {
        Row: {
          chunk_index: number
          content: string
          embedded_at: string
          embedding: string | null
          id: string
          metadata: Json
          model: string
          source_id: string
          source_table: string
          source_updated_at: string | null
        }
        Insert: {
          chunk_index?: number
          content: string
          embedded_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          model?: string
          source_id: string
          source_table: string
          source_updated_at?: string | null
        }
        Update: {
          chunk_index?: number
          content?: string
          embedded_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          model?: string
          source_id?: string
          source_table?: string
          source_updated_at?: string | null
        }
        Relationships: []
      }
      session_student_feedbacks: {
        Row: {
          feedback: Json
          id: string
          mentor_rating: number | null
          session_id: string
          student_id: string
          student_rating: number | null
          submitted_at: string
        }
        Insert: {
          feedback: Json
          id?: string
          mentor_rating?: number | null
          session_id: string
          student_id: string
          student_rating?: number | null
          submitted_at?: string
        }
        Update: {
          feedback?: Json
          id?: string
          mentor_rating?: number | null
          session_id?: string
          student_id?: string
          student_rating?: number | null
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_student_feedbacks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_student_feedbacks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_student_feedbacks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students_with_load"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          candidate_ids: string[]
          completed_at: string | null
          created_at: string
          duration_min: number | null
          id: string
          lmp_id: string | null
          mentor_id: string | null
          mentor_rating: number | null
          notes: string | null
          poc_feedback: string | null
          poc_name: string | null
          recording_url: string | null
          scheduled_at: string | null
          session_type: string | null
          status: string
          student_feedback: Json | null
          student_feedback_token: string | null
          student_id: string | null
          student_rating: number | null
          sync_source: string | null
          updated_at: string
        }
        Insert: {
          candidate_ids?: string[]
          completed_at?: string | null
          created_at?: string
          duration_min?: number | null
          id?: string
          lmp_id?: string | null
          mentor_id?: string | null
          mentor_rating?: number | null
          notes?: string | null
          poc_feedback?: string | null
          poc_name?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          session_type?: string | null
          status?: string
          student_feedback?: Json | null
          student_feedback_token?: string | null
          student_id?: string | null
          student_rating?: number | null
          sync_source?: string | null
          updated_at?: string
        }
        Update: {
          candidate_ids?: string[]
          completed_at?: string | null
          created_at?: string
          duration_min?: number | null
          id?: string
          lmp_id?: string | null
          mentor_id?: string | null
          mentor_rating?: number | null
          notes?: string | null
          poc_feedback?: string | null
          poc_name?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          session_type?: string | null
          status?: string
          student_feedback?: Json | null
          student_feedback_token?: string | null
          student_id?: string | null
          student_rating?: number | null
          sync_source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_full_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_lmp_id_fkey"
            columns: ["lmp_id"]
            isOneToOne: false
            referencedRelation: "lmp_processes_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "mentors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "mentors_union_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students_with_load"
            referencedColumns: ["id"]
          },
        ]
      }
      sheet_sync_events: {
        Row: {
          created_at: string
          direction: string
          error_message: string | null
          field_count: number
          fields_synced: Json | null
          id: string
          operation: string
          record_id: string | null
          status: string
          synced_by: string | null
          tab_name: string
        }
        Insert: {
          created_at?: string
          direction?: string
          error_message?: string | null
          field_count?: number
          fields_synced?: Json | null
          id?: string
          operation?: string
          record_id?: string | null
          status?: string
          synced_by?: string | null
          tab_name: string
        }
        Update: {
          created_at?: string
          direction?: string
          error_message?: string | null
          field_count?: number
          fields_synced?: Json | null
          id?: string
          operation?: string
          record_id?: string | null
          status?: string
          synced_by?: string | null
          tab_name?: string
        }
        Relationships: []
      }
      sheet_write_queue: {
        Row: {
          attempts: number
          created_at: string
          enqueued_by: string | null
          id: string
          last_error: string | null
          next_retry_at: string
          operation: string
          payload: Json
          status: string
          tab_name: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          enqueued_by?: string | null
          id?: string
          last_error?: string | null
          next_retry_at?: string
          operation: string
          payload: Json
          status?: string
          tab_name: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          enqueued_by?: string | null
          id?: string
          last_error?: string | null
          next_retry_at?: string
          operation?: string
          payload?: Json
          status?: string
          tab_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      sheets_sync_log: {
        Row: {
          last_status: string
          last_synced_at: string
          rate_limited_until: string | null
          row_count: number
          tab_name: string
          updated_at: string
        }
        Insert: {
          last_status?: string
          last_synced_at?: string
          rate_limited_until?: string | null
          row_count?: number
          tab_name: string
          updated_at?: string
        }
        Update: {
          last_status?: string
          last_synced_at?: string
          rate_limited_until?: string | null
          row_count?: number
          tab_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          active_lmp_count: number
          actual_domain: string | null
          beh_resume: number | null
          behavioral: number | null
          cohort: string | null
          composite_primary: number | null
          composite_secondary: number | null
          created_at: string
          email: string | null
          id: string
          internship: string | null
          interview_risk_flag: string | null
          iv_attempts: number | null
          keywords: string | null
          live_project: string | null
          lmp_count: number
          mentor_primary: string | null
          mentor_secondary: string | null
          mock_score: number | null
          name: string
          other_domains: string | null
          phone: string | null
          placement_status: string | null
          portfolio: number | null
          practicum: number | null
          primary_domain: string | null
          resume_score: number | null
          roll_no: string | null
          secondary_domain: string | null
          student_code: string | null
          sync_source: string | null
          updated_at: string
          video_cv: number | null
        }
        Insert: {
          active_lmp_count?: number
          actual_domain?: string | null
          beh_resume?: number | null
          behavioral?: number | null
          cohort?: string | null
          composite_primary?: number | null
          composite_secondary?: number | null
          created_at?: string
          email?: string | null
          id?: string
          internship?: string | null
          interview_risk_flag?: string | null
          iv_attempts?: number | null
          keywords?: string | null
          live_project?: string | null
          lmp_count?: number
          mentor_primary?: string | null
          mentor_secondary?: string | null
          mock_score?: number | null
          name: string
          other_domains?: string | null
          phone?: string | null
          placement_status?: string | null
          portfolio?: number | null
          practicum?: number | null
          primary_domain?: string | null
          resume_score?: number | null
          roll_no?: string | null
          secondary_domain?: string | null
          student_code?: string | null
          sync_source?: string | null
          updated_at?: string
          video_cv?: number | null
        }
        Update: {
          active_lmp_count?: number
          actual_domain?: string | null
          beh_resume?: number | null
          behavioral?: number | null
          cohort?: string | null
          composite_primary?: number | null
          composite_secondary?: number | null
          created_at?: string
          email?: string | null
          id?: string
          internship?: string | null
          interview_risk_flag?: string | null
          iv_attempts?: number | null
          keywords?: string | null
          live_project?: string | null
          lmp_count?: number
          mentor_primary?: string | null
          mentor_secondary?: string | null
          mock_score?: number | null
          name?: string
          other_domains?: string | null
          phone?: string | null
          placement_status?: string | null
          portfolio?: number | null
          practicum?: number | null
          primary_domain?: string | null
          resume_score?: number | null
          roll_no?: string | null
          secondary_domain?: string | null
          student_code?: string | null
          sync_source?: string | null
          updated_at?: string
          video_cv?: number | null
        }
        Relationships: []
      }
      sync_conflicts: {
        Row: {
          detected_at: string
          field_name: string
          id: string
          record_id: string | null
          record_key: Json
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          sheet_row_number: number | null
          sheet_tab: string
          sheet_value: string | null
          status: string
          system_value: string | null
          table_name: string
        }
        Insert: {
          detected_at?: string
          field_name: string
          id?: string
          record_id?: string | null
          record_key?: Json
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sheet_row_number?: number | null
          sheet_tab: string
          sheet_value?: string | null
          status?: string
          system_value?: string | null
          table_name: string
        }
        Update: {
          detected_at?: string
          field_name?: string
          id?: string
          record_id?: string | null
          record_key?: Json
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sheet_row_number?: number | null
          sheet_tab?: string
          sheet_value?: string | null
          status?: string
          system_value?: string | null
          table_name?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      unmapped_items: {
        Row: {
          created_at: string
          id: string
          item_type: string
          raw_value: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          resolved_to: string | null
          source_field: string | null
          source_record_id: string | null
          source_tab: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_type: string
          raw_value: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_to?: string | null
          source_field?: string | null
          source_record_id?: string | null
          source_tab?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_type?: string
          raw_value?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_to?: string | null
          source_field?: string | null
          source_record_id?: string | null
          source_tab?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      copilot_daily_usage: {
        Row: {
          chars_used: number | null
          requests_used: number | null
          tokens_used: number | null
          usage_date: string | null
          user_id: string | null
        }
        Relationships: []
      }
      lmp_full_view: {
        Row: {
          checklist_assignment_review: boolean | null
          checklist_mentor_aligned: boolean | null
          checklist_one_to_one_mock: boolean | null
          checklist_prep_doc_shared: boolean | null
          closing_date: string | null
          comments: string | null
          company: string | null
          convert_names: string | null
          created_at: string | null
          created_date: string | null
          daily_log_count: number | null
          domain_id: string | null
          domain_raw: string | null
          feedback_by_outreach: string | null
          final_convert: string | null
          id: string | null
          jd_label: string | null
          jd_url: string | null
          latest_daily_progress: string | null
          lmp_code: string | null
          mentor_feedback_avg: number | null
          mentor_name: string | null
          mentor_selected: string | null
          next_progress_date: string | null
          next_progress_type: string | null
          offer_count: number | null
          outreach_poc_names: string | null
          prep_doc: string | null
          prep_poc_names: string | null
          r1_count: number | null
          r1_shortlisted: string | null
          r2_count: number | null
          r2_shortlisted: string | null
          r3_count: number | null
          r3_shortlisted: string | null
          role: string | null
          status: string | null
          support_poc_names: string | null
          sync_source: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          checklist_assignment_review?: never
          checklist_mentor_aligned?: never
          checklist_one_to_one_mock?: never
          checklist_prep_doc_shared?: never
          closing_date?: string | null
          comments?: string | null
          company?: string | null
          convert_names?: string | null
          created_at?: string | null
          created_date?: string | null
          daily_log_count?: never
          domain_id?: string | null
          domain_raw?: string | null
          feedback_by_outreach?: string | null
          final_convert?: string | null
          id?: string | null
          jd_label?: string | null
          jd_url?: string | null
          latest_daily_progress?: never
          lmp_code?: string | null
          mentor_feedback_avg?: never
          mentor_name?: never
          mentor_selected?: string | null
          next_progress_date?: string | null
          next_progress_type?: string | null
          offer_count?: never
          outreach_poc_names?: never
          prep_doc?: string | null
          prep_poc_names?: never
          r1_count?: never
          r1_shortlisted?: string | null
          r2_count?: never
          r2_shortlisted?: string | null
          r3_count?: never
          r3_shortlisted?: string | null
          role?: string | null
          status?: string | null
          support_poc_names?: never
          sync_source?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          checklist_assignment_review?: never
          checklist_mentor_aligned?: never
          checklist_one_to_one_mock?: never
          checklist_prep_doc_shared?: never
          closing_date?: string | null
          comments?: string | null
          company?: string | null
          convert_names?: string | null
          created_at?: string | null
          created_date?: string | null
          daily_log_count?: never
          domain_id?: string | null
          domain_raw?: string | null
          feedback_by_outreach?: string | null
          final_convert?: string | null
          id?: string | null
          jd_label?: string | null
          jd_url?: string | null
          latest_daily_progress?: never
          lmp_code?: string | null
          mentor_feedback_avg?: never
          mentor_name?: never
          mentor_selected?: string | null
          next_progress_date?: string | null
          next_progress_type?: string | null
          offer_count?: never
          outreach_poc_names?: never
          prep_doc?: string | null
          prep_poc_names?: never
          r1_count?: never
          r1_shortlisted?: string | null
          r2_count?: never
          r2_shortlisted?: string | null
          r3_count?: never
          r3_shortlisted?: string | null
          role?: string | null
          status?: string | null
          support_poc_names?: never
          sync_source?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lmp_processes_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
      lmp_processes_overview: {
        Row: {
          admin_owner: string | null
          allocation_path: string | null
          allocation_reason: string | null
          allocator: string | null
          assignment_review: boolean | null
          behavioral_status: string | null
          candidate_count: number | null
          closing_date: string | null
          company: string | null
          convert_names: string | null
          created_at: string | null
          daily_progress: string | null
          date: string | null
          domain_id: string | null
          domain_name: string | null
          domain_raw: string | null
          final_convert: string | null
          id: string | null
          last_progress_updated_at: string | null
          lmp_code: string | null
          match_tag: string | null
          mentor_aligned: boolean | null
          mentor_count: number | null
          next_progress_date: string | null
          next_progress_reminder_type: string | null
          next_progress_status: string | null
          one_to_one_mock: boolean | null
          outreach_poc: string | null
          outreach_poc_ids: string[] | null
          outreach_poc_names: string[] | null
          placement_progress: string | null
          prep_doc: string | null
          prep_doc_shared: boolean | null
          prep_poc: string | null
          prep_poc_id: string | null
          prep_poc_name: string | null
          prep_progress: string | null
          r1_shortlisted: string | null
          r2_shortlisted: string | null
          r3_shortlisted: string | null
          remarks: string | null
          reminder_version: number | null
          role: string | null
          score_breakdown: Json | null
          sheet_row_id: string | null
          status: string | null
          support_poc: string | null
          support_poc_id: string | null
          support_poc_name: string | null
          sync_source: string | null
          type: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lmp_processes_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
      mentors_union_view: {
        Row: {
          availability: string | null
          company: string | null
          company_experience: string[] | null
          created_at: string | null
          currency: string | null
          decision_tags: Json | null
          designation: string | null
          email: string | null
          functional_domain: string | null
          id: string | null
          industry: string | null
          is_alumni_mirror: boolean | null
          layer: string | null
          linkedin: string | null
          mentor_code: string | null
          mentor_union: boolean | null
          mentorship_history: Json | null
          name: string | null
          outcome_pct: number | null
          overall_score: number | null
          past_experience: Json | null
          payment_type: string | null
          phone: string | null
          rate: number | null
          rating: number | null
          remuneration_inr: number | null
          reviews: number | null
          role: string | null
          score_company: number | null
          score_industry: number | null
          score_role: number | null
          score_seniority: number | null
          score_skills: number | null
          seniority: string | null
          skill_tags: string[] | null
          source: string | null
          source_label: string | null
          sync_source: string | null
          updated_at: string | null
          years_of_experience: number | null
        }
        Insert: {
          availability?: string | null
          company?: string | null
          company_experience?: string[] | null
          created_at?: string | null
          currency?: string | null
          decision_tags?: Json | null
          designation?: string | null
          email?: string | null
          functional_domain?: string | null
          id?: string | null
          industry?: string | null
          is_alumni_mirror?: never
          layer?: string | null
          linkedin?: string | null
          mentor_code?: string | null
          mentor_union?: boolean | null
          mentorship_history?: Json | null
          name?: string | null
          outcome_pct?: number | null
          overall_score?: number | null
          past_experience?: Json | null
          payment_type?: string | null
          phone?: string | null
          rate?: number | null
          rating?: number | null
          remuneration_inr?: number | null
          reviews?: number | null
          role?: string | null
          score_company?: number | null
          score_industry?: number | null
          score_role?: number | null
          score_seniority?: number | null
          score_skills?: number | null
          seniority?: string | null
          skill_tags?: string[] | null
          source?: string | null
          source_label?: never
          sync_source?: string | null
          updated_at?: string | null
          years_of_experience?: number | null
        }
        Update: {
          availability?: string | null
          company?: string | null
          company_experience?: string[] | null
          created_at?: string | null
          currency?: string | null
          decision_tags?: Json | null
          designation?: string | null
          email?: string | null
          functional_domain?: string | null
          id?: string | null
          industry?: string | null
          is_alumni_mirror?: never
          layer?: string | null
          linkedin?: string | null
          mentor_code?: string | null
          mentor_union?: boolean | null
          mentorship_history?: Json | null
          name?: string | null
          outcome_pct?: number | null
          overall_score?: number | null
          past_experience?: Json | null
          payment_type?: string | null
          phone?: string | null
          rate?: number | null
          rating?: number | null
          remuneration_inr?: number | null
          reviews?: number | null
          role?: string | null
          score_company?: number | null
          score_industry?: number | null
          score_role?: number | null
          score_seniority?: number | null
          score_skills?: number | null
          seniority?: string | null
          skill_tags?: string[] | null
          source?: string | null
          source_label?: never
          sync_source?: string | null
          updated_at?: string | null
          years_of_experience?: number | null
        }
        Relationships: []
      }
      poc_profiles_public: {
        Row: {
          access_level: string | null
          active_load: number | null
          aliases: string[] | null
          behavioral_pool_member: boolean | null
          closed_count: number | null
          color: string | null
          company_experience: string[] | null
          conversion_rate: number | null
          converted_count: number | null
          created_at: string | null
          cross_domain_count: number | null
          domain_tags: string[] | null
          dormant_count: number | null
          historical_load: number | null
          id: string | null
          initials: string | null
          label: string | null
          last_activity_at: string | null
          last_assigned_at: string | null
          max_threshold: number | null
          mentor_coverage: number | null
          name: string | null
          offer_received_count: number | null
          on_hold_count: number | null
          ongoing_count: number | null
          poc_code: string | null
          prep_coverage: number | null
          primary_domain: string | null
          recruiter_ownership: string[] | null
          role_type: string | null
          skill_tags: string[] | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          access_level?: string | null
          active_load?: number | null
          aliases?: string[] | null
          behavioral_pool_member?: boolean | null
          closed_count?: number | null
          color?: string | null
          company_experience?: string[] | null
          conversion_rate?: number | null
          converted_count?: number | null
          created_at?: string | null
          cross_domain_count?: number | null
          domain_tags?: string[] | null
          dormant_count?: number | null
          historical_load?: number | null
          id?: string | null
          initials?: string | null
          label?: string | null
          last_activity_at?: string | null
          last_assigned_at?: string | null
          max_threshold?: number | null
          mentor_coverage?: number | null
          name?: string | null
          offer_received_count?: number | null
          on_hold_count?: number | null
          ongoing_count?: number | null
          poc_code?: string | null
          prep_coverage?: number | null
          primary_domain?: string | null
          recruiter_ownership?: string[] | null
          role_type?: string | null
          skill_tags?: string[] | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          access_level?: string | null
          active_load?: number | null
          aliases?: string[] | null
          behavioral_pool_member?: boolean | null
          closed_count?: number | null
          color?: string | null
          company_experience?: string[] | null
          conversion_rate?: number | null
          converted_count?: number | null
          created_at?: string | null
          cross_domain_count?: number | null
          domain_tags?: string[] | null
          dormant_count?: number | null
          historical_load?: number | null
          id?: string | null
          initials?: string | null
          label?: string | null
          last_activity_at?: string | null
          last_assigned_at?: string | null
          max_threshold?: number | null
          mentor_coverage?: number | null
          name?: string | null
          offer_received_count?: number | null
          on_hold_count?: number | null
          ongoing_count?: number | null
          poc_code?: string | null
          prep_coverage?: number | null
          primary_domain?: string | null
          recruiter_ownership?: string[] | null
          role_type?: string | null
          skill_tags?: string[] | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      poc_profiles_with_load: {
        Row: {
          access_level: string | null
          active_load: number | null
          aliases: string[] | null
          approved_user_id: string | null
          behavioral_pool_member: boolean | null
          closed_count: number | null
          color: string | null
          company_experience: string[] | null
          conversion_rate: number | null
          converted_count: number | null
          created_at: string | null
          cross_domain_count: number | null
          domain_tags: string[] | null
          dormant_count: number | null
          email: string | null
          historical_load: number | null
          id: string | null
          initials: string | null
          label: string | null
          last_activity_at: string | null
          last_assigned_at: string | null
          live_active_lmp_count: number | null
          live_outreach_active: number | null
          live_prep_active: number | null
          live_support_active: number | null
          max_threshold: number | null
          mentor_coverage: number | null
          name: string | null
          offer_received_count: number | null
          on_hold_count: number | null
          ongoing_count: number | null
          poc_code: string | null
          prep_coverage: number | null
          primary_domain: string | null
          recruiter_ownership: string[] | null
          role_type: string | null
          skill_tags: string[] | null
          status: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      students_with_load: {
        Row: {
          active_lmp_count: number | null
          actual_domain: string | null
          beh_resume: number | null
          behavioral: number | null
          cohort: string | null
          composite_primary: number | null
          composite_secondary: number | null
          converted_count: number | null
          created_at: string | null
          email: string | null
          id: string | null
          internship: string | null
          interview_risk_flag: string | null
          iv_attempts: number | null
          keywords: string | null
          last_activity_at: string | null
          live_project: string | null
          mentor_primary: string | null
          mentor_secondary: string | null
          mock_score: number | null
          name: string | null
          other_domains: string | null
          phone: string | null
          placement_status: string | null
          portfolio: number | null
          practicum: number | null
          primary_domain: string | null
          resume_score: number | null
          roll_no: string | null
          secondary_domain: string | null
          student_code: string | null
          sync_source: string | null
          total_lmp_count: number | null
          updated_at: string | null
          video_cv: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _log_timeline: {
        Args: {
          p_desc: string
          p_event: string
          p_lmp_id: string
          p_meta?: Json
        }
        Returns: undefined
      }
      canonicalize_domain: { Args: { _raw: string }; Returns: string }
      cleanup_expired_copilot_threads: { Args: never; Returns: Json }
      current_actor_name: { Args: never; Returns: string }
      current_poc_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_lmp_status: { Args: { _status: string }; Returns: boolean }
      lmp_comments_to_text: { Args: { p_lmp_id: string }; Returns: string }
      post_lmp_comment: {
        Args: {
          _author_color: string
          _author_initials: string
          _author_name: string
          _body: string
          _lmp_id: string
        }
        Returns: string
      }
      rag_search: {
        Args: {
          filter_tables?: string[]
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          metadata: Json
          similarity: number
          source_id: string
          source_table: string
        }[]
      }
      recompute_domain_counts: {
        Args: { _domain_id: string }
        Returns: undefined
      }
      recompute_lmp_convert: { Args: { _lmp_id: string }; Returns: undefined }
      recompute_mentor_feedback: {
        Args: { _mentor_id: string }
        Returns: undefined
      }
      recompute_poc_load: { Args: { _poc_id: string }; Returns: undefined }
      recompute_student_lmp_counts: {
        Args: { _student_id: string }
        Returns: undefined
      }
      refresh_alumni_mentor_mirror: { Args: never; Returns: undefined }
      refresh_data_source_status: {
        Args: { _source: string }
        Returns: undefined
      }
      resolve_lmp_poc_links: { Args: { _lmp_id: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "moderator" | "poc" | "allocator"
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
      app_role: ["admin", "moderator", "poc", "allocator"],
    },
  },
} as const
