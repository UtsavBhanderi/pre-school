# SaaS tenant foundation and rollout gates

Status: Phase 0 foundation in progress. This is not production-ready multi-tenant access.

## What this foundation introduces

- Organization and branch records with organization-scoped branch identifiers.
- Organization memberships separated from the legacy \`User.role\`, including explicit branch scope.
- A fail-closed tenant-context middleware that validates membership and organization/branch relationships server-side.
- Organization/branch/member/audit read APIs and branch creation with a transaction-backed audit event.
- Organization registration validation and transactional creation of the organization, initial branch, owner membership and registration audit event.
- An explicit default-off registration gate that requires both environment flags:
  - \`ENABLE_SAAS_REGISTRATION=true\`
  - \`SAAS_TENANT_DATA_READY=true\`
- A guard on the existing single-school APIs: a user with an organization membership cannot access an unscoped legacy API.
- Role and validation unit tests.

## Do not enable public registration yet

**Keep both registration environment flags unset or false.** The legacy student, fee, teacher, attendance, reports, notices, calendars, gallery and learning-resource APIs still contain data access that must be migrated to organization/branch-aware queries. The legacy upload folders also include public static media routes. It is not safe to onboard real organizations until those routes and files are covered by access-control checks and negative isolation tests.

The second environment flag is an operational gate, not proof of safety. It must not be enabled merely to get signup working.

## Access rules

- Use \`x-organization-id\` to request a tenant context. The middleware verifies that the authenticated user has an active membership for that exact organization.
- Use \`x-branch-id\` only when a branch-level operation is required. The branch must be active, belong to the selected organization, and be in the user's branch scope unless the membership explicitly grants organization-wide branch access.
- Do not trust organization/branch IDs received in request bodies, query strings or hidden form fields as authorization.
- Use membership roles for SaaS permissions. The legacy \`User.role\` exists for compatibility and is not a tenant authorization rule.
- Fail closed when membership verification cannot be completed.
- Never remove the legacy safety guard from a module until all reads, writes, lookups, nested references, exports, uploads/downloads and media URLs are tenant-scoped and tested.

## New API endpoints

- \`POST /api/organizations/register\` — gated, transactional initial organization/branch/owner registration.
- \`GET /api/organizations/mine\` — organization memberships for the authenticated user.
- \`GET /api/saas/context\` — selected organization, membership and optional selected branch.
- \`GET /api/saas/branches\` — list branches within the selected organization and membership scope.
- \`POST /api/saas/branches\` — create a branch for authorized organization/branch administrators; records an audit event.
- \`GET /api/saas/members\` — organization membership list for owner/head-office administrator.
- \`GET /api/saas/audit\` — paginated audit history for owner/head-office administrator.

For organization context endpoints, send the authenticated token in \`x-auth-token\` and selected organization in \`x-organization-id\`. For branch-level endpoints, also send \`x-branch-id\`.

## Next implementation gates (in order)

1. Establish baseline integration tests using an isolated MongoDB replica set and seeded organizations A and B.
2. Decide/document the legacy data migration strategy and idempotent migration script; back up and reconcile before execution.
3. Scope students, guardians, classes, attendance, fees/transactions, announcements, reports, teachers/users and related nested references to \`organizationId\` and \`branchId\`.
4. Introduce parent/guardian identity and relationships, consent lifecycle and purpose/retention controls.
5. Replace public child/teacher media URLs with private object storage and authorization-aware, short-lived downloads; migrate frontend image handling.
6. Add secure staff invitations/account activation, session revocation and role/branch management UI.
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
