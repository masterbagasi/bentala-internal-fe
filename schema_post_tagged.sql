-- Post metadata additions (applied to Supabase 2026-06-04 via MCP migrations).
-- 1) Tagged team members (for @mentions + notifications).
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS tagged text[] NOT NULL DEFAULT '{}';
-- 2) Creator (name of the user who created the post).
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT '';
-- 3) Content aspect ratio(s), comma-separated (e.g. '1:1, 9:16').
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS ratio text NOT NULL DEFAULT '';
-- 4) Uploaded attachment URLs (any file type).
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS files text[] NOT NULL DEFAULT '{}';

-- 5) Content brief / instructions.
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS brief text NOT NULL DEFAULT '';

-- Storage: allow ALL file types in the upload bucket (was image/video only).
UPDATE storage.buckets SET allowed_mime_types = NULL WHERE id = 'bsi-website';
