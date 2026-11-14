-- 0016 — Questions that must be answered although they carry no score.
--
-- The briefs make the visit fields mandatory — time in, time out, the branch —
-- but those questions are unweighted, and the app only insisted on scored
-- answers, so a visit could be submitted without them. `required` marks them.
--
-- Bundled into GO_LIVE.sql ahead of the seed, which writes this column.
-- Safe to re-run.

alter table public.audit_questions add column if not exists required boolean not null default false;
