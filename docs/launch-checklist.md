# Launch checklist

This repository is prepared for the planned `uzmini.com` domain. The actual
domain is not purchased or configured yet. Change `NEXT_PUBLIC_ROOT_DOMAIN`
and `NEXT_PUBLIC_APP_URL` in the deployment environment if the final domain
differs.

## Before launch

- Use Node.js 22 or newer (`.nvmrc` and `package.json` enforce this locally and
  in GitHub Actions).
- Add the root domain and wildcard tenant domain to DNS and configure HTTPS at
  the selected host. The host must run Next.js server routes, not only static
  files.
- Configure `NEXT_PUBLIC_ROOT_DOMAIN` and `NEXT_PUBLIC_APP_URL` in the host.
- Configure Supabase URL, publishable/anon key, and server secret in the host's
  secret settings. Never commit `.env.local` or provider keys.
- Configure `TELEGRAM_BOT_TOKEN` server-side and set the Telegram Web App URL to
  the HTTPS platform or tenant URL.
- Review and apply `supabase/schema.sql` to the intended Supabase project, then
  verify RLS and seed the salon's masters and services.
- Set `PLATFORM_ADMIN_SECRET` server-side before using `/api/admin/*`.
- Keep Click and Payme disabled for live payments until their server callbacks,
  signature checks, amount verification, and idempotency are implemented.

## Now, without a domain and without a committed budget

These steps do not require owning `uzmini.com` yet, and do not assume any free
hosting exists. Free hosting may not be available, may require a card or
verification, or may have limits that make it unsuitable for a real pilot.

### Repository and build

- [ ] Make sure `.nvmrc` and `package.json` specify Node 22+.
- [ ] Open a GitHub Actions workflow (or equivalent build step) that runs, at
      minimum, `npm ci`, `npm run typecheck`, and `npm run build` on pushes and
      pull requests to `main`.
- [ ] Keep `.env.local`, `.env.local.txt`, and provider keys out of the
      repository. Never read them, copy them, or commit their values.

### Environment variables (names only, values stay in host secrets)

Public, browser-safe variables:

- `NEXT_PUBLIC_ROOT_DOMAIN` — root domain, for example `uzmini.com`.
- `NEXT_PUBLIC_APP_URL` — public application URL, for example
      `https://app.uzmini.com`.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Server-only variables (never exposed to the browser):

- `SUPABASE_SECRET_KEY`
- `PLATFORM_ADMIN_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `CLICK_MERCHANT_ID`, `CLICK_SERVICE_ID`, `CLICK_SECRET_KEY`, `CLICK_MERCHANT_USER_ID`
- `PAYME_MERCHANT_ID`, `PAYME_SECRET_KEY`

Do not change or read local `.env*` files for this step. Only confirm which
variables the project needs and where each will live in the deployment
environment.

### Telegram (no domain yet)

- [ ] Open Telegram BotFather and create or review the bot used by the Mini
      App.
- [ ] Note that the Web App URL must be a fully qualified HTTPS URL.
- [ ] Do not set or save the Web App URL until the HTTPS platform or tenant URL
      exists.

### Supabase project (preparation, not schema apply yet)

- [ ] Decide which Supabase project will host production.
- [ ] Keep the project URL and keys out of the repository.
- [ ] Decide who applies `supabase/schema.sql` and seeds the first salon.
- [ ] Agree that Click and Payme will stay disabled for live use until their
      server callbacks, signature checks, and idempotency are implemented.

### github build/CI

- [ ] Keep a minimal CI that does not require the production domain.
- [ ] Make sure the workflow can run `npm ci`, `npm run typecheck`, and
      `npm run build` from the repository alone.
- [ ] Do not add production secrets to CI.

### What not to do yet

- [ ] Do not buy the domain.
- [ ] Do not change DNS.
- [ ] Do not configure HTTPS on a live host.
- [ ] Do not set the Telegram Web App URL.
- [ ] Do not apply `supabase/schema.sql` to a production project until the
      environment is ready.
- [ ] Do not promise a free hosting option that has not been verified.

## On the day `uzmini.com` is purchased

### Domain, DNS, and HTTPS

- [ ] Confirm that the purchased domain is `uzmini.com` and update all
      deployment references that used a different placeholder domain.
- [ ] Add the root domain and the wildcard tenant domain to DNS at the DNS
      provider.
      - Root: `uzmini.com`.
      - Wildcard tenant: `*.uzmini.com`.
- [ ] Point the DNS records to the host that will run Next.js server routes
      (A/CNAME as appropriate for that host).
- [ ] Enable HTTPS for the root domain and for wildcard tenant hostnames at the
      selected host. If the host does not support wildcard HTTPS on the selected
      plan, add only the hostnames that are actually needed for the pilot.
- [ ] Wait for DNS to propagate and for HTTPS to be active before opening the
      Mini App to users.

### Environment variables (values in host secrets, not in the repository)

- [ ] Set the public variables for the real domain:
      - `NEXT_PUBLIC_ROOT_DOMAIN=uzmini.com`
      - `NEXT_PUBLIC_APP_URL=https://<chosen public host>`
      - `NEXT_PUBLIC_SUPABASE_URL`
      - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Set the server-only variables in the host's secret settings:
      - `SUPABASE_SECRET_KEY`
      - `PLATFORM_ADMIN_SECRET`
      - `TELEGRAM_BOT_TOKEN`
      - `CLICK_MERCHANT_ID`, `CLICK_SERVICE_ID`, `CLICK_SECRET_KEY`,
        `CLICK_MERCHANT_USER_ID` (if Click is enabled)
      - `PAYME_MERCHANT_ID`, `PAYME_SECRET_KEY` (if Payme is enabled)
- [ ] Confirm that no local `.env` secret values are copied into the repository
      or client bundle.

### Supabase schema and seed

- [ ] Review `supabase/schema.sql` one more time for the real project.
- [ ] Apply the schema to the intended Supabase project.
- [ ] Verify RLS rules match the expected read/write roles.
- [ ] Seed the first salon's masters and services, or leave a documented manual
      step for the first launch.

### Telegram Web App URL

- [ ] Open Telegram BotFather and set the Web App URL to the real HTTPS
      platform or tenant URL.
- [ ] Verify that the URL matches the HTTPS host users will open.

### Build and deploy

- [ ] Run the CI build locally or in the pipeline and confirm
      `npm run typecheck` and `npm run build` pass for the real environment.
- [ ] Deploy the built application to the chosen host.
- [ ] Confirm that the host serves server routes, not only static files, and
      that `NEXT_PUBLIC_ROOT_DOMAIN` and `NEXT_PUBLIC_APP_URL` resolve to the
      live host.

### Manual verification after deploy

- [ ] Open the root domain over HTTPS and confirm the platform loads.
- [ ] Confirm that a wildcard tenant hostname resolves and is mapped by the
      tenant routing code to the correct salon.
- [ ] Open the Mini App and confirm it loads over HTTPS.
- [ ] In the Mini App, confirm that a booking is stored in Supabase and can be
      cancelled, and that failed requests leave the booking visible in the
      client.
- [ ] Confirm that owner APIs reject requests without a valid owner session.
- [ ] Confirm that admin endpoints are protected by `PLATFORM_ADMIN_SECRET`.

DNS, TLS, Telegram configuration, and remote Supabase state still require manual
setup in their respective dashboards. Do not assume any free hosting path is
available until it has been verified for the selected domain and runtime.
