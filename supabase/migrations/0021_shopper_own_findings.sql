-- 0021 — A shopper can read the findings raised on their own visits (16 Nov 2026).
--
-- Submitting a visit raises a critical finding (and its alert) for each failed
-- critical question, and skips one already raised for the same visit and
-- question, so a reopened visit submitted again does not raise it twice.
-- That check runs in the shopper's browser, and a shopper could not read
-- findings at all: every resubmission raised the same finding again
-- (MS-26-0003 ended up with four).
--
-- The shopper sees only findings on visits assigned to them, which are the
-- critical failures they reported themselves. Findings pages stay behind the
-- findings.view permission, which shoppers do not hold.
--
-- Safe to re-run.

drop policy if exists findings_shopper_select on public.findings;
create policy findings_shopper_select on public.findings
  for select to authenticated
  using (
    app."current_role"() = 'shopper'
    and exists (
      select 1 from public.visits v
       where v.id = findings.visit_id
         and v.shopper_id is not null
         and v.shopper_id = app.current_shopper_id()
    )
  );
