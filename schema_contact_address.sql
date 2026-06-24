-- Address fields on the contact (bsi_leads), additive.
alter table public.bsi_leads add column if not exists nama_lokasi  text;
alter table public.bsi_leads add column if not exists alamat_jalan text;
alter table public.bsi_leads add column if not exists alamat_rtrw  text;
alter table public.bsi_leads add column if not exists alamat_blok  text;
alter table public.bsi_leads add column if not exists kelurahan    text;
alter table public.bsi_leads add column if not exists kecamatan    text;
alter table public.bsi_leads add column if not exists kota         text;
alter table public.bsi_leads add column if not exists provinsi     text;
alter table public.bsi_leads add column if not exists kode_pos     text;
alter table public.bsi_leads add column if not exists negara       text;
