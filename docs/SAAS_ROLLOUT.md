# SaaS tenant foundation and rollout gates

Status: Phase 0 foundation in progress. This is not production-ready multi-tenant access.

## What this foundation introduces

- Organization and branch records with organization-scoped branch identifiers.
- Organization memberships separated from the legacy `User.role`, including explicit branch scope.
- A fail-closed tenant-context middleware that validates membership and organization/branch relationships server-side.
- Organization/branch/member/audit read APIs and branch creation with a transaction-backed audit event.
- Organization registration validation and transactional creation of the organization, initial branch, owner membership and registration audit event.
- An explicit default-off registration gate that requires both environment flags:
  - `ENABLE_SAAS_REGISTRATION=true`
  - `SAAS_TENANT_DATA_READY=true`
- A guard on the existing single-school APIs: a user with an organization membership cannot access an unscoped legacy API.
- Role and validation unit tests.

## Do not enable public registration yet

**Keep both registration environment flags unset or false.** The legacy student, fee, teacher, attendance, reports, notices, calendars, gallery and learning-resource APIs still contain data access that must be migrated to organization/branch-aware queries. The direct static mounts for local student/teacher photos, gallery images, PDFs and videos have been removed; the existing legacy admin APIs now issue short-lived signed links for those local files. Those transitional links still use the legacy single-school administrator boundary, not organization/branch permissions. Externally hosted resource URLs remain external. It is not safe to onboard real organizations until all data routes and media paths are tenant-aware and negative isolation tests pass.

The second environment flag is an operational gate, not proof of safety. It must not be enabled merely to get signup working.

## Access rules

- Use `x-organization-id` to request a tenant context. The middleware verifies that the authenticated user has an active membership for that exact organization.
- Use `x-branch-id` only when a branch-level operation is required. The branch must be active, belong to the selected organization, and be in the user's branch scope unless the membership explicitly grants organization-wide branch access.
- Do not trust organization/branch IDs received in request bodies, query strings or hidden form fields as authorization.
- Use membership roles for SaaS permissions. The legacy `User.role` exists for compatibility and is not a tenant authorization rule.
- Fail closed when membership verification cannot be completed.
- Never remove the legacy safety guard from a module until all reads, writes, lookups, nested references, exports, uploads/downloads and media URLs are tenant-scoped and tested.

## New API endpoints

- `POST /api/organizations/register` — gated, transactional initial organization/branch/owner registration.
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

## Release blockers

- Any cross-tenant or cross-branch data access.
- Any public or unprotected delivery path for private child or family information.
- Any financial total that cannot be reconciled to its source records.
- Missing audit trail for privileged account, membership, permission, fee adjustment, refund, export or branch lifecycle actions.
- An untested data migration or an unverified backup restore.
- A platform support path that can browse tenant content without a reason-coded, time-limited and audited process.
