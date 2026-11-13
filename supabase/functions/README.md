# Edge Functions

## `provision-user`

Turns **Administration → Users → Create user** into a real, working login.

Creating a Supabase Auth account requires the service-role key, which bypasses every
row-level security policy in the project. That key must never exist in a browser bundle, so
the app cannot create logins itself. It asks this function, which runs on Supabase's
servers, holds the key there, and decides for itself whether the caller is entitled to what
they asked for.

### Deploy it

**From the dashboard** (no tooling needed):

1. **Edge Functions → Deploy a new function → Via Editor**
2. Name it exactly `provision-user` — the app calls it by that name.
3. Paste the contents of `provision-user/index.ts`.
4. **Deploy**.

**From the CLI:**

```bash
supabase functions deploy provision-user
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically. Do not add them as secrets, and do not paste any key into the file.

Migration `0007_admin_provisioning_rpc.sql` must be applied first — it creates the
`admin_provision_user` RPC this function calls.

### What it guarantees

* **Identity comes from the token, not the request.** The caller is resolved from their own
  JWT and their role is read from `public.users`. A crafted request body cannot claim to be
  an administrator.
* **A client admin cannot create administrators.** Only `super_admin` may assign
  `super_admin` or `shopper`; `client_admin` is limited to stakeholder roles, matching what
  the app's own UI allows.
* **No half-made users.** If the profile write fails, the Auth account created moments
  earlier is deleted again.
* **An existing login is never reset.** Running it for someone who already has an account
  links the profile and leaves their password untouched, rather than silently locking them
  out or handing their credentials to whoever clicked the button.
* **An operations manager cannot be created with an empty outlet scope**, which would open
  to a blank application and read as a broken login.

### The temporary password

The function generates one, returns it once, and stores it nowhere. The app shows it on a
dialog with a copy button and then forgets it.

It is not emailed. Supabase's built-in SMTP is rate-limited to a few messages an hour and
is explicitly not for production use, so an invite flow would fail silently part-way
through onboarding a team. If you would rather send invitations than hand out passwords,
configure your own SMTP under **Authentication → SMTP Settings** first; the function can
then be switched to `inviteUserByEmail`.

### If the app reports the function is not deployed

That message means the app reached Supabase but found no function by that name. Check the
name is exactly `provision-user` under **Edge Functions**, and that its status is
**Active**. Logs for each invocation are under that function's **Logs** tab.

### Fallback

`supabase/create_user.sql` does the same job directly in SQL, and does not depend on this
function being deployed. It remains the way to create the first administrator, who by
definition has no one to create them from inside the app.

## `switch-account`

Lets a super admin open any other account in one click — **Switch account** in the
profile menu — so one person can key in work as each shopper or reviewer without holding
their passwords.

It is deliberately **not** a button on the sign-in page. The app is served from a public
address; a one-click login there would open the client's outlets, scores and reports to
anyone who found the link. Here, the administrator has already signed in with a password.

### What it guarantees

* **Only an active super admin can call it.** The caller is resolved from their own JWT and
  their role read from `public.users`.
* **No switching into another super admin**, an inactive account, or a profile with no login.
* **Every switch is in the activity log**, under the administrator's own name. If the log
  entry cannot be written the switch is refused.
* **No email is sent.** It issues a one-time sign-in token (`generateLink`), which the
  browser exchanges for a session with `verifyOtp`. The administrator's own session is kept
  in the browser, so **Back to …** returns to it without a password.
* Signing out of a borrowed account ends it in this browser only — the person's own
  session on their phone is untouched.

### Deploy it

Same as `provision-user`: name it exactly `switch-account`, keep **Verify JWT** on.

```bash
supabase functions deploy switch-account
```
