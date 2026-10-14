# Pre-School Management System

A React/Vite and Node.js/Express application backed by MongoDB for common preschool administration workflows.

## Main modules

- Administrator and teacher login, with JWT-based sessions and role-specific frontend routes
- Student and teacher records, including family/contact details and photo uploads
- Date- and class-based student attendance with absence reasons
- Fee records, payment history, discounts, and collection summaries
- Subject setup, assessment marks, report cards, printing, and spreadsheet exports
- School calendar, student/teacher birthdays, gallery, PDF/video learning resources
- Teacher daily-work reports and student report-document generation
- Tenant-scoped teacher work reports with class assignment checks, administrator review, follow-up notes and locked review history
- Organization and branch profile settings with timezone, language, date preferences, contact details and guarded currency changes
- First-run owner setup guide that tracks actual saved classes, child records, attendance and fees
- Private child health and emergency profiles with role-limited classroom safety summaries and audited updates
- Internal school notices with scheduled visibility, staff targeting, editing and archiving
- Organization/branch-scoped school calendar with holidays, trips, meetings, staff/parent audiences, cancellation history and audit entries
- Tenant-private media library for gallery photos, learning PDFs and learning videos, plus consent-gated child-photo previews in the family portal
- Child arrival and authorized pickup register with transactional presence state, ID-check confirmation, refusal logging and family-safe history
- Plain-language Start here dashboard, searchable task finder, and step-by-step in-app help
- Printable copies of saved fee payments, with student details and current balance clearly identified


## Password recovery

