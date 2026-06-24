-- CRM pipeline → full 9-stage B2B funnel.
-- Drop the old stage CHECK, remap existing rows, re-add the CHECK with new values.
alter table public.clients drop constraint if exists clients_stage_check;

update public.clients set stage = 'prospect'   where stage = 'lead';
update public.clients set stage = 'proposal'   where stage = 'pitch';
update public.clients set stage = 'won'        where stage = 'close';
update public.clients set stage = 'client'     where stage = 'invoice';
update public.clients set stage = 'lost'       where stage = 'inactive';

alter table public.clients add constraint clients_stage_check
  check (stage in ('prospect','contacted','qualified','discovery','proposal','negotiation','won','lost','client'));
