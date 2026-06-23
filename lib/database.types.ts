// Auto-generated types from Supabase schema
// Re-generate with: npx supabase gen types typescript --project-id [PROJECT_ID]

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Fallback shape for tables not yet explicitly declared below (e.g. the
// website `bsi_*` tables). Keeps their queries loosely typed instead of
// resolving to `never`. Explicitly declared tables below keep strict typing.
type GenericTable = {
  // `any` (not Record<string, any>) so query results are also assignable to
  // the concrete app interfaces these pages keep their state in.
  Row: any
  Insert: any
  Update: any
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      posts: {
        Row: {
          id: string
          entity: string
          title: string
          platforms: string[]
          date: string | null
          status: string
          pics: string[]
          caption: string
          headline: string
          brief: string
          video_status: string
          design_status: string
          hashtags: string
          content_types: string[]
          video_link: string
          design_link: string
          video_file_url: string
          design_file_url: string
          notes: string
          tagged: string[]
          created_by: string
          ratio: string
          files: string[]
          created_at: string
          updated_at: string
        }
        // Only entity + title are required at insert; every other column has a
        // DB default (see schema.sql), so they're optional here.
        Insert: Pick<Database['public']['Tables']['posts']['Row'], 'entity' | 'title'>
          & Partial<Omit<Database['public']['Tables']['posts']['Row'], 'entity' | 'title'>>
        Update: Partial<Database['public']['Tables']['posts']['Insert']>
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          name: string
          pic: string
          contact: string
          stage: string
          value: number
          service: string
          internal: string
          notes: string
          source: string
          lead_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['clients']['Row'], 'id' | 'created_at' | 'updated_at' | 'source' | 'lead_id'> & {
          id?: string
          created_at?: string
          updated_at?: string
          source?: string
          lead_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
        Relationships: []
      }
      client_interactions: {
        Row: {
          id: string
          client_id: string
          type: string
          summary: string
          occurred_at: string
          next_follow_up: string | null
          follow_up_done: boolean
          files: string[]
          author_email: string | null
          author_name: string | null
          created_at: string
        }
        // Only client_id is required at insert; every other column has a DB
        // default (see schema_crm_interactions.sql), so they're optional here.
        Insert: Pick<Database['public']['Tables']['client_interactions']['Row'], 'client_id'>
          & Partial<Omit<Database['public']['Tables']['client_interactions']['Row'], 'client_id'>>
        Update: Partial<Database['public']['Tables']['client_interactions']['Insert']>
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          num: string
          client: string
          project: string
          client_id: string | null
          value: number
          due: string | null
          status: string
          notes: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['invoices']['Row'], 'id' | 'created_at' | 'updated_at' | 'client_id'> & {
          id?: string
          created_at?: string
          updated_at?: string
          client_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          name: string
          client: string
          client_id: string | null
          type: string
          deadline: string | null
          status: string
          team: string[]
          description: string
          progress: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['projects']['Row'], 'id' | 'created_at' | 'updated_at' | 'client_id'> & {
          id?: string
          created_at?: string
          updated_at?: string
          client_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['projects']['Insert']>
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          title: string
          project_id: string | null
          assignee: string
          priority: string
          status: string
          due: string | null
          notes: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['tasks']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>
        Relationships: []
      }
      activity_log: {
        Row: {
          id: string
          message: string
          user_name: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['activity_log']['Row'], 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['activity_log']['Insert']>
        Relationships: []
      }
      file_attachments: {
        Row: {
          id: string
          post_id: string
          category: string
          file_name: string
          file_size: number
          file_type: string
          storage_path: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['file_attachments']['Row'], 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['file_attachments']['Insert']>
        Relationships: []
      }
      pipeline_items: {
        Row: {
          id: string
          title: string
          member: string
          source_post_id: string | null
          current_stage: string
          stages_data: Json
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['pipeline_items']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['pipeline_items']['Insert']>
        Relationships: []
      }
      ai_generations: {
        Row: {
          id: string
          idea_id: string | null
          input_text: string
          platform: string
          caption: string
          hashtags: string
          script: string
          posting_time: string
          exported_to: string | null
          exported_post_id: string | null
          user_name: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['ai_generations']['Row'], 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['ai_generations']['Insert']>
        Relationships: []
      }
      news_cache: {
        Row: {
          id: string
          source: string
          source_type: string
          title: string
          summary: string
          url: string
          published_at: string | null
          fetched_at: string
          relevance_score: number | null
        }
        Insert: Omit<Database['public']['Tables']['news_cache']['Row'], 'id' | 'fetched_at'> & {
          id?: string
          fetched_at?: string
        }
        Update: Partial<Database['public']['Tables']['news_cache']['Insert']>
        Relationships: []
      }
      // Website (`bsi_*`) and other tables that aren't yet strictly typed.
      // They use the permissive GenericTable shape so queries resolve to a
      // loose Row instead of `never`. Replace with concrete types as needed.
      bsi_about: GenericTable
      bsi_abroad_production: GenericTable
      bsi_abroad_services: GenericTable
      bsi_abroad_settings: GenericTable
      bsi_collaborations: GenericTable
      bsi_events: GenericTable
      bsi_hero: GenericTable
      bsi_leads: GenericTable
      bsi_news_feed: GenericTable
      bsi_pageviews: GenericTable
      bsi_portfolio: GenericTable
      bsi_seo: GenericTable
      bsi_services: GenericTable
      bsi_sessions: GenericTable
      bsi_social_links: GenericTable
      bsi_team: GenericTable
      bsi_team_gallery: GenericTable
      bsi_visitors: GenericTable
      ai_settings: GenericTable
      avatars: GenericTable
      content_pipeline: GenericTable
      feature_settings: GenericTable
      production_briefs: GenericTable
      // Socmed Instagram live connect + read (Composio).
      social_connections: GenericTable
      ig_account_insights: GenericTable
      ig_media: GenericTable
      ig_media_insights: GenericTable
      ig_demographics: GenericTable
      ig_sync_state: GenericTable
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