The sign-in page includes a forgot-password workflow. Reset links contain a random secret in the URL fragment, store only its SHA-256 hash on the user record, expire after 30 minutes and can be used once. Completing a reset increments \`authVersion\`, invalidating older JWT sessions. Responses do not disclose whether an email address belongs to an account.

Configure outbound mail before expecting recovery emails:

- \`SMTP_HOST\`, \`SMTP_PORT\` and \`SMTP_SECURE\`
- \`EMAIL_USER\`, \`EMAIL_PASS\` and optionally \`EMAIL_FROM\`
- \`FRONTEND_URL\` set to the public frontend origin (not the API origin)

If email is not configured or delivery fails, the API deliberately does not reveal the reset token in a response. Configure and verify SMTP before production use. A password-reset request does not automatically change any organization's or branch permissions.

For database-backed end-to-end verification, run \`npm run test:integration\` with \`MONGO_INTEGRATION_URI\` pointed at a **disposable MongoDB replica set**. The password reset integration test verifies one-time use and old-session revocation.

## Verified preschool onboarding

The public registration flow is now two-step:

1. \`POST /api/organizations/signup\` validates the organization, first branch, owner and email. It sends a one-time verification link; it does not create a user or organization.
2. \`POST /api/organizations/signup/inspect\` checks the token without changing data.
3. \`POST /api/organizations/signup/complete\` accepts a verified token plus the owner's new password and transactionally creates the user, organization, first branch, owner membership, audit event and a 14-day trial.

Verification tokens are stored as hashes, expire after 24 hours, and can only be consumed once. The former \`POST /api/organizations/register\` endpoint is retired and returns \`410\` so it cannot bypass email verification. \`GET /api/organizations/registration-status\` tells the signup UI whether onboarding is available.

**Public onboarding remains disabled by default.** It opens only when both \`ENABLE_SAAS_REGISTRATION=true\` and \`SAAS_TENANT_DATA_READY=true\` are set, plus valid JWT configuration, SMTP credentials and a canonical frontend URL. Do not turn these on until the remaining data migration, child-media privacy and cross-tenant release gates in [docs/SAAS_ROLLOUT.md](docs/SAAS_ROLLOUT.md) are signed off.

## Multi-tenant SaaS foundation (in progress)

The codebase now includes the first foundation models for organizations, branches, organization memberships and audit events, plus fail-closed tenant-context helpers and organization/branch management API routes.

**This is an implementation milestone, not a production-ready SaaS release.** The legacy preschool APIs still contain single-school data queries and are not yet organization/branch-safe. Local child/staff photos, gallery images, PDFs and videos are not served as public static folders. A new tenant-private media service supports organization/branch-scoped uploads, short-lived signed links, live membership checks and parent photo-consent checks; existing legacy media still needs a reviewed migration, and each media category needs integration/acceptance testing. The legacy API guard denies organization-member accounts access to modules that have not yet been migrated. Self-service organization registration is disabled by default and must remain disabled until the tenant-scoping, legacy-data migration and private-media rollout checklist passes.

See [the SaaS rollout gates](docs/SAAS_ROLLOUT.md) for endpoints, tenant/branch header rules, migration steps and launch blockers. Do not set the SaaS registration flags to `true` just to enable sign-up: both the core data routes and student media need tenant-aware authorization first.

Organization creation, branch creation, tenant child/guardian registration, attendance, fee transactions, calendar events, handover state changes and teacher work-report submissions/reviews use MongoDB transactions. The production database must support transactions (for example, a correctly configured replica set). Remaining launch gates include organization-aware migration of legacy data routes, private-media authorization tied to tenant/branch membership, integration tests across two organizations, and a verified backup/restore and data-migration plan.



## Multi-tenant workspace, staff invitations and parent portal

The SaaS branch includes an organization/branch workspace, class-assigned teacher accounts, scoped child and guardian links, attendance, fee invoices and an append-only payment/refund ledger. Organization users enter through the existing sign-in page; active organization membership routes them into the appropriate workspace. Parent accounts land in the separate **Family portal**.

### Inviting staff and parents

From **Team & activity → Invite someone**, an authorized organization owner, head-office administrator or branch administrator can create a one-time invitation. Invitations expire after 72 hours and store only a hash of the invitation token. If SMTP is configured, the link is emailed; otherwise the authorized inviter receives a copyable link to share through a verified channel. Revoke pending invitations from the same screen.

Optional backend variables for SMTP are documented in `backend/.env.example`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `EMAIL_FROM`, `EMAIL_USER`, and `EMAIL_PASS`. Set `FRONTEND_URL` to the exact public frontend origin so invitation links point to the deployed site. Never put real credentials in the repository.

Teacher invitations require one or more assigned classes and active branch access. Parent invitations require selecting existing guardian contacts whose saved email matches the invitation email. Parent access is derived only from those guardian links: the family portal reads linked children, authorized attendance history, and fee invoices where that guardian is explicitly marked as the billing contact. Parents cannot create invoices, mark attendance, or see another family's record through these endpoints.

The parent portal does not currently process online payments or send notices by WhatsApp/SMS. SMTP invitation delivery is optional and does not imply other messaging integrations.

**Production caveat:** this feature set still needs end-to-end integration tests against a replica-set MongoDB, private delivery for existing uploaded child media, migration of legacy school records into verified organization/branch scopes, backup/restore validation, and a real-school workflow review. Keep public organization registration disabled until every gate in [the SaaS rollout checklist](docs/SAAS_ROLLOUT.md) is signed off.



### SaaS workspace capabilities in progress

Tenant fee history now supports printing a saved payment or refund receipt. Each copy shows its unique receipt number, transaction details, invoice reference, child/branch identification, and the current balance with an explicit note that later transactions may affect that balance. It never fabricates a receipt for a payment that was not saved.

The organization workspace now has tenant-scoped child/guardian registration, daily attendance, fee invoices and payment/refund ledger records, branch management, branch-specific class setup and default tuition, staff/parent invitations, audited role/branch/class assignment and suspension controls, printable saved-transaction receipts, and a read-only parent portal. Roles and branch access are checked on the server; teacher access is limited to assigned classes, and parent views are derived from exact guardian-child links. Parent access remains tied to its verified guardian records. School notices are scoped to organization and branch, can be scheduled and archived, and can target everyone, staff, or linked parents. The notice board is portal-only and does not send WhatsApp, SMS, or email. The tenant workspace also provides audited CSV exports for date-filtered attendance and fee transactions, with server-side branch/role checks and spreadsheet formula protection.

This is a staged rollout, not a claim that all legacy features are tenant-safe. Public self-service organization registration remains disabled. The older single-school routes, exports, notices, learning resources and public upload URLs still require organization-aware migration and private media delivery before multiple paying schools can use the platform safely. Review [the rollout gates](docs/SAAS_ROLLOUT.md) before any production onboarding.

Invitation email is optional. To send invitations automatically, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` and `FRONTEND_URL`. If email delivery is not available, the authorized inviter is shown the single-use invitation URL to share through a verified channel. Invitation links expire after 72 hours.



