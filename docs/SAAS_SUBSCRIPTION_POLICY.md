# SaaS subscription lifecycle and capacity policy

Status: server-enforced initial policy. There is no payment gateway or self-service plan change in this build.

## Initial capacity defaults

These are product defaults to test implementation behaviour. They are not prices, a service-level promise, or final commercial terms. Confirm the limits before publicly opening sign-up.

| Plan | Branches | Children | Staff seats |
|---|---:|---:|---:|
| Trial | 1 | 100 | 10 |
| Starter | 1 | 250 | 20 |
| Growth | 5 | 1,500 | 100 |
| Group | 25 | 15,000 | 500 |

A staff seat counts active non-parent memberships and pending, unexpired staff invitations. Parent portal memberships do not consume staff seats. Children are counted across the organization. Closed branches do not consume a branch seat.

## Trial lifecycle

- New email-verified organizations receive a 14-day trial ending at the recorded \`subscription.trialEndsAt\`.
- A legacy trial record without an explicit deadline uses \`createdAt + 14 days\`, rather than receiving an indefinite trial.
- Trial, active, past-due, suspended, cancelled and expired-trial states are evaluated by the server.
- Active subscriptions and non-expired trials can make changes.
- An expired trial, past-due, suspended or cancelled subscription is read-only: existing records remain available for review, but tenant-scoped mutations return HTTP 402 with a machine-readable \`SUBSCRIPTION_READ_ONLY\` code.
- Reads remain available so an organization can retain access to its records while an operator resolves billing. An organization separately marked \`status: suspended\` remains unavailable under the existing organization-access policy.

## Read-only security maintenance

An expired trial, past-due, suspended or cancelled subscription blocks ordinary tenant-scoped mutations with HTTP 402 and the \`SUBSCRIPTION_READ_ONLY\` code. Existing records remain available for review.

Two tightly scoped security actions stay available during this lockout:

- **Ownership transfer:** the existing transfer endpoint still requires the current owner's password, exact organization slug and an active head-office successor. It commits the role transfer and audit event in one transaction, then revokes both users' existing JWT sessions.
- **Suspend a team member:** an authorized manager may send a status-only request with a reason to suspend an existing membership. The request cannot also change role, branch scope, all-branch access or class assignments. The target's existing JWT sessions are revoked and the action is audited.

These exceptions are not a general write-mode bypass. Admissions, payments, branch creation, invitations, exports and normal role/scope edits remain blocked while the subscription is read-only. The exact route/body allowlist has unit tests and replica-set integration coverage.

## Capacity enforcement

Capacity is checked in the backend, not trusted from browser forms:

- Branch creation reserves organization quota and audits the branch creation in the same MongoDB transaction.
- Child admissions reserve student capacity in the same transaction as the child and guardian records.
- Issuing a staff invitation reserves staff capacity. Pending invitations count toward capacity so an administrator cannot invite unlimited users in advance.
- Accepting a staff invitation rechecks capacity and excludes that invitation from the pending count. This catches a plan change between invitation issue and acceptance.
- Parent invitations use verified guardian links and do not count as staff.
- A shared organization-document write version serializes capacity checks within MongoDB transactions. Deployments must support transactions (for example, a properly configured replica set).

When a capacity is reached, the write is rejected with HTTP 409 and \`PLAN_LIMIT_REACHED\`; the existing data is not deleted or silently modified.

## Owner view

The organization owner and head-office administrators can open **Plan & usage** from the SaaS workspace to review plan status, trial deadline, current usage and remaining capacity. This screen is informational; it does not collect payments or change plans.

## Operational limitation

The plan values are currently held in \`backend/utils/saasEntitlements.js\`. Changes require a reviewed code release. No online billing provider, recurring payment collection, invoice reconciliation for the SaaS subscription, automated dunning, self-service upgrades or platform-operator subscription console is implemented here. Keep public signup closed until the rollout gates in [SAAS_ROLLOUT.md](./SAAS_ROLLOUT.md) are formally approved and a subscription operations process is documented.
