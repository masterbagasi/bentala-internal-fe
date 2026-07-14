-- ============================================================
-- M6 — Auto-intake: website form submission -> CRM contact (-> prospect)
-- The PUBLIC Bentala website writes form submissions straight into
-- `bsi_leads` (origin='website') from OUTSIDE this app, so nothing in the
-- app code can intercept them. This trigger mirrors every new website lead
-- into the CRM `contacts` table (source='WEBSITE'); the M5 trigger on
-- contacts then opens a 'prospect' deal — so a new form fill lands in the
-- pipeline with zero manual steps.
--
-- Requires M5 (create_prospect_from_website_contact) to also be applied.
-- ============================================================

create or replace function public.create_contact_from_website_lead()
returns trigger language plpgsql security definer as $function$
declare
  v_email text := case when NEW.contact_type = 'email'    then btrim(coalesce(NEW.contact_value, '')) else '' end;
  v_phone text := case when NEW.contact_type = 'whatsapp' then btrim(coalesce(NEW.contact_value, '')) else '' end;
  v_brand text := btrim(coalesce(NEW.brand_name, ''));
  v_notes text := nullif(btrim(concat_ws(' · ',
                    nullif(btrim(coalesce(NEW.project_type, '')), ''),
                    nullif(btrim(coalesce(NEW.notes, '')), ''))), '');
begin
  -- Only real public website submissions (not the manually-added leads), not
  -- spam, not soft-deleted. Skip if a contact with this email/phone already
  -- exists (dedup -> no duplicate prospect).
  if coalesce(NEW.origin, '') = 'website'
     and coalesce(NEW.status, '') <> 'spam'
     and NEW.deleted_at is null
     and not exists (
       select 1 from public.contacts c
       where (v_email <> '' and c.email = v_email)
          or (v_phone <> '' and c.phone = v_phone)
     ) then
    insert into public.contacts (name, type, company_name, category, job_title, email, phone, source, notes)
    values (
      coalesce(nullif(btrim(NEW.full_name), ''), nullif(v_brand, ''), 'Website Lead'),
      case when v_brand <> '' then 'PERUSAHAAN' else 'INDIVIDU' end,
      nullif(v_brand, ''),
      'LEAD',
      nullif(btrim(coalesce(NEW.jabatan, '')), ''),
      v_email,
      v_phone,
      'WEBSITE',
      v_notes
    );
    -- The contacts AFTER INSERT trigger (M5) opens the 'prospect' deal.
  end if;
  return NEW;
end
$function$;

drop trigger if exists trg_contact_from_website_lead on public.bsi_leads;
create trigger trg_contact_from_website_lead
after insert on public.bsi_leads
for each row execute function public.create_contact_from_website_lead();
