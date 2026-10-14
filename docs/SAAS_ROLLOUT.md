# SaaS tenant foundation and rollout gates

Status: Multi-tenant foundation and core workflows are implemented; production readiness is still gated on reviewed legacy migration, privacy acceptance, restore verification and remaining tenant-isolation checks.

## What this foundation introduces

- Organization and branch records with organization-scoped branch identifiers.
- Organization memberships separated from the legacy `User.role`, including explicit branch scope.
- A fail-closed tenant-context middleware that validates membership and organization/branch relationships server-side.
- Organization/branch/member/audit read APIs and branch creation with a transaction-backed audit event.
- Email-verified organization signup: pending requests store only a one-time token hash and no password; completion transactionally creates the owner, organization, first branch, membership, audit event and 14-day trial.
- An explicit default-off registration gate requiring three separate environment flags:
  - `ENABLE_SAAS_REGISTRATION=true`
  - `SAAS_TENANT_DATA_READY=true`
  - `SAAS_LAUNCH_APPROVED=true` — separate operator sign-off after the release gates below are reviewed
  - valid `JWT_SECRET`, `PRIVATE_MEDIA_SECRET`, SMTP settings, and canonical HTTPS `FRONTEND_URL`/`FRONTEND_ORIGIN`/`API_PUBLIC_URL`
- A fail-closed guard on the existing single-school APIs: tenant members cannot use unscoped legacy APIs, and accounts without a membership are also blocked once any SaaS organization exists.
- Role and validation unit tests.

## Do not enable public registration yet

**Keep all three registration environment flags unset or false.** `SAAS_LAUNCH_APPROVED=true` is a final operator sign-off only after the migration, media privacy, tenant-isolation, backup/restore and acceptance checks below have been reviewed. It is not a substitute for those checks. The legacy student, fee, teacher, attendance, reports, notices, calendars, gallery and learning-resource APIs still contain data access that must be migrated to organization/branch-aware queries. These APIs now fail closed for tenant members and also for non-member accounts whenever any SaaS organization exists, because a global legacy query cannot safely distinguish tenant-owned records. The direct static mounts for local student/teacher photos, gallery images, PDFs and videos have been removed. Existing legacy signed-media URLs are now also rejected once SaaS organizations exist, because those URL tokens do not carry tenant/branch/record authorization. This intentionally protects the tenant boundary at the cost of disabling legacy-only screens/media when SaaS data is present. A tenant-aware private media service now handles new organization-scoped uploads and short-lived signed downloads, with active-membership, branch, child/staff linkage and parent photo-consent rechecks on each download. The legacy static media paths remain disabled. Legacy photo/gallery/PDF/video data and existing child/staff screens still need a reviewed migration and end-to-end acceptance tests; external resource URLs remain external. It is not safe to onboard real organizations until all data routes and media types are migrated and their negative isolation tests pass.

The three environment flags are separate operational gates, not proof of safety. They must not be enabled merely to get signup working. Do not record launch approval while any release blocker remains open.

## Access rules

- Use `x-organization-id` to request a tenant context. The middleware verifies that the authenticated user has an active membership for that exact organization.
- Use `x-branch-id` only when a branch-level operation is required. The branch must be active, belong to the selected organization, and be in the user's branch scope unless the membership explicitly grants organization-wide branch access.
- Do not trust organization/branch IDs received in request bodies, query strings or hidden form fields as authorization.
- Use membership roles for SaaS permissions. The legacy `User.role` exists for compatibility and is not a tenant authorization rule.
- Fail closed when membership verification cannot be completed.
- Never remove the legacy safety guard from a module until all reads, writes, lookups, nested references, exports, uploads/downloads and media URLs are tenant-scoped and tested.

## New API endpoints

- `GET /api/organizations/registration-status` — reports whether email-verified onboarding is enabled.
- `POST /api/organizations/signup` — starts an email verification request; creates no user or organization.
- `POST /api/organizations/signup/inspect` — validates a verification token without consuming it.
- `POST /api/organizations/signup/complete` — consumes a verified token and transactionally creates the owner, organization, initial branch, audit record and 14-day trial.
- `POST /api/organizations/register` — retired with HTTP 410 so it cannot bypass email verification.
- `GET /api/organizations/mine` — organization memberships for the authenticated user.
- `GET /api/saas/context` — selected organization, membership and optional selected branch.
- `GET /api/saas/branches` — list branches within the selected organization and membership scope.
- `POST /api/saas/branches` — create a branch for authorized organization/branch administrators; records an audit event.
- `GET /api/saas/members` — organization membership list for owner/head-office administrator.
- `GET /api/saas/audit` — paginated audit history for owner/head-office administrator.

