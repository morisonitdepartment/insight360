-- ===========================================================================
-- 0012 — the visit workflow, addressed notifications, and phone photographs.
--
-- Safe to re-run: every column is `if not exists`, every policy is dropped
-- before it is created.
--
-- 1. Notifications can name ONE person.
--    Until now a notification went to every holder of a role: "New visit
--    assigned" reached every shopper, and "Report awaiting approval" every
--    administrator, whoever the visit belonged to. `recipient_id` addresses it
--    to one user; a row without one still goes to its audience, as before.
--
-- 2. Anyone signed in may RAISE a notification.
--    There was no insert policy at all except the super admin's, so a shopper
--    submitting a visit — which tells the reviewer it is waiting — was refused,
--    and the submission failed halfway.
--
-- 3. A shopper may record the findings and alerts their own visit raises.
--    Submitting a visit with a failed critical standard creates a finding and
--    an alert. Both needed permissions no shopper holds, so the most important
--    visits were exactly the ones that could not be submitted.
--
-- 4. Only the named reviewer approves.
--    A visit booked with a reviewer can be reviewed by that person (or a super
--    admin). One booked without a reviewer stays open to anyone holding
--    visits.review, which is how it worked before.
--
-- 5. Phone videos.
--    iPhones record .mov (video/quicktime) and some Android browsers webm; the
--    bucket accepted only mp4, so a recorded video was refused at upload.
--    Photographs are converted to JPEG in the browser before upload, so HEIC
--    never reaches the bucket.
-- ===========================================================================

-- 1. Addressed notifications --------------------------------------------------
alter table public.notifications add column if not exists recipient_id text
  references public.users(id) on delete cascade;
create index if not exists notifications_recipient_idx on public.notifications (recipient_id);

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    case
      when recipient_id is not null then recipient_id = app.current_user_id()
      else app."current_role"() = any (audience)
    end
  );

drop policy if exists notifications_update_read on public.notifications;
create policy notifications_update_read on public.notifications
  for update to authenticated
  using (
    case
      when recipient_id is not null then recipient_id = app.current_user_id()
      else app."current_role"() = any (audience)
    end
  )
  with check (
    case
      when recipient_id is not null then recipient_id = app.current_user_id()
      else app."current_role"() = any (audience)
    end
  );

-- 2. Raising a notification ---------------------------------------------------
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (app.is_app_user());

-- 3. Findings and alerts from a shopper's own visit ---------------------------
-- Deliberately not tied to the visit's status: the visit is marked Submitted in
-- the same save, and the order in which rows reach the server must not decide
-- whether a critical failure is recorded.
drop policy if exists findings_shopper_insert on public.findings;
create policy findings_shopper_insert on public.findings
  for insert to authenticated
  with check (
    app."current_role"() = 'shopper'
    and exists (
      select 1 from public.visits v
      where v.id = visit_id
        and v.shopper_id is not null
        and v.shopper_id = app.current_shopper_id()
    )
  );

drop policy if exists alerts_shopper_insert on public.alerts;
create policy alerts_shopper_insert on public.alerts
  for insert to authenticated
  with check (
    app."current_role"() = 'shopper'
    and visit_id is not null
    and exists (
      select 1 from public.visits v
      where v.id = visit_id
        and v.shopper_id is not null
        and v.shopper_id = app.current_shopper_id()
    )
  );

-- 4. The named reviewer -------------------------------------------------------
drop policy if exists visits_review_update on public.visits;
create policy visits_review_update on public.visits
  for update to authenticated
  using (
    app.has_permission('visits.review')
    and (reviewer_id is null or reviewer_id = app.current_user_id())
  )
  with check (
    app.has_permission('visits.review')
    and (reviewer_id is null or reviewer_id = app.current_user_id())
  );

-- 5. Phone videos -------------------------------------------------------------
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm',
  'application/pdf'
]
where id = 'evidence';
