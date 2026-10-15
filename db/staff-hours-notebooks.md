# Admin staff-hours notebooks

The existing `/portal/admin.html` dashboard now contains client-specific manual staff-hours notebooks. They do not read, write, export, or reconcile `daily_entries`, `daily_drafts`, or `client_logistics`. A checkmark is the administrator's recorded confirmation, not an automated chart review or export action.

## Data and access

- `public.admin_staff_hours`: one record per manually entered staff/date/hours item, keyed to `ess.clients.id`. Worked dates determine month membership; dates are calendar dates without UTC conversion.
- `public.admin_staff_hours_history`: immutable snapshots of additions, edits, verification changes, and deletions. Deleting an entry hides it while preserving its history. Moving a worked date retains history in both relevant months.
- `ess_private.notebook_admins`: server-controlled approved admin mailboxes. No API client has table privileges. RLS intentionally has no policies, denying direct client access.
- Access requires a Supabase Auth user with a confirmed mailbox matching an enabled admin record. The initial mailbox is the existing ESS business contact, `empowermentess@gmail.com`. The old browser PIN flag never authorizes database reads or writes.
- `public.staff_hours_admin_access()` returns only the current user's authorization status. Authorization lookup and audit trigger functions reside in an unexposed schema with fixed search paths and restricted execute grants.
- Database triggers stamp timestamps and verifier identity. Editing staff, worked date, or hours clears verification. Updates include the last observed revision, preventing stale-device overwrites.
- Authenticated Realtime plus foreground refresh/polling synchronize devices. Offline and failed saves never display as successful saves. Insert retries reuse a UUID to prevent duplicates after an uncertain network response.

Tabs and client cards are derived from `ess.clients`; adding a client there automatically creates its notebook tab. Existing client name/portal mappings preserve their full names. New clients should have `full_name` populated. Staff names are editable text with suggestions from `ess.staff`.

## First sign-in

Use **Email sign-in link** in the dashboard and verify the ESS business mailbox. No account or email was created/sent during deployment. Each device signs in separately.

Supabase Auth email delivery must be configured for this mailbox. Add `https://empowermentss.com/portal/admin.html` (and the www origin if used) to the project's Auth redirect allowlist. If a link does not return to ESS, **Sign-in link not returning here?** can verify the original copied Supabase email link directly, without depending on a redirect. Email delivery and a real owner's sign-in require user interaction and are not covered by automated checks.

The existing **My Notes** collection remains device-local under its existing storage key, preserving prior notes and import/export. Staff hours and their checkmarks are stored only in Supabase.

## Verification

Run `node --test tests/admin-notebooks.test.cjs` for month boundaries, totals, client separation, client discovery, and entry validation.

`staff-hours-notebooks.verify.sql` performs transactional database regression checks with temporary test identities and data, then rolls everything back: authorized CRUD, isolation, verification reset, immutable audit events, revision conflicts, moved dates, invalid hours, and denial of anonymous and non-admin access.

The schema was deployed using the `ess_admin_staff_hours_notebooks` migration; `staff-hours-notebooks.sql` is its committed source snapshot, not a script to reapply against the same database. Existing charting tables and policies were not changed. The security advisor's informational no-policy finding on the private admin allowlist is intentional deny-all protection. Existing unrelated advisor findings remain outside this change.

The Supabase browser library is pinned and vendored at version 2.117.3, avoiding a floating CDN dependency. A browser automation capability was unavailable during implementation; DOM interactions were exercised with a simulated document, not a rendered browser.
