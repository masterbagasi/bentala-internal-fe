-- Enable Supabase Realtime for the core operational tables so the dashboard
-- (boards, lists, status, worksheet) updates live without a page reload.
-- useRealtime() already subscribes to these; they just weren't published.

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.file_attachments;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Social: connected-account state must stream live (accounts list, connection
-- status, and the logged-in gate) so the Social views update without a manual
-- refresh. social_accounts is already published. Brand-filtered DELETE/UPDATE
-- events need REPLICA IDENTITY FULL so the old row carries `brand` for the
-- server-side filter (disconnect/remove DELETE the rows). See useBrandRealtime.
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.social_connections;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.social_connections REPLICA IDENTITY FULL;
ALTER TABLE public.social_accounts   REPLICA IDENTITY FULL;
