# INSIGHT360 — Deployment Guide

Two deployment targets are covered:

1. **[GitHub Pages (Demo Mode)](#part-1--github-pages-demo-mode)** — the default. A static
   build with no backend, no secrets and a deterministic seeded dataset.
2. **[Live Mode (Supabase)](#part-2--live-mode-supabase)** — the same build wired to a
   Supabase project for Auth, Postgres + RLS and Storage.

Prerequisites: Node.js 20+, npm, a GitHub account, and (for live mode) a Supabase project
set up as described in [`../supabase/README.md`](../supabase/README.md).

---

## Part 1 — GitHub Pages (Demo Mode)

### Step 1. Create the repository

```bash
cd insight360
git init
git add .
git commit -m "Initial commit: INSIGHT360"
git branch -M main
```

Create an empty repository on GitHub (no README, no .gitignore — the project has both),
then:

```bash
git remote add origin https://github.com/<user>/<repo-name>.git
git push -u origin main
```

Check that `.gitignore` excludes `node_modules`, `dist` and `.env` before the first push.
`.env.example` is committed; `.env` is not.

### Step 2. Enable Pages with GitHub Actions

1. Open the repository on GitHub.
2. **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **"GitHub Actions"**.

That is the whole configuration. Do not pick "Deploy from a branch" for this route.

### Step 3. Run the workflow

`.github/workflows/deploy.yml` triggers on every push to `main` and via
**Actions → Deploy INSIGHT360 to GitHub Pages → Run workflow**.

What it does:

| Stage | Detail |
| --- | --- |
| Checkout | `actions/checkout@v4` |
| Node | `actions/setup-node@v4`, Node 20, npm cache |
| Install | `npm ci` |
| Build | `npm run build` with `VITE_APP_MODE: demo` and `VITE_BASE_PATH: /${{ github.event.repository.name }}/` |
| SPA fallback | `node scripts/spa-fallback.cjs` → `dist/404.html` + `dist/.nojekyll` |
| Upload | `actions/upload-pages-artifact@v3` (path `dist`) |
| Deploy | `actions/deploy-pages@v4` |

Required permissions (`contents: read`, `pages: write`, `id-token: write`) and the
`concurrency: pages` group are already declared in the workflow.

When the job finishes, the deployment URL is printed in the job summary and on
**Settings → Pages**:

```
https://<user>.github.io/<repo-name>/
```

Because `VITE_BASE_PATH` is derived from `github.event.repository.name`, **the base path
is always correct, whatever you called the repository** — no manual edit is required.

### Step 4 (alternative). Manual deploy to the `gh-pages` branch

```bash
npm run deploy
```

* `predeploy` → `npm run build` then `node scripts/spa-fallback.cjs`
* `deploy` → `gh-pages -d dist -t true` (the `-t` flag includes dotfiles, which is what
  publishes `.nojekyll`)

Then **Settings → Pages → Source: "Deploy from a branch"**, branch **`gh-pages`**,
folder **`/ (root)`**.

> The manual route does **not** set the base path for you. If your repository is not named
> `insight360`, create a `.env` first (see below) or the deployed page will be blank.

### Custom base path when the repository name differs

`vite.config.ts`:

```ts
const base = env.VITE_BASE_PATH || (mode === 'production' ? '/insight360/' : '/')
```

So:

| Situation | `VITE_BASE_PATH` |
| --- | --- |
| Repository named `insight360` | leave empty (default `/insight360/`) |
| Repository named something else, e.g. `cx-platform` | `/cx-platform/` |
| User/organisation site (`<user>.github.io`) | `/` |
| Custom domain at the apex | `/` |
| Local development | empty (dev always uses `/`) |

Set it in `.env` for local/manual builds:

```bash
VITE_BASE_PATH=/cx-platform/
```

or inline:

```bash
VITE_BASE_PATH=/cx-platform/ npm run build && node scripts/spa-fallback.cjs
```

Leading **and** trailing slashes are both required.

The router follows automatically — `src/App.tsx` computes
`import.meta.env.BASE_URL.replace(/\/$/, '')` and passes it to `BrowserRouter` as
`basename`, so no route literal ever contains the base path.

### Custom domain

1. **Settings → Pages → Custom domain**: enter e.g. `insight360.example.com` and save.
   GitHub commits a `CNAME` file to the publishing branch (for the Actions route, add
   `public/CNAME` containing the bare domain so it is copied into `dist` on every build —
   otherwise the setting is lost on the next deploy).
2. DNS: a `CNAME` record pointing `insight360` → `<user>.github.io` for a subdomain, or
   four `A` records to GitHub's Pages IPs for an apex domain.
3. Wait for the certificate, then tick **Enforce HTTPS**.
4. A custom domain serves the site from the **root**, so rebuild with `VITE_BASE_PATH=/`.
   Leaving it at `/<repo>/` is the most common cause of a blank page on a custom domain.

### Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| **Blank white page**, console shows 404s for `/assets/index-*.js` | Wrong base path — assets are being requested from the wrong prefix | Rebuild with the correct `VITE_BASE_PATH` (`/<repo-name>/`, or `/` for a user site or custom domain). Confirm with `grep -o 'src="[^"]*"' dist/index.html` — the paths must start with your base. |
| **Blank page, no network errors**, but the URL is `/<repo>/` | Router `basename` mismatch | The basename comes from `import.meta.env.BASE_URL`; it can only mismatch if the build and the hosting prefix differ. Rebuild — do not hand-edit `dist`. |
| **Home page works, refresh on a deep link gives GitHub's 404** | `dist/404.html` missing | Run `node scripts/spa-fallback.cjs` after every build. The Actions workflow and `predeploy` both do this; a bare `npx vite build` does not. |
| **Some assets 404, paths contain `_`** | Jekyll processing stripped underscore-prefixed files | Ensure `dist/.nojekyll` exists (the same script writes it) and that the manual deploy used `gh-pages -t true`. |
| **Old version still served after a successful deploy** | Browser or CDN cache | Hard reload (Ctrl/Cmd + Shift + R), or open a private window. Hashed asset filenames mean only `index.html` and `404.html` can be stale; GitHub's CDN usually clears within a few minutes. |
| **Workflow fails at "Upload artifact"** | Pages source is not "GitHub Actions" | Settings → Pages → Source → GitHub Actions. |
| **Workflow fails with a permissions error** | Missing `pages: write` / `id-token: write` | Already in `deploy.yml`; also check **Settings → Actions → General → Workflow permissions**. |
| **`npm ci` fails in CI but `npm install` works locally** | `package-lock.json` out of date | Run `npm install` locally and commit the updated lock file. |
| **Build fails on a type error** | `npm run build` runs `tsc -b` first | Fix the reported type error, or run `npm run typecheck` locally before pushing. |
| **404 on `/` immediately after enabling Pages** | First deployment still propagating | Wait 1–2 minutes and reload. |

---

## Part 2 — Live Mode (Supabase)

Live Mode is the same static bundle built with `VITE_APP_MODE=live` plus two Supabase
variables. Complete [`../supabase/README.md`](../supabase/README.md) first — project
creation, the three migrations, the storage bucket and auth-user linking.

### Step 1. Collect the values

From **Supabase → Project Settings → API**:

* **Project URL** → `VITE_SUPABASE_URL`
* **anon / public key** → `VITE_SUPABASE_ANON_KEY`
* **service_role key** → **not used by the frontend, ever.**

### Step 2. Build locally against Supabase

```bash
cp .env.example .env
```

```bash
VITE_APP_MODE=live
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_BASE_PATH=/insight360/
```

```bash
npm run build
npm run preview
```

`src/services/supabaseClient.ts` throws *"Live mode requires VITE_SUPABASE_URL and
VITE_SUPABASE_ANON_KEY"* if either is missing, so a misconfigured build fails loudly
rather than silently falling back.

Sign in with an auth user that has a linked, `active` row in `public.users`.

### Step 3. Where the anon key may live

The anon key is designed to be public — it identifies the project, it does not authorise
anything. RLS is what protects the data. It is therefore acceptable to keep it in:

* a local `.env` (git-ignored),
* a **GitHub Actions repository *variable*** (`Settings → Secrets and variables → Actions
  → Variables`), which is the natural home since it ends up in the bundle anyway,
* a **GitHub Actions *secret*** if you prefer it masked in logs — functionally identical
  for the build, and it is still readable in the shipped JavaScript.

It must **not** live in a public `.env` committed to git (churn and confusion), and the
**service-role key must not live in any of these places**. Keep the service-role key in a
password manager or a server-side secret store, and use it only from a trusted machine or a
backend job.

### Step 4. A live-mode GitHub Actions build

`deploy.yml` ships a demo build. To publish a live build, change the build step to read the
variables (create `SUPABASE_URL` and `SUPABASE_ANON_KEY` as repository **variables**, or as
**secrets** and reference `secrets.` instead):

```yaml
      - name: Build (live mode)
        env:
          VITE_APP_MODE: live
          VITE_SUPABASE_URL: ${{ vars.SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ vars.SUPABASE_ANON_KEY }}
          VITE_BASE_PATH: /${{ github.event.repository.name }}/
        run: npm run build
```

Keep the demo workflow on `main` and the live workflow on a separate branch or a separate
workflow file with its own trigger if you want both.

### Step 5. Supabase configuration for the deployed origin

In the Supabase dashboard:

* **Authentication → URL Configuration → Site URL**: your Pages URL, e.g.
  `https://<user>.github.io/<repo-name>/`.
* **Redirect URLs**: add the same URL (and any custom domain) so password-reset and
  magic-link flows return to the app.
* **Authentication → Providers → Email**: decide whether sign-ups are open. For a closed
  engagement, disable self-service sign-up and create users from the dashboard.
* **Storage**: confirm `evidence` is **private** (see the backend README).

### Step 6. Verify

1. Open the deployed URL in a private window.
2. Sign in as a shopper: you see only your own visits.
3. Sign in as the ops manager: you see only assigned outlets.
4. Sign in as the executive: everything is read-only.
5. Upload a photo on an assigned, still-open visit: it lands in `evidence/<visit-id>/…`
   and is not reachable via a public URL.
6. Confirm in the browser's network tab that only the anon key is present, and search the
   built bundle for the service-role key to be certain it is absent:

```bash
grep -R "service_role" dist/ || echo "clean"
```

### Live-mode troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| *"Live mode requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"* | Variables missing at **build** time | `VITE_` values are compiled in; set them before `npm run build`, not at runtime. |
| *"No INSIGHT360 profile is linked to this account."* | `public.users.auth_id` does not match the auth user | Run the linking SQL in `supabase/README.md` §4. |
| *"This account is not active."* | `users.status` is `invited` or `inactive` | `update public.users set status = 'active' where id = '…'`. |
| Signed in but every list is empty | RLS is doing its job — the role has no rows in scope | Check `users.role`, and for `ops_manager` check `outlet_ids` (empty means **no** outlets for that role). |
| Upload rejected | Visit not writable, wrong MIME type, or over 50 MB | The shopper must own the visit and it must be `Assigned` / `In Progress` / `Draft` / `Rejected`; allowed types are JPEG, PNG, WebP, MP4, PDF. |
| CORS errors | Site URL / redirect URLs not registered | Add the deployed origin under Authentication → URL Configuration. |
| Session lost on reload | `remember me` unchecked | The repository sets `insight360.session.ephemeral` in `sessionStorage` in that case — by design. |
