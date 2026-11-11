-- ============================================================================
-- create_shoppers.sql — the three trial shoppers for the Sterling programme.
--
-- PREFER THE APP. Administration -> Users -> Create user does everything this
-- file does AND sets a temporary password, which it then shows you once so you
-- can pass it on. The provision-user Edge Function is deployed on this project,
-- so that route works today. Use this file only to do all three at once, or if
-- you would rather work in SQL.
--
-- If you use this file, Supabase Auth still owns the password, so:
--
--   STEP 1  Authentication -> Users -> Add user -> Create new user
--           Enter the work email and a password, tick "Auto Confirm User".
--           Do this for each of the three.
--
--   STEP 2  Run this file.
--
-- PASSWORDS: Supabase enforces a minimum length (6 characters by default), so
-- a 4- or 5-digit PIN is rejected outright. Give each person their OWN
-- password, not one shared between them: three people signing in as the same
-- identity makes every entry in the audit trail unattributable, and a score
-- nobody can be shown to have recorded is a score a client can dispute.
--
-- The email is case-insensitive here — provision_user lowercases it before
-- hashing — but it is PERMANENT: the shopper's record id is
-- 'shp-' || substr(md5(lower(email)),1,10). A different address later creates a
-- second shopper rather than renaming the first.
--
-- Shoppers take '' for outlet codes, which every role except ops_manager reads
-- as "all outlets". A shopper still only ever sees visits assigned to them.
-- ============================================================================


--    email, full name, job title, role, outlet codes, gender, age range, profile

select app.provision_user('allaway@morisonqatar.com', 'Allaway Rashidi', 'Mystery Shopper', 'shopper', '', 'Male', '25-34', 'Individual');
select app.provision_user('roben@morisonqatar.com',   'Roben',           'Mystery Shopper', 'shopper', '', 'Male', '25-34', 'Individual');


-- ---------------------------------------------------------------------------
-- AHMED OUF — STILL NEEDS A DECISION. Do not run a line for him until it is made.
--
-- ahmedouf@morisonqatar.com is an ACTIVE SUPER_ADMIN on this project.
-- provision_user updates a person rather than duplicating them, so passing that
-- address below would demote that account to shopper and it would lose
-- administration access — including the ability to assign visits.
--
-- The function does guard the LAST super_admin, but there are two active ones
-- (it@morisonqatar.com and ahmedouf@morisonqatar.com), so the guard does not
-- fire here. The demotion would simply succeed.
--
-- One person, two roles, is two accounts: the app reads a single role per user.
-- Give the shopper profile its own address and uncomment:
--
-- select app.provision_user('ahmed.shopper@morisonqatar.com', 'Ahmed Ouf', 'Mystery Shopper', 'shopper', '', 'Male', '25-34', 'Individual');
--
-- Or assign the 11 November Bennigan's visit to somebody else and leave Ahmed
-- as super_admin only.
-- ---------------------------------------------------------------------------


-- Read every line of output:
--
--   OK       the person can sign in.
--   FAILED   nothing was written — usually the Auth user does not exist yet,
--            or the email does not match Authentication -> Users.
--   WARNING  written, but something was off. Read what it says.


-- ---------------------------------------------------------------------------
-- AFTERWARDS — check the roster. can_sign_in must be true for each:
--
--   select name, email, role, can_sign_in from public.user_access_review
--   where role = 'shopper' order by name;
--
-- Then book the visits in the app, Operations -> Visits -> New visit. Choosing
-- the outlet selects its questionnaire automatically, because the brand names
-- it. The booked dates are:
--
--   Shebestan Palace – Al Sadd (FB-001)              Allaway Rashidi  10 Nov 2026
--   Bennigan's – Qatar Tennis Federation (FB-002)    Ahmed Ouf        11 Nov 2026
--   Pizza Hut – Doha Festival City (FB-003)          Roben            13 Nov 2026
-- ---------------------------------------------------------------------------
