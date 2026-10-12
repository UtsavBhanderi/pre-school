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
- Internal school notices with scheduled visibility, staff targeting, editing and archiving
- Plain-language Start here dashboard, searchable task finder, and step-by-step in-app help
- Printable copies of saved fee payments, with student details and current balance clearly identified


## Multi-tenant SaaS foundation (in progress)

The codebase now includes the first foundation models for organizations, branches, organization memberships and audit events, plus fail-closed tenant-context helpers and organization/branch management API routes.

**This is an implementation milestone, not a production-ready SaaS release.** The existing preschool modules still contain single-school data queries and public static upload URLs. To avoid exposing those records to a tenant account, the legacy API guard denies organization-member accounts access to modules that have not yet been migrated. Self-service organization registration is disabled by default and must remain disabled until the tenant-scoping and private-media rollout checklist passes.

See [the SaaS rollout gates](docs/SAAS_ROLLOUT.md) for endpoints, tenant/branch header rules, migration steps and launch blockers. Do not set the SaaS registration flags to \`true\` just to enable sign-up: both the core data routes and student media need tenant-aware authorization first.

The organization-creation and branch-creation operations use MongoDB transactions. The production database must support transactions (for example, a correctly configured replica set). The next milestones are tenant-scoped core student/attendance/fee records, secure media delivery, a verified legacy-data migration, and cross-tenant negative integration tests.



## Multi-tenant workspace, staff invitations and parent portal

The SaaS branch includes an organization/branch workspace, class-assigned teacher accounts, scoped child and guardian links, attendance, fee invoices and an append-only payment/refund ledger. Organization users enter through the existing sign-in page; active organization membership routes them into the appropriate workspace. Parent accounts land in the separate **Family portal**.

### Inviting staff and parents

From **Team & activity → Invite someone**, an authorized organization owner, head-office administrator or branch administrator can create a one-time invitation. Invitations expire after 72 hours and store only a hash of the invitation token. If SMTP is configured, the link is emailed; otherwise the authorized inviter receives a copyable link to share through a verified channel. Revoke pending invitations from the same screen.

Optional backend variables for SMTP are documented in \`backend/.env.example\`: \`SMTP_HOST\`, \`SMTP_PORT\`, \`SMTP_SECURE\`, \`EMAIL_FROM\`, \`EMAIL_USER\`, and \`EMAIL_PASS\`. Set \`FRONTEND_URL\` to the exact public frontend origin so invitation links point to the deployed site. Never put real credentials in the repository.

Teacher invitations require one or more assigned classes and active branch access. Parent invitations require selecting existing guardian contacts whose saved email matches the invitation email. Parent access is derived only from those guardian links: the family portal reads linked children, authorized attendance history, and fee invoices where that guardian is explicitly marked as the billing contact. Parents cannot create invoices, mark attendance, or see another family's record through these endpoints.

The parent portal does not currently process online payments or send notices by WhatsApp/SMS. SMTP invitation delivery is optional and does not imply other messaging integrations.

**Production caveat:** this feature set still needs end-to-end integration tests against a replica-set MongoDB, private delivery for existing uploaded child media, migration of legacy school records into verified organization/branch scopes, backup/restore validation, and a real-school workflow review. Keep public organization registration disabled until every gate in [the SaaS rollout checklist](docs/SAAS_ROLLOUT.md) is signed off.


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

From `frontend/`:

```bash
npm run build
```

GitHub Actions also runs backend JavaScript syntax checks, backend unit tests, and a frontend production build on pushes to the maintenance branch and pull requests to `main`.

## Important deployment notes

- Keep `.env` files, JWT secrets, mail credentials, and real student data out of Git.
- Restrict MongoDB network access and create regular database/file-upload backups.
- Set `FRONTEND_ORIGIN` to the deployed frontend origin. Set `VITE_API_BASE_URL` to the API origin when frontend and API are hosted separately; if both are served from the same origin, the frontend can leave it unset. In local development, copy `frontend/.env.example` to `frontend/.env.local` to use `http://localhost:5000`.
- The backend protects administrative API groups by role. Uploaded media currently uses public static URLs so the frontend can render those files; review whether student/parent photos require authenticated media delivery for your school's privacy policy.
- Review the configured class fee schedule against the school's current approved fee policy before relying on fee balances.
- Review the notice board, printable fee receipt, date-corrected attendance and staff permissions in the actual hosting environment before production rollout.
- Uploaded student and teacher photos currently use public static URLs; assess authenticated media delivery against the school's student privacy policy before using real family records.