## Private school media delivery

Legacy student/guardian photos, teacher photos, gallery images, uploaded PDFs and uploaded videos are no longer served from direct public `/uploads/...` static paths. The existing authenticated legacy admin APIs return short-lived signed resource links so current management screens can display the files. Links expire after two minutes, accept only approved file extensions, and stop working if the backing record no longer references the file. The API response layer signs a copy of returned data; saved paths in MongoDB are not rewritten.

Set `API_PUBLIC_URL` to the canonical, externally reachable API origin (for example, `https://api.yourschool.example`) when deploying behind a proxy or using separate frontend/API hosts. Keep `JWT_SECRET` strong and private. Test photo uploads, PDF opening, video playback/seek, print/report views and link expiry on the real HTTPS deployment before release.

This milestone still uses the legacy school's administrator access model for gallery and resource files; it is not a substitute for organization/branch authorization. Parent/tenant workspace photo uploads and organization-aware private media are a later step. External learning-resource URLs remain external URLs and are not proxied by this server. Public organization sign-up must remain disabled until all legacy data/API paths and all child-related media have organization-level authorization and tenant-isolation tests.


## Requirements

- Node.js 20 or newer
- npm
- A running MongoDB instance or a MongoDB connection string

## Local setup

### 1. Start the API

```bash
cd backend
npm ci
```

Copy `.env.example` to `.env` and set at least:

- `MONGO_URI`: your MongoDB connection string
- `JWT_SECRET`: a long, random value that is kept private
- `PORT`: optional; defaults to `5000`
- `FRONTEND_ORIGIN`: your frontend origin; defaults to `http://localhost:5173`

To create the first administrator automatically, configure `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD` together before the first start. Use a strong password. The bootstrap process skips creation if an administrator already exists. Remove these values from the runtime environment after initial setup.

Then run:

```bash
npm start
```

The API health endpoint is available at `http://localhost:5000/api/health`.

For tenant-private media links, configure `PRIVATE_MEDIA_SECRET` with a different strong random secret of at least 32 characters; do not reuse `JWT_SECRET`. Set `API_PUBLIC_URL` to the canonical API origin. Keep both SaaS onboarding flags disabled until the rollout checklist passes.

### 2. Start the frontend

In another terminal:

```bash
cd frontend
npm ci
```

Copy `.env.example` to `.env.local`. Set `VITE_API_BASE_URL` to the API origin, for example `http://localhost:5000`.

Then run:

```bash
npm run dev
```

Vite prints the local frontend URL after the development server starts.

## Validation

From `backend/`:

```bash
npm test
```

For a local integration run, configure `MONGO_INTEGRATION_URI` to a **disposable MongoDB replica set** and run:

```bash
npm run test:integration
```

Never point this suite at production or a database containing real school data. The suite creates and removes tagged test records.

### Read-only legacy migration preflight

The migration preflight reviews the legacy student, attendance, fee, teacher and related collections for scope gaps, broken references and financial inconsistencies. It does not modify records or assign them to an organization.

