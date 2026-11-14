-- 0015 — Uploaded logos, and shopper names kept in step.
--
-- * organizations.logo and brands.logo hold a logo uploaded in Settings, as a
--   PNG data URL (the app shrinks it to 400 px first, so a few tens of KB).
--   Kept with the row rather than in a storage bucket: every screen and every
--   PDF report already has the organisation and brand rows, and nothing extra
--   needs signing or caching. Capped at 1.5 MB so a mistaken upload cannot
--   bloat every page load. Existing read/write rules apply unchanged.
-- * A shopper is a user row and a shopper row. Renaming the user did not rename
--   the shopper (fixed in the app, 14 Nov 2026); this brings any pair that had
--   already drifted back in line, taking the name most recently edited.
--
-- Safe to re-run.

alter table public.organizations add column if not exists logo text;
alter table public.brands add column if not exists logo text;

do $$ begin
  alter table public.organizations add constraint organizations_logo_size check (logo is null or length(logo) <= 1500000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.brands add constraint brands_logo_size check (logo is null or length(logo) <= 1500000);
exception when duplicate_object then null; end $$;

update public.shoppers s
   set name = u.name
  from public.users u
 where u.shopper_id = s.id
   and u.name is distinct from s.name
   and u.updated_at > s.updated_at;
