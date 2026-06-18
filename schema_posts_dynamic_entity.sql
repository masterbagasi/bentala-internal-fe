-- ============================================================
-- POSTS: dynamic socmed-project entity
-- ============================================================
-- Before dynamic socmed projects, `posts.entity` was locked to a static
-- CHECK (entity in ('bpi','bsi')). Once projects became data (socmed_projects),
-- the Projects board inserts a post with entity = <project slug> (e.g.
-- 'master-bagasi'). The old CHECK rejected every such insert, so "Tambah Post"
-- silently failed on any dynamically-added project — no row, no error shown.
--
-- Replace the static CHECK with a foreign key to socmed_projects(slug): any
-- current or future project is valid automatically, while the entity is still
-- guaranteed to reference a real project.
--
-- Safe to re-run.

alter table public.posts drop constraint if exists posts_entity_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'posts_entity_fkey'
  ) then
    alter table public.posts
      add constraint posts_entity_fkey
      foreign key (entity) references public.socmed_projects(slug)
      on update cascade on delete restrict;
  end if;
end $$;
