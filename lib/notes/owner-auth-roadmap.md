# Owner auth — first backend stage (read-only note)

This stage introduces **invite-only** salon-owner authorization and connects the
admin side of the application to real tenant-scoped bookings. It does **not**
touch the public booking flow.

## Current state

- Tenant resolution is server-side, from the `*.<NEXT_PUBLIC_ROOT_DOMAIN>` host, via
  `proxy.ts` and `x-salon-id`.
- Public booking creation (`POST /api/bookings`) uses the server-side Supabase
  client and still works on the tenant API. That flow is untouched by this stage.
- Platform-admin endpoints (`/api/admin/salons`, `/api/admin/provision`) still
  use `PLATFORM_ADMIN_SECRET`. That secret stays in place for platform ops
  until the proprietor replaces it with a platform admin role.

## What this stage adds

- A new `salon_owners` table that links a Supabase Auth user to a salon and a
  role (`owner`, `manager`).
- A single backend helper (`lib/domain/owner-auth.ts`) that:
  - reads and validates a Supabase session,
  - resolves the owner’s salon from `salon_owners`,
  - returns one of: authenticated + tenant, or a typed failure.
- Two owner-only API surfaces:
  - `GET/GET /api/owner/bookings`
  - `PATCH /api/owner/bookings/<id>/status`
- Explicit HTTP semantics:
  - `401` — no valid session
  - `403` — authenticated, but not linked to the requested salon
  - `404` — booking not found or not owned by this salon
  - `503` — Supabase unreachable or degraded

## What this stage does not do

- Public registration.
- Sending invitations.
- Creating the first owner automatically.
- Changing any existing admin UI component.
- Modifying the public booking endpoint or tenant middleware.
- Applying the migration to a remote Supabase project.

## Owner —> salon link

A salon owner account is a Supabase Auth user that has a row in
`salon_owners(uid, salon_id, role)`.

Only the platform operator (or a migration) should create those rows. The first
owner is **not** created by this code.

### How the platform operator assigns the first owner

1. Create the tenant (salon) first, by whichever operational path you use today.
2. Create the owner’s Supabase Auth account in the same project (email/password,
   magic link, or your chosen auth path).
3. Insert one row into `salon_owners`:
   - `uid` = the new user’s Supabase Auth id
   - `salon_id` = the salon the operator wants to give access to
   - `role` = `owner`
4. Tell the owner their login credentials through your existing secure channel.
   Do **not** pass secrets through the browser or through this codebase.

### How to revoke access later

1. Delete or update the matching `salon_owners` row.
2. If you want to fully disable the account, disable or delete the Supabase Auth
   user in the same project.
3. After that, the owner endpoints return `401` or `403` instead of granting
   salon access.

## Session model used here

This stage accepts a Supabase session JWT through one of two server-side channels:

- `Authorization: Bearer <jwt>`
- a cookie named `auth.token`

It validates that JWT with the server-side Supabase client and then looks up the
corresponding `salon_owners` row.

If you prefer a different session shape later (for example Supabase cookies,
custom cookies, or a separate platform token), change only
`lib/domain/owner-auth.ts` and the owner endpoints — the rest of the booking
stack does not depend on this choice.

## Dependency note

No new packages were added. The owner-auth code reuses the existing
`@supabase/supabase-js` server client already present in the project. If you
want to move session issuance into this app later, that would be a separate
decision and may require additional auth UI or Supabase client setup.

## CLI note

- Migration SQL lives in `supabase/schema.sql`; it has **not** been applied.
- Owner endpoints are backend-only and are intentionally kept separate from the
  public tenant API and from `PLATFORM_ADMIN_SECRET`.
- No users, emails, or invitations were created.
