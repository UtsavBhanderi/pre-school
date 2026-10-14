# SaaS subscription operator runbook

This process is for a designated platform operator with authorized database access. It changes one organization's subscription record and writes the change audit event in the same MongoDB transaction. It does not create or verify a payment.

## Before acting

1. Confirm the external billing/approval system shows the correct outcome.
2. Open an approved change ticket and record the approver's work email.
3. Confirm the target organization slug. Slugs are displayed in the owner settings/context and are not the school's display name.
4. Take no action on a production workspace until the requester, scope and approval are independently verified.
5. Ensure you are connected to the intended database in a controlled operations shell. Do not put production database credentials into chat, Git, source files or shell scripts committed to the repository.

## 1. Preview (no changes)

From the repository root, run:

\`\`\`bash
cd backend
npm run subscription:manage -- --slug=little-stars-a1b2c3d4 --plan=growth --status=active --reason="Billing activation confirmed by finance" --ticket=BILLING-2026-104 --approved-by=operator@example.com
\`\`\`

The command is a dry run unless \`--apply\` is provided. It displays the current and requested plans/states and current branch/child/staff usage. No database records are modified during preview.

Replace each example value with the correct values from the approved change ticket. The example slug, ticket and email are placeholders.

## 2. Apply an approved change

Only after reviewing the preview and independently confirming the ticket, rerun the same command with \`--apply\` and an interactive terminal:

\`\`\`bash
npm run subscription:manage -- --slug=little-stars-a1b2c3d4 --plan=growth --status=active --reason="Billing activation confirmed by finance" --ticket=BILLING-2026-104 --approved-by=operator@example.com --apply
\`\`\`

The operator must type the exact organization slug displayed by the command. Piped/non-interactive execution is rejected. The tool rechecks the subscription snapshot and usage inside a MongoDB transaction; if another operator changed the subscription after preview, re-run the command and re-review the new state.

The change and its \`AuditEvent\` entry are committed atomically. The audit summary records prior/target plan and state, change ticket and approver; the audit reason records the human explanation. The operator identity is recorded by the approver email because this is a trusted-shell operation, not an authenticated dashboard session.

## Supported plans and states

- Plans: \`trial\`, \`starter\`, \`growth\`, \`group\`.
- States: \`trial\`, \`active\`, \`past_due\`, \`suspended\`, \`cancelled\`.
- A trial must use the Trial plan and lasts 1–90 days (default 14 days).
- A non-trial state must use a paid plan. Activating a writable plan is rejected if current usage is over any target capacity.
- If the requested writable plan is smaller than current usage, reduce usage or select a larger plan first. The tool does not delete records to make a downgrade fit.
- Suspended/cancelled subscription states can be applied when usage is above a plan's limit because they do not enable write access. To later reactivate writes, move to a fitting plan.
- Organizations with \`organization.status\` other than \`active\` cannot be changed by this tool. Resolve that separate organization-access state through its approved support procedure.

Every application requires a reason (10+ characters), a ticket ID, and an approver email. Use a unique ticket for each change and retain the evidence in your external change-management system.

## What this tool does not do

- It does not take payments, verify a payment provider, calculate taxes, produce SaaS billing invoices, issue refunds or perform a payment retry.
- It does not upgrade a plan automatically based on a webhook.
- It does not alter \`Organization.status\`, user memberships, student records or branches.
- It does not replace the separate security, backup/restore, data-migration and launch approval checks.

The plan capacities remain product defaults until the commercial plan is formally approved. Public self-service registration must remain disabled until the separate rollout checklist has been signed off.
