// Auto-generated types from Supabase schema
// Re-generate with: npx supabase gen types typescript --project-id [PROJECT_ID]

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

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
          hashtags: string
          content_types: string[]
          video_link: string
          design_link: string
          video_file_url: string
          design_file_url: string
          notes: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['posts']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['posts']['Insert']>
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
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['clients']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
      }
      invoices: {
        Row: {
          id: string
          num: string
          client: string
          project: string
          value: number
          due: string | null
          status: string
          notes: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['invoices']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>
      }
      projects: {
        Row: {
          id: string
          name: string
          client: string
          type: string
          deadline: string | null
          status: string
          team: string[]
          description: string
          progress: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['projects']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['projects']['Insert']>
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
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