Run it from `backend/` against a **staging copy or backup using a read-only MongoDB account**:

```bash
npm run migration:preflight
npm run migration:preflight -- --json
npm run migration:preflight -- --strict
```

Configure `MONGO_URI` in `backend/.env` or the shell environment. The default report is human-readable; `--json` produces a machine-readable report; `--strict` returns exit code `2` when findings block the review.

An optional explicit mapping manifest can be supplied to validate the target organization/branch and produce a no-write review plan:

```bash
cp ../docs/legacy-migration-manifest.example.json ./legacy-migration-manifest.json
# Edit the copied file locally: replace IDs/label and affirm each confirmation only after verification.
npm run migration:preflight -- --manifest ./legacy-migration-manifest.json --json
```

The manifest maps only records whose `organizationId` and `branchId` are both missing. It refuses partially scoped records, requires attendance and fee rows to resolve to selected child records, checks active target classes, and requires the target branch to belong to the selected organization. Teachers, user accounts, guardian links, reports, calendar events and media must stay `skip` until their separate identity/consent/media workflows are approved. Keep a real mapping manifest local; never commit real school IDs or student details.

The report intentionally omits names, email addresses and phone numbers; issue examples use short internal record references. **This is a diagnostic/review plan only, never a migration script, and it always reports automatic migration as disabled.** Take and verify a backup before any later migration tooling is run.

From `frontend/`:

```bash
npm run build
```

GitHub Actions runs backend syntax checks and unit tests, the tenant-isolation HTTP integration suite against a disposable MongoDB replica set, and the frontend production build for feature branches and pull requests to `main`.

## Important deployment notes

- Keep `.env` files, JWT secrets, mail credentials, and real student data out of Git.
- Restrict MongoDB network access and create regular database/file-upload backups.
- Set `FRONTEND_ORIGIN` to the deployed frontend origin. Set `VITE_API_BASE_URL` to the API origin when frontend and API are hosted separately; if both are served from the same origin, the frontend can leave it unset. In local development, copy `frontend/.env.example` to `frontend/.env.local` to use `http://localhost:5000`.
- Local photos, gallery images, PDFs and videos are not served from public static upload folders. Legacy signed-media links and all unscoped legacy API routes are now disabled whenever any SaaS organization exists in the database. Tenant-aware private media delivery is still a launch requirement; do not enable public SaaS registration until it is implemented and tested.
- Review the configured class fee schedule against the school's current approved fee policy before relying on fee balances.
- Review the notice board, printable fee receipt, date-corrected attendance and staff permissions in the actual hosting environment before production rollout.

## Guarded legacy data migration (staging only)

