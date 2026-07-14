-- ============================================================
-- M5 — Auto-create a "prospect" deal from a WEBSITE contact
-- When a contact whose source = 'WEBSITE' is inserted (e.g. from the website
-- lead form), automatically open a Deal at the initial 'prospect' stage linked
-- to it, so it lands in the pipeline with no manual step. Mirrors the existing
-- create_from_deal_won() auto-create pattern (M1).
--
-- Scope note: this fires whenever a WEBSITE-sourced contact row is created.
-- The website form → contacts intake itself is a separate piece (today the
-- public form lands in `bsi_leads`); once that intake writes a contact with
-- source='WEBSITE', this trigger completes the form → contact → prospect chain.
-- ============================================================

create or replace function public.create_prospect_from_website_contact()
returns trigger language plpgsql security definer as $function$
begin
  -- Only website-sourced contacts, and only when the contact has no deal yet
  -- (guards against duplicates from any re-import / re-insert path).
  if NEW.source = 'WEBSITE'
     and not exists (select 1 from public.deals where contact_id = NEW.id) then
    insert into public.deals (name, contact_id, services, value, stage, owner_email, source, description)
    values (
      coalesce(nullif(btrim(NEW.name), ''), 'Website Lead') || ' — Website Lead',
      NEW.id,
      '{}'::text[],          -- services filled in later when qualifying
      0,                     -- value unknown at intake
      'prospect',            -- initial pipeline stage (matches deals.stage default)
      NEW.owner_email,       -- inherit the contact's owner, if any
      'WEBSITE',
      'Prospek otomatis dibuat dari contact form website.'
    );
  end if;
  return NEW;
end
$function$;

drop trigger if exists trg_prospect_from_website_contact on public.contacts;
create trigger trg_prospect_from_website_contact
after insert on public.contacts
for each row execute function public.create_prospect_from_website_contact();
