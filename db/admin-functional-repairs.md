# Admin Portal functional repairs

The Admin Portal uses the existing Supabase admin account through the main
`/login.html?admin=1` login page. A remembered Supabase session is shared across
page navigation and refreshes. The browser flag `ESS_Admin_Login` is retained
for compatibility with other existing admin tools; it never grants access to
manual notebook or employee data.

The old public admin PIN has been removed from the main login page. Use the
secure admin account password. If needed, the login page offers a one-time
password setup/reset. The Auth redirect allowlist must permit
`https://empowermentss.com/login.html?admin=1&recovery=1` for recovery links.
There is no notebook email sign-in UI.

`admin-team-snapshots.sql` is an additive deployed migration. It adds protected
employee snapshots and optional employee identity fields to the manual notebook.
Existing entries retain their original staff names and become `legacy` entries.
Nothing modifies official charting, logistics, payroll, or invoices.

Employee snapshots were read through the user's authorized Gusto connector and
saved server-side. No tokens, compensation values, or employee personal details
are stored in repository files. The browser receives snapshot data only after
RLS verifies the administrator. Snapshot writes are unavailable to API clients.

Automatic website-to-Gusto refresh is not configured. It requires a separate
Gusto API OAuth integration; the ChatGPT connector's access credentials must
not be extracted or copied into the website. The UI identifies snapshots and
their verification dates, and shows unavailable YTD earnings rather than
fabricated values. Manual hours and base-rate wage estimates are separate from
official Gusto payroll amounts and do not assert payment.

The entry form supports employee selection, ESS direct service, decimal hours,
and verification at save time. UUID reuse prevents duplicate submissions after
uncertain network responses. A matching staff/date/hours warning still permits
additional legitimate same-day sessions. Edits use revision checks; staff/date/
hours or employee identity changes clear old verification before an explicitly
reviewed checkbox can create a new verification timestamp. History is immutable.

Run `node --test tests/admin-notebooks.test.cjs` and
`db/staff-hours-notebooks.verify.sql`. The database tests roll back temporary
identities and data and include denial of anonymous/non-admin employee reads.
Production browser checks require the owner's legitimate authenticated session.