The new \`npm run migration:tenant\` command defaults to a **dry run**. It reads an explicit JSON manifest, audits the current source and target, and prints bounded counts/blocker codes. It never creates collections/indexes in dry-run mode. The first supported write migration is intentionally limited to the selected legacy-unscoped student, attendance and fee collections; staff identity, guardians, report cards, calendar events and uploaded media remain out of scope.

The write path is deliberately unavailable in development/production. It requires all of the following in a **disposable, restored staging environment**:

- \`NODE_ENV=staging\`
- \`SAAS_MIGRATION_ENV=staging\`
- \`ALLOW_LEGACY_TENANT_MIGRATION=true\`
- explicit \`--apply\`, \`--manifest\`, \`--confirm-source-label\`, \`--confirm-organization\`, \`--confirm-branch\`, \`--approved-by\`, and \`--change-ticket\` CLI arguments
- a valid manifest with ownership, staging backup/restore and fee-ledger review confirmations
- an active organization owner or head-office approver, a transaction-capable MongoDB replica set, already-provisioned required collections/unique indexes, a clean data-quality review, no destination attendance/invoice collisions, and no more than 2,500 planned database operations by default

Example dry run:

\`\`\`bash
cd backend
npm run migration:tenant -- --manifest ../docs/legacy-migration-manifest.example.json --json
\`\`\`

The example manifest intentionally contains placeholder identifiers and false confirmations, so it should fail validation until an authorized school-specific manifest is reviewed. Do not copy a production database URI into command history or put credentials in the manifest.

The planner preserves the original student, attendance and legacy fee source records, scopes selected source rows to one explicit organization/branch, creates a corresponding invoice and immutable history entries for positive legacy payments, and stores the source fee ID plus original payment date/time on imported ledger entries. The financial preflight must reconcile payment history, discount, paid and remaining amounts before this can pass. Attendance dates are normalized to a UTC day boundary; legacy payment dates use the branch time zone, while the original date/time text is stored separately because the legacy time zone was not recorded.

A write attempt is one MongoDB transaction and is capped to keep the first migration bounded. It records a unique migration-run fingerprint plus an audit event. If validation, an index check, a concurrent-source check, a duplicate key or any write fails, the transaction is aborted. The tool will not silently create missing indexes or choose tenant ownership from names, email addresses or class labels.

After an approved staging apply, rerun the read-only preflight and compare source versus destination counts, attendance rows and financial ledgers. Test the entire school workflow against organizations A and B before any production migration is approved. This staging-only runner is not permission to enable public registration and does not migrate private media; the SaaS registration flags must remain disabled until all remaining migration and privacy gates are reviewed.


## Verified legacy staff migration (staging only)

Legacy account access must be mapped manually. The new \`npm run migration:staff\` command links existing account IDs to organization memberships and optionally copies an existing teacher profile into the new tenant-scoped \`TenantStaffProfile\` collection. It never creates or merges login accounts, changes passwords, promotes a legacy admin to organization owner, or turns a legacy student login into a parent portal account.

Start with a school-owner reviewed manifest based on \`docs/legacy-staff-identity-manifest.example.json\`. It contains exact User IDs, the exact verified email and legacy role, the target tenant role, an explicit list of branch IDs, teacher class assignments, and an optional source Teacher-profile ID. The mapping must confirm that the school owns the source data, the backup has been restored in staging, each staff identity was verified, and class assignments were reviewed. The tool never prints the submitted email addresses.

Dry run:

\`\`\`bash
cd backend
npm run migration:staff -- --manifest ../docs/legacy-staff-identity-manifest.example.json --json
\`\`\`

For apply, use a disposable restored staging database only. Both \`NODE_ENV=staging\` and \`SAAS_MIGRATION_ENV=staging\` plus \`ALLOW_LEGACY_STAFF_MIGRATION=true\` are required, along with \`--apply\`, exact source-label/organization/primary-branch confirmations, an active organization owner or head-office approver with access to every target branch, and a change-ticket ID. The required collections and unique indexes must already exist. Each imported membership has \`accessAllBranches=false\`; branch and class scope comes only from the reviewed manifest.

The write path is a single MongoDB transaction that creates the mapped memberships, tenant-scoped teacher profile copies (if explicitly mapped), a unique migration-run record and an audit event. Source User credentials and Teacher records are not modified. Repeated plans are treated as a no-op when the exact requested scope is already present. If any identity, role, email, branch, teacher-profile or class configuration does not match, the plan is blocked instead of guessing.

Do not enable public registration merely because this command passes. Existing report cards, resources, private media, and any unmapped identities still need their own reviewed migration paths and tenant-isolation tests.


## Encrypted backup and restore rehearsal

A guarded backup/restore toolkit is documented in [the MongoDB backup and restore runbook](docs/MONGO_BACKUP_RESTORE.md). It encrypts database archives using age, records checksums and metadata, and permits restore only to an explicitly approved restore_test_* database on a different MongoDB endpoint. Use an approved secret manager, encrypted off-host storage, a dedicated staging deployment and the documented acceptance checklist. These scripts are operational aids; they do not make a database production-ready or enable self-service registration.
