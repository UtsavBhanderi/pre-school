#!/usr/bin/env node
'use strict';

const path = require('path');
const readline = require('readline/promises');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const Organization = require('../models/Organization');
const AuditEvent = require('../models/AuditEvent');
const { countOrganizationUsage } = require('../utils/saasQuota');
const {
  normalizeSubscriptionChange,
  subscriptionSnapshot,
  snapshotsMatch,
} = require('../utils/saasSubscriptionAdmin');

const ALLOWED_FLAGS = new Set([
  'slug', 'plan', 'status', 'reason', 'ticket', 'approved-by', 'trial-days',
]);

class OperatorCommandError extends Error {
  constructor(message, code = 'OPERATOR_COMMAND_INVALID') {
    super(message);
    this.name = 'OperatorCommandError';
    this.code = code;
  }
}

function usageText() {
  return [
    'Manage one preschool subscription through an audited operator action.',
    '',
    'Dry run (default):',
    '  node backend/scripts/manageSaasSubscription.js --slug=little-stars-a1b2c3d4 --plan=growth --status=active --reason="Billing confirmation received" --ticket=BILLING-2026-104 --approved-by=operator@example.com',
    '',
    'Apply after reviewing the preview (requires an interactive terminal):',
    '  Add --apply to the command above, then type the exact organization slug when prompted.',
    '',
    'Plans: trial, starter, growth, group',
    'States: trial, active, past_due, suspended, cancelled',
    'Trial changes default to 14 days; use --trial-days=1..90 to specify another duration.',
    'Trial status must use the Trial plan. Writable plans are rejected when current usage exceeds their capacities.',
    'This does not collect a payment or validate the billing provider; use only after the external billing/approval workflow is complete.',
  ].join('\n');
}

function parseArguments(argv) {
  const options = {};
  let apply = false;
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--apply') {
      if (apply) throw new OperatorCommandError('Do not provide --apply more than once.');
      apply = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      throw new OperatorCommandError('Unexpected argument. Use --flag=value options; quote values that contain spaces.');
    }
    const equals = arg.indexOf('=');
    if (equals < 3) throw new OperatorCommandError('Use --flag=value syntax for every option except --apply.');
    const key = arg.slice(2, equals);
    const value = arg.slice(equals + 1);
    if (!ALLOWED_FLAGS.has(key)) throw new OperatorCommandError('Unknown option: --' + key);
    if (Object.prototype.hasOwnProperty.call(options, key)) throw new OperatorCommandError('Duplicate option: --' + key);
    if (!value.trim()) throw new OperatorCommandError('Option --' + key + ' cannot be empty.');
    options[key] = value.trim();
  }

  for (const required of ['slug', 'plan', 'status', 'reason', 'ticket', 'approved-by']) {
    if (!options[required]) throw new OperatorCommandError('Missing required option --' + required + '.');
  }
  if (options['trial-days'] !== undefined && !/^\d+$/.test(options['trial-days'])) {
    throw new OperatorCommandError('--trial-days must be a whole number.');
  }
  return {
    help: false,
    apply,
    options: {
      slug: options.slug,
      plan: options.plan,
      status: options.status,
      reason: options.reason,
      ticket: options.ticket,
      approvedBy: options['approved-by'],
      trialDays: options['trial-days'] === undefined ? undefined : Number(options['trial-days']),
    },
  };
}

function sameSubscriptionSnapshot(organization, expectedSnapshot) {
  return snapshotsMatch(subscriptionSnapshot(organization), expectedSnapshot);
}

function printPreview({ organization, currentSnapshot, change, usage }) {
  const end = change.value.trialEndsAt ? change.value.trialEndsAt.toISOString() : '—';
  console.log('\nSubscription change preview');
  console.log('---------------------------');
  console.log('School:           ' + organization.name);
  console.log('Organization slug:' + ' ' + organization.slug);
  console.log('Current:          ' + currentSnapshot.plan + ' / ' + currentSnapshot.status);
  console.log('Target:           ' + change.value.plan + ' / ' + change.value.status);
  console.log('Trial ends:       ' + end);
  console.log('Change ticket:    ' + change.value.ticket);
  console.log('Approved by:      ' + change.value.approvedBy);
  console.log('Reason:           ' + change.value.reason);
  console.log('');
  console.log('Current usage:');
  console.log('  Branches:       ' + usage.branches + ' / ' + change.value.limits.branches);
  console.log('  Children:       ' + usage.students + ' / ' + change.value.limits.students);
  console.log('  Staff seats:    ' + usage.staff + ' / ' + change.value.limits.staff);
  console.log('');
  console.log('Writable state:   ' + (change.value.canWrite ? 'yes' : 'no (read-only)'));
}

async function confirmOrganizationSlug(slug) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new OperatorCommandError('--apply requires an interactive terminal so the target slug can be confirmed.');
  }
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await terminal.question('\nTo apply this change, type the exact organization slug "' + slug + '": ');
    if (answer.trim() !== slug) {
      throw new OperatorCommandError('Confirmation did not match. No subscription changes were made.', 'CONFIRMATION_MISMATCH');
    }
  } finally {
    terminal.close();
  }
}

