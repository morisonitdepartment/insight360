-- 0020 — Nationality on every user account (14 Nov 2026).
--
-- Set in Administration → Users when the account is created or edited, shown in
-- the users list and the user's detail. For a mystery shopper it is kept in step
-- with the shopper profile's own nationality (shoppers.nationality, which
-- already exists), so the Mystery Shoppers pages show the same value.
-- Existing read/write rules on users apply unchanged.
--
-- Safe to re-run.

alter table public.users add column if not exists nationality text not null default '';

-- Shopper accounts start from what their profile already holds.
update public.users u
   set nationality = s.nationality
  from public.shoppers s
 where u.shopper_id = s.id and u.nationality = '' and coalesce(s.nationality, '') <> '';
