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
