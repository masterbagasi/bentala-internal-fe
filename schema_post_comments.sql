-- Per-post comment room (the "Comments" thread on a post). The activity feed is
-- derived client-side from the post's own fields (created / attached / completed),
-- so only user comments are stored here.

CREATE TABLE IF NOT EXISTS public.post_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  -- 'comment' = a user comment; 'activity' = a logged post change (status/field edits)
  type         text NOT NULL DEFAULT 'comment',
  author_email text,
  author_name  text,
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_comments_post_id_idx
  ON public.post_comments (post_id, created_at);

-- Realtime: stream inserts so comments/activity appear without a reload.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read the thread and post a comment as themselves;
-- a comment can only be deleted by its author. The WITH CHECK ties the stored
-- author_email to the caller's identity so nobody can comment as someone else.
DROP POLICY IF EXISTS post_comments_read ON public.post_comments;
CREATE POLICY post_comments_read
  ON public.post_comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS post_comments_insert ON public.post_comments;
CREATE POLICY post_comments_insert
  ON public.post_comments FOR INSERT TO authenticated
  WITH CHECK (lower(author_email) = lower(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS post_comments_delete_own ON public.post_comments;
CREATE POLICY post_comments_delete_own
  ON public.post_comments FOR DELETE TO authenticated
  USING (lower(author_email) = lower(auth.jwt() ->> 'email'));