For organization context endpoints, send the authenticated token in `x-auth-token` and selected organization in `x-organization-id`. For branch-level endpoints, also send `x-branch-id`.

## Added in the core operations milestone

- Tenant-scoped class configuration is branch-specific. Class names and codes are stable identifiers; fee default, frequency, capacity, age range and description can be updated by organization/branch administrators.
- Owner, head-office and permitted branch administrators can invite staff with explicit branch scope; teacher invitations must include classes configured in every selected branch.
- Existing staff membership roles, active/suspended status, branch access and teacher class assignments can be changed through an audited permission workflow. Branch administrators see/manage only members whose entire branch scope is within their own; parent membership family links cannot be edited from the staff permissions screen. Owner transfer and permanent membership deletion require separate workflows.
- Parent invitations require an existing guardian record whose email matches the invitation and carry the exact selected guardian IDs into the parent membership.
- Organization/branch school notices have a separate tenant-scoped model and API. Parent visibility is limited to branches with current ChildGuardian links for the membership’s guardian IDs; staff-only and parent-only audiences are filtered server-side. Notice creation, editing and archival write audit events.
- Invitation secrets are random one-time tokens; only token hashes are stored. Links expire after 72 hours, can be revoked, and accepted links are recorded in audit events.
- Parent portal reads only children linked through the invitation's guardian IDs. Parent fee records are shown only for linked contacts designated as billing contacts. Teacher roster and attendance APIs are restricted to assigned classes and do not include family contact details.
- Fee invoices and transaction ledger entries store amounts as integer paise. Payments and refunds are immutable entries; an invoice write lock serializes concurrent ledger updates before balance validation.
- Tenant attendance and fee-transaction CSV exports require branch context, enforce role/class/date-range limits, revalidate child/invoice links in the same organization and branch, neutralize spreadsheet formula input, and write a `report.exported` audit event.

These workflows have automated unit/syntax/build checks, but the parent invitation and attendance/finance workflows still need isolated MongoDB integration tests using organizations A and B. Parent/guardian identity verification and real-world acceptance testing remain release gates.

## Tenant-aware private media foundation

New SaaS uploads go to a private directory scoped by organization ID and branch ID. There are no static URLs for these files. The initial service supports child photos, staff photos, gallery images, learning PDFs and learning videos, generates server-side filenames, checks the declared file category and basic file signatures, and records an audit event for uploads and archives.