async function applyChange({ organization, expectedSnapshot, requested, options }) {
  const session = await mongoose.startSession();
  let updatedSnapshot = null;
  try {
    await session.withTransaction(async () => {
      // A write to the organization document serializes this change against
      // tenant quota-reserving writes using the same transaction lock.
      const lockedOrganization = await Organization.findOneAndUpdate(
        { _id: organization._id, slug: options.slug, status: 'active' },
        { $inc: { 'subscription.quotaVersion': 1 } },
        { new: true, runValidators: true, session },
      );
      if (!lockedOrganization) {
        throw new OperatorCommandError('The organization is no longer active or available; no changes were made.', 'ORGANIZATION_UNAVAILABLE');
      }
      if (!sameSubscriptionSnapshot(lockedOrganization, expectedSnapshot)) {
        throw new OperatorCommandError(
          'The subscription changed after the preview. Re-run the command to review the latest state.',
          'STALE_PREVIEW',
        );
      }

      const usage = await countOrganizationUsage(lockedOrganization._id, { session });
      const decision = normalizeSubscriptionChange(requested, { usage });
      if (!decision.valid) {
        throw new OperatorCommandError(
          'The change is no longer valid against current usage: ' + Object.values(decision.errors).join(' '),
          'CHANGE_NO_LONGER_VALID',
        );
      }

      const before = subscriptionSnapshot(lockedOrganization);
      const after = {
        plan: decision.value.plan,
        status: decision.value.status,
        trialEndsAt: decision.value.trialEndsAt ? decision.value.trialEndsAt.toISOString() : null,
      };

      const saved = await Organization.findOneAndUpdate(
        { _id: lockedOrganization._id, slug: options.slug },
        {
          $set: {
            'subscription.plan': after.plan,
            'subscription.status': after.status,
            'subscription.trialEndsAt': decision.value.trialEndsAt,
          },
        },
        { new: true, runValidators: true, session },
      );
      if (!saved) throw new OperatorCommandError('Organization subscription update did not complete.', 'UPDATE_FAILED');

      const summary = (
        'Subscription changed ' + before.plan + '/' + before.status + ' to ' + after.plan + '/' + after.status +
        '; ticket ' + decision.value.ticket + '; approver ' + decision.value.approvedBy + '.'
      ).slice(0, 500);
      const auditReason = decision.value.reason.slice(0, 500);
      await AuditEvent.create([{
        organizationId: lockedOrganization._id,
        branchId: null,
        actorUserId: null,
        action: 'subscription.operator_updated',
        resourceType: 'organization_subscription',
        resourceId: String(lockedOrganization._id),
        outcome: 'success',
        reason: auditReason,
        summary,
        changedFields: decision.value.changedFields,
        ipAddress: '',
        userAgent: 'saas-subscription-operator-cli',
      }], { session });

      updatedSnapshot = after;
    });
  } finally {
    await session.endSession();
  }
  return updatedSnapshot;
}

async function main() {
  let args;
  try {
    args = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error('\n' + usageText());
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    console.log(usageText());
    return;
  }
  if (!process.env.MONGO_URI) throw new OperatorCommandError('MONGO_URI is required; configure the backend .env first.');
  if (args.apply && (!process.env.NODE_ENV || process.env.NODE_ENV === 'production')) {
    // This command is intended for a controlled operations workstation. Set
    // NODE_ENV=staging (or another explicitly approved operational environment)
    // after connecting to the intended database and confirming the change ticket.
    throw new OperatorCommandError('For safety, --apply requires NODE_ENV=staging (or another approved non-production label). Re-run without --apply for a preview.');
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    const organization = await Organization.findOne({ slug: args.options.slug }).lean();
    if (!organization) throw new OperatorCommandError('No organization was found with the supplied slug.');

    const currentSnapshot = subscriptionSnapshot(organization);
    const usage = await countOrganizationUsage(organization._id);
    const decision = normalizeSubscriptionChange(args.options, { usage });
    if (!decision.valid) {
      console.error('Subscription change was rejected:');
      for (const [field, message] of Object.entries(decision.errors)) console.error('  ' + field + ': ' + message);
      process.exitCode = 2;
      return;
    }

    printPreview({ organization, currentSnapshot, change: decision, usage });
    if (!args.apply) {
      console.log('\nDRY RUN ONLY — no changes were made. Add --apply after the external approval is complete.');
      return;
    }

    await confirmOrganizationSlug(organization.slug);
    const updated = await applyChange({
      organization,
      expectedSnapshot: currentSnapshot,
      requested: args.options,
      options: args.options,
    });
    console.log('\nSubscription updated successfully.');
    console.log('Current subscription: ' + updated.plan + ' / ' + updated.status);
    if (updated.trialEndsAt) console.log('Trial ends: ' + updated.trialEndsAt);
    console.log('An audit event was written in the same transaction.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('Subscription operator command failed: ' + error.message);
  process.exitCode = 1;
});
