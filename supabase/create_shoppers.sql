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
--   STEP 2  Replace the three email addresses below with the real ones you
--           just used, then run this file.
--
-- WHY THE EMAIL MATTERS: provision_user derives the shopper record's id from
-- the email address. Change the email later and you get a second shopper, not
-- a renamed one — so use each person's permanent work address the first time.
--
-- Shoppers take '' for outlet codes, which every role except ops_manager reads
-- as "all outlets". A shopper still only ever sees visits assigned to them.
-- ============================================================================


-- ############################################################################
--  REPLACE THE EMAIL ADDRESSES. Everything else matches the client profile.
--
--    email, full name, job title, role, outlet codes, gender, age range, profile
-- ############################################################################

select app.provision_user('REPLACE-allaway@morisonqatar.com', 'Allaway Rashidi', 'Mystery Shopper', 'shopper', '', 'Male', '25-34', 'Individual');
select app.provision_user('REPLACE-ahmed@morisonqatar.com',   'Ahmed Ouf',       'Mystery Shopper', 'shopper', '', 'Male', '25-34', 'Individual');
select app.provision_user('REPLACE-roben@morisonqatar.com',   'Roben',           'Mystery Shopper', 'shopper', '', 'Male', '25-34', 'Individual');

-- Read every line of output:
--
--   OK       the person can sign in.
--   FAILED   nothing was written — usually the Auth user does not exist yet,
--            or the email does not match Authentication -> Users exactly.
--   WARNING  written, but something was off. Read what it says.


-- ---------------------------------------------------------------------------
-- CAREFUL — ahmedouf@morisonqatar.com already exists on this project as a
-- super_admin. provision_user updates a person rather than duplicating them,
-- so passing that address here would DEMOTE that account to shopper and it
-- would lose administration access.
--
-- If Ahmed needs both, give the shopper profile a second address. One person,
-- two roles, is two accounts — the app reads one role per user.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- AFTERWARDS — check the roster. can_sign_in must be true for all three:
--
--   select name, email, role, can_sign_in from public.user_access_review
--   where role = 'shopper' order by name;
--
-- Then book the three visits in the app, Operations -> Visits -> New visit.
-- Choosing the outlet selects its questionnaire automatically, because the
-- brand names it. The booked dates are:
--
--   Shebestan Palace – Al Sadd (FB-001)              Allaway Rashidi  10 Nov 2026
--   Bennigan's – Qatar Tennis Federation (FB-002)    Ahmed Ouf        11 Nov 2026
--   Pizza Hut – Doha Festival City (FB-003)          Roben            13 Nov 2026
-- ---------------------------------------------------------------------------