- \`GET /api/saas/media?category=child_photo\` lists media the active member can read.
- \`POST /api/saas/media/upload/child_photo?childId=...&parentVisible=false\` uploads a child photo using multipart field \`file\`. Authorized admins/admissions staff can upload.
- \`GET /api/saas/media/:assetId/url\` returns a fresh link that lasts 120 seconds.
- \`PATCH /api/saas/media/:assetId/archive\` archives an item and disables its links.

Other category names are \`staff_photo\`, \`gallery_image\`, \`learning_pdf\`, and \`learning_video\`. Their uploads require a branch context and the corresponding role permission. Staff profiles must exist before their staff photo can be uploaded.

The staff workspace now includes a **Media library** tab for private gallery photos, learning PDFs and learning videos. Authorized owners, head-office administrators, branch administrators and admissions staff can upload these resources. Authorized teachers and transport staff can view role-appropriate learning resources. Archiving requires a selected branch, a permitted administrative role and a reason; it is a soft archive with an audit event.

Set \`PRIVATE_MEDIA_SECRET\` to a different strong random secret of at least 32 characters; do not reuse \`JWT_SECRET\`. Set \`API_PUBLIC_URL\` to the canonical API HTTPS origin used by browsers to retrieve signed links. A missing or weak media secret fails closed with a configuration error.

A parent can see only a linked child's photo when the photo asset is marked \`parent_with_photo_consent\` and a current \`ChildGuardian\` relationship records \`photoUse=granted\`. The server rechecks membership, branch assignment, child linkage, active asset state and the consent record at every download, so an already-issued link stops working after suspension, consent withdrawal or archive. A consent control in the child admission form must reflect the actual consent process; checking a box is an operator record, not proof of a real-world consent event.

This is a first tenant-private media slice, not completion of the migration. Existing legacy photo and resource records/files are not automatically copied into the new collection. The service does not perform antivirus scanning, image moderation or file content decoding; its signature check is a baseline validation only. Before enabling public signup, test every media category with a MongoDB replica-set integration suite, migrate existing files in a reviewed plan, verify backup/restore, and complete privacy acceptance checks.

## Tenant calendar

The SaaS workspace adds a branch-scoped calendar with these endpoints:

- GET /api/saas/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD lists active events in a validated date range of up to 366 days.
- Authorized calendar managers may add includeCancelled=true to review cancelled events.
- POST /api/saas/calendar creates an event for the selected branch.
- PUT /api/saas/calendar/:id updates an event in the selected branch.
- PATCH /api/saas/calendar/:id/status cancels or restores an event without deleting its history.

Supported event types include holidays, school events, meetings, trips, birthdays and deadlines. Read visibility is limited by organization, active branch membership, role-based audience and (for parents) branches connected to verified guardian links. Only organization owners, head-office administrators and branch administrators can manage events. Creation, updates, cancellations and restorations generate audit events.

## Child arrival and authorized pickup

The tenant workspace also exposes a branch-scoped safety log:

- GET /api/saas/handover/children returns the selected branch roster, current on-premises state, and guardian links with pickup permissions.
- GET /api/saas/handover?from=YYYY-MM-DD&to=YYYY-MM-DD returns a maximum 31-day history. Parent accounts see only their linked children and a reduced response that excludes staff notes and names from refused attempts.
- POST /api/saas/handover/check-in records arrival from a linked family contact, school transport, or another recorded arrangement.
- POST /api/saas/handover/check-out records pickup only when the child is on the premises, the selected guardian is linked to that child and marked authorized for pickup, and staff confirm identity verification.

Arrival/pickup events are immutable. The child's current presence state is updated in a MongoDB transaction, and refused attempts are retained with an audit event but do not change presence state. Repeated check-ins and attempts to release a child who is not recorded as present are refused. There are no dedicated government-ID fields or ID uploads in this workflow. Common long-number patterns (including 12-digit, grouped 4-4-4 and PAN-shaped values) are rejected in names and staff notes, but this is not a general-purpose identity-document scanner; staff must not put identity-document details into free text. The school must still follow its own documented safeguarding and identity-verification policy; this software feature is a recordkeeping control, not a substitute for in-person judgment or staff training.

## Tenant teacher work reports

The tenant workspace includes a branch-scoped daily teaching report workflow:

- GET /api/saas/work-reports?from=YYYY-MM-DD&to=YYYY-MM-DD lists the user's own reports for teachers or reports in the selected branch for authorized managers. The date range is limited to 92 inclusive calendar days.
- POST /api/saas/work-reports lets a teacher submit one report per assigned class and date, including the subject/activity, start/end time, teaching summary and number of children present.
- PUT /api/saas/work-reports/:id lets the original teacher revise a report while it is submitted or has a follow-up request. Report date/class are fixed, revisions are counted, and the current enrollment snapshot caps the student count.
- PATCH /api/saas/work-reports/:id/review lets organization owners, head-office administrators and branch administrators mark a submitted report reviewed or request follow-up with a note.

Teacher access is limited to assigned classes, the authenticated teacher's own reports and the selected organization/branch. Managers review reports inside their permitted branch scope. A reviewed report is locked; a report sent back for follow-up may be corrected and resubmitted, preserving the previous review history. Creation, revisions and reviews write audit events. Report times and student counts are validated server-side; report dates cannot be in the future and teacher backdating is limited to seven days.

## Read-only legacy migration preflight

Before designing a write-enabled migration, run the new diagnostic against a staging copy or backup using a **read-only MongoDB account**:

```bash
cd backend
npm run migration:preflight
npm run migration:preflight -- --json
npm run migration:preflight -- --strict
```

Set `MONGO_URI` in `backend/.env` or the shell environment. The command disables Mongoose auto-index and auto-create behavior before loading models and only performs projected `find` queries. It does not insert, update, delete, create collections, create indexes, create organizations/branches, or change the source data. Its report says `PREFLIGHT_ONLY` and always leaves `automaticMigrationAllowed: false`.

The report includes counts for organization/branch scope, duplicate student identifiers, invalid/missing child references in attendance, attendance/class mismatches, fee-to-child matching, fee/payment-history reconciliation, invalid payment dates/amounts, discounts and remaining balances, and legacy records that need an explicit ownership decision. Issue examples contain truncated internal record references, not student names, emails, phone numbers or other family contact details.

Use `--json` for a machine-readable report. `--strict` returns exit code `2` if findings block review. An optional explicit mapping manifest can validate a target and produce a read-only plan:

```bash
cp ../docs/legacy-migration-manifest.example.json ./legacy-migration-manifest.json
# Edit the copied manifest locally and verify all IDs and confirmations.
npm run migration:preflight -- --manifest ./legacy-migration-manifest.json --json
```

A manifest must specify one active organization and one active branch belonging to that organization. Collection decisions are explicit: `legacy_unscoped` selects only rows where both tenant IDs are absent; `skip` leaves that collection unchanged. Partially scoped rows block the plan and must be reconciled separately. Attendance references and fee admission numbers must resolve within the selected legacy child cohort. The destination branch must already have active class records matching each migrated class.

This first pass permits only students, attendance and fees to be planned. Staff profiles and user accounts require verified identity mapping; guardian relationships require in-person/known-contact verification and consent review; reports, calendars and media need their own ownership/authorization plan, so the example keeps them at `skip`. A manifest's confirmation fields are operator attestations, not independently verified facts.

A clean review plan still does **not** authorize migration: financial totals must be reconciled, private media migrated, and backup/restore plus post-migration isolation tests signed off. This remains a no-write diagnostic and does not change either self-service registration gate.

Never run this command with a write-capable production database account for the first audit. Do not point automated tests at a live school database.

## Next implementation gates (in order)

1. Establish baseline integration tests using an isolated MongoDB replica set and seeded organizations A and B.
2. Decide/document the legacy data migration strategy and idempotent migration script; back up and reconcile before execution.
3. Scope students, guardians, classes, attendance, fees/transactions, announcements, reports, teachers/users and related nested references to `organizationId` and `branchId`.
4. Introduce parent/guardian identity and relationships, consent lifecycle and purpose/retention controls.
5. Complete organization-aware media authorization for child/guardian photos, staff photos, gallery images, PDFs and videos. The current 120-second legacy-admin signed links are transitional; migrate the files to private storage and bind each download to the caller's membership, branch and record scope.
6. Add session-wide revocation and an audited owner-transfer workflow; verify effective suspension behavior with multi-session integration tests.
7. Add signup/login onboarding, organization/branch switcher and the first owner/branch workspace.
8. Add tenant-negative tests for each endpoint (tenant A cannot read, change, enumerate, export or download tenant B resources).
9. Test backup restoration, audit-event completeness, financial reconciliation and representative user workflows.
10. Enable registration only after review sign-off for every gate above.

## Automated tenant-isolation coverage

The CI workflow now runs a separate HTTP integration suite against a disposable MongoDB replica set. It verifies that:

- Organization A cannot enumerate or open organization B's children or invoices through the tenant operations API.
- A branch-limited staff membership cannot select an unassigned branch.
- A parent sees only children connected through the membership's guardian IDs and only invoices where the linked guardian is a billing contact.
- Tenant memberships are denied access to legacy single-school APIs that have not been migrated.
- Two concurrent payments cannot both consume the same invoice balance beyond the invoice total.

These checks are an important baseline, not proof that every API or media path is isolated. Additional integration cases are still required for invitation lifecycle, staff-permission changes, CSV exports, notices, calendar, handover, work reports, private file delivery, data migration, and backup restoration before enabling public registration.

To run the suite locally, use a **disposable replica set** and set `MONGO_INTEGRATION_URI`, then run `npm run test:integration` from `backend/`. Never target production or a database containing real school information.

## Release blockers

- Any cross-tenant or cross-branch data access.
- Any public or unprotected delivery path for private child or family information.
- Any financial total that cannot be reconciled to its source records.
- Missing audit trail for privileged account, membership, permission, fee adjustment, refund, export or branch lifecycle actions.
- An untested data migration or an unverified backup restore.
- A platform support path that can browse tenant content without a reason-coded, time-limited and audited process.


## Guarded legacy tenant migration — staging prototype

A second command, \`npm run migration:tenant\`, now drafts an explicit, bounded migration plan for legacy-unscoped students, attendance and legacy fee rows. It defaults to read-only dry-run behavior. The write path is **staging-only** and requires three environment gates plus explicit CLI confirmations and an active owner/head-office approver. It refuses missing collections/indexes, invalid/partially-scoped rows, class mapping gaps, duplicate admission IDs, attendance date/class collisions, fee/payment reconciliation problems, existing target invoices and plans above its operation cap.

If a staging plan passes, the writer updates student/attendance/legacy fee ownership fields, creates a tenant invoice and immutable payment ledger entries for the legacy fee history, stores original payment date/time provenance, and records a unique migration run plus audit event in a single transaction. The source legacy fee record is retained for reconciliation. It does not migrate staff/user identity, guardians, report cards, calendar, or media, and it does not enable signup. A migrated school's photo/PDF/video resources still must have private tenant-aware media paths before onboarding.

Use this only on a disposable restored staging database. A dry-run example uses the placeholder manifest and therefore should stop with validation errors until replaced by an approved school-specific manifest:

\`\`\`bash
cd backend
npm run migration:tenant -- --manifest ../docs/legacy-migration-manifest.example.json --json
\`\`\`

The explicit apply flags and environment variables are documented in the README. The migration has not been executed against any real school database in this work session. A passing CI suite proves code checks, not a successful migration of your data.


## Explicit legacy staff identity migration

\`npm run migration:staff\` adds a separate dry-run-first migration for existing administrator/teacher login identities. It requires an exact User-ID + email + legacy-role match, explicit target role/branch assignment, configured teacher classes, and (for a copied teacher profile) a matching legacy Teacher ID. Parent portal identities are deliberately excluded from this migration because they must come from the verified guardian invitation/link flow. Organization-owner rights cannot be assigned by a legacy staff import.

Apply is disabled outside an explicitly gated staging environment and requires an active owner/head-office approver with access to every target branch. It creates only tenant memberships and the new \`TenantStaffProfile\` copies; it never modifies passwords or source User/Teacher rows. The membership/profile rows, a unique migration-run ledger entry and audit event are committed in one transaction. The new command and example manifest are documented in the README. This importer has not been run against a real school database and does not unblock public signup.

## Organization and branch settings

The SaaS workspace now includes a role-gated profile editor for organization owners and head-office administrators:

- GET /api/saas/settings/organization reads the selected organization's contact profile and preferences.
- PUT /api/saas/settings/organization validates and saves the organization name, timezone, supported locale, currency, contact email/phone, HTTPS website, postal address, academic-year start month, date format and default language.
- GET /api/saas/settings/branches/:id reads the selected branch's contact profile after verifying organization and branch scope.
- PUT /api/saas/settings/branches/:id validates and saves the branch name, timezone, contact details, HTTPS website and postal address.

The APIs reject unknown fields, validate time zones and internationalized currency codes server-side, require an active organization membership, and write audit events in the same transaction as each successful update. The branch code and lifecycle state are intentionally immutable in the profile editor so historical invoice numbers and branch access are not silently changed. Currency changes are blocked once the organization has any invoice or transaction history, protecting the interpretation of existing financial records.

This is configuration, not a production launch switch. Updating settings does not enable public registration, migrate legacy school data or establish parent identity. Only owner/head-office roles can edit; other authorized workspace members can read the settings. The deployment still needs acceptance testing with the organization's actual time zone, fee policy, print formats, email configuration and backup/restore plan.

## First-run owner setup checklist

The organization owner and head-office administrator workspace now has a "Getting started" guide and an overview reminder. It derives completion from saved organization/branch and school records rather than allowing users to tick items as done.

- `GET /api/saas/operations/onboarding` returns setup progress, required and optional steps, and tab destinations.
- Required essentials: organization contact details, at least one active class, a registered child, saved attendance and a fee invoice.
- Optional steps guide the owner through branch contact details, inviting staff, recording a first payment and connecting a verified parent portal account.
- Only organization owners and head-office administrators can request the organization-level checklist.
- All counts are scoped to the active organization and the caller's permitted branches. The response contains counts and task guidance, not child or family records.
- Progress is recalculated from the current database when the guide is opened or refreshed. A saved record can complete a step; a visual checkbox cannot.

This guide does not activate public registration or replace the remaining launch review. It is a practical workflow aid after an owner has signed in to an organization.

## Child health and emergency profiles

Child health records are stored separately from ordinary child details and are scoped by organization, branch and child.

- `GET /api/saas/operations/children/:id/health` and `PUT /api/saas/operations/children/:id/health` are available only to organization owners, head-office administrators, branch administrators and admissions staff.
- The profile supports allergies and reactions, severity, dietary restrictions, special-care notes, emergency instructions, physician contact details and additional restricted medical notes.
- Every saved change creates an audit event recording the action and changed field names. The event does not copy medical content into the audit log.
- The normal child list, family portal, invoices and reports do not include the full health profile.
- Assigned teachers can see only a classroom-safe summary (allergies, reactions, dietary restrictions, special-care and emergency instructions) for children in their assigned classes. They cannot retrieve physician contacts, medication details or private medical notes through that summary.
- For school-administered medication, the API requires an explicit recorded parent/guardian authorization, dosage and instructions. The software records the school's assertion; it does not independently verify consent or prescribe treatment.
- Schools must follow their own medication policy and applicable law, verify information with families, limit access to necessary staff, and update/delete records according to their retention policy.

This feature does not replace a medical assessment, emergency training, or documented school safeguarding procedures.
