-- 0019 — Group tags on companies and branches (14 Nov 2026).
--
-- The top-bar selector can narrow every page to a company's branches or to a
-- tag ("Doha", "Mall", "QSR"). A company's tags apply to all its branches; a
-- branch's own tags apply to it alone. Both are plain text arrays, edited in
-- Administration → Outlets. Existing read/write rules apply unchanged.
--
-- Safe to re-run.

alter table public.brands add column if not exists tags text[] not null default '{}';
alter table public.outlets add column if not exists tags text[] not null default '{}';
