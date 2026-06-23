create table if not exists public.sales_targets (
  id            uuid primary key default gen_random_uuid(),
  internal      text not null,
  month         date not null,
  target_amount numeric not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (internal, month)
);
alter table public.sales_targets enable row level security;
create policy "sales_targets auth read"   on public.sales_targets for select using (auth.role() = 'authenticated');
create policy "sales_targets auth insert" on public.sales_targets for insert with check (auth.role() = 'authenticated');
create policy "sales_targets auth update" on public.sales_targets for update using (auth.role() = 'authenticated');
create policy "sales_targets auth delete" on public.sales_targets for delete using (auth.role() = 'authenticated');
alter publication supabase_realtime add table public.sales_targets;
