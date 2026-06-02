-- ============================================================
-- Supabase Storage — Bucket for website assets (hero, portfolio, etc)
-- Run this in Supabase SQL Editor.
-- ============================================================

-- Create the bucket (public read, authenticated write)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bsi-website',
  'bsi-website',
  true,
  209715200,                                    -- 200 MB
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Drop existing policies (idempotent — safe to re-run)
drop policy if exists "bsi-website public read"   on storage.objects;
drop policy if exists "bsi-website auth insert"   on storage.objects;
drop policy if exists "bsi-website auth update"   on storage.objects;
drop policy if exists "bsi-website auth delete"   on storage.objects;

-- Public read so the website can display uploaded files via their public URL.
create policy "bsi-website public read"
  on storage.objects for select
  using (bucket_id = 'bsi-website');

-- Only authenticated users (admins) may upload, update, delete.
create policy "bsi-website auth insert"
  on storage.objects for insert
  with check (bucket_id = 'bsi-website' and auth.role() = 'authenticated');

create policy "bsi-website auth update"
  on storage.objects for update
  using (bucket_id = 'bsi-website' and auth.role() = 'authenticated');

create policy "bsi-website auth delete"
  on storage.objects for delete
  using (bucket_id = 'bsi-website' and auth.role() = 'authenticated');
