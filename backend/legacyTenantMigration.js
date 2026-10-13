#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs/promises');
const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const {
  buildLegacyMigrationAudit,
} = require('./utils/legacyMigrationAudit');
const {
  validateMigrationManifest,
  evaluateMigrationManifest,
} = require('./utils/legacyMigrationManifest');
const {
  DEFAULT_MAX_OPERATIONS,
  buildLegacyTenantMigrationPlan,
} = require('./utils/legacyTenantMigrationPlan');

const USAGE = `Usage:
  npm run migration:tenant -- --manifest ./legacy-migration-manifest.json
  npm run migration:tenant -- --manifest ./legacy-migration-manifest.json --json

Apply is intentionally disabled unless all staging gates are set:
  NODE_ENV=staging
  SAAS_MIGRATION_ENV=staging
  ALLOW_LEGACY_TENANT_MIGRATION=true

Then (against a disposable restored staging database only):
  npm run migration:tenant -- --manifest ./legacy-migration-manifest.json --apply \
    --confirm-source-label "Verified legacy school" \
    --confirm-organization <24-hex-org-id> \
    --confirm-branch <24-hex-branch-id> \
    --approved-by <24-hex-owner-user-id> \
    --change-ticket CHG-2026-001

The default mode is a dry run. It does not write data or indexes. The apply
mode requires a transaction-capable MongoDB replica set, a verified owner
approval, an explicit mapping manifest, reconciled fees, existing schema
collections/indexes, a restored staging backup, and a bounded operation count.`;

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

function optionValue(option) {
  const args = process.argv.slice(2);
  const equalForm = args.find((argument) => argument.startsWith(option + '='));
  if (equalForm) return equalForm.slice(option.length + 1);
  const index = args.indexOf(option);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  return null;
}

function validObjectId(value) {
  return /^[0-9a-f]{24}$/i.test(String(value || ''));
}

function output(report) {
  if (hasFlag('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('LEGACY TENANT MIGRATION');
  console.log('Mode: ' + (report.applyRequested ? 'EXPLICIT APPLY REQUEST' : 'DRY RUN'));
  console.log('Writes performed: ' + (report.writesPerformed ? 'YES' : 'NO'));
  console.log('Status: ' + report.status);
  if (report.summary) {
    console.log('Verified source label: ' + report.summary.sourceSchoolLabel);
    console.log('Target organization: ' + report.summary.organizationId);
    console.log('Target branch: ' + report.summary.branchId);
    console.log('Child records to scope: ' + report.summary.selectedStudents);
    console.log('Attendance records to scope: ' + report.summary.selectedAttendanceRecords);
    console.log('Legacy fee records to scope: ' + report.summary.selectedLegacyFeeRecords);
    console.log('Invoices to create: ' + report.summary.feeInvoicesToCreate);
    console.log('Historical payment entries to create: ' + report.summary.paymentTransactionsToCreate);
    console.log('Planned database operations: ' + report.summary.databaseOperations + ' / ' + report.summary.maximumDatabaseOperations);
  }
  if (report.errors?.length) {
    console.log('');
    console.log('BLOCKERS (codes and bounded record references only):');
    for (const error of report.errors) {
      console.log('- ' + error.code + (error.count ? ' (' + error.count + ')' : '') +
        (error.recordRef ? ' [record ' + error.recordRef + ']' : ''));
    }
  }
  if (report.message) console.log('
' + report.message);
}

async function readCollection(Model, projection, session) {
  let query = Model.find({}).select(projection).lean();
  if (session) query = query.session(session);
  return query.exec();
}

async function loadSnapshot(session) {
  // Require models after setting autoIndex/autoCreate off. The diagnostic and
  // migration must never silently provision or repair schema indexes.
  const Student = require('./models/Student');
  const Attendance = require('./models/Attendance');
  const Fee = require('./models/Fee');
  const Teacher = require('./models/Teacher');
  const User = require('./models/User');
  const TenantClass = require('./models/TenantClass');
  const Organization = require('./models/Organization');
  const Branch = require('./models/Branch');
  const FeeInvoice = require('./models/FeeInvoice');
  const FeeTransaction = require('./models/FeeTransaction');
  const Guardian = require('./models/Guardian');
  const ChildGuardian = require('./models/ChildGuardian');
  const ReportCard = require('./models/ReportCard');
  const Calendar = require('./models/Calendar');
  const Pdf = require('./models/Pdf');
  const Photo = require('./models/Photo');
  const Video = require('./models/Video');
  const OrganizationMembership = require('./models/OrganizationMembership');
  const AuditEvent = require('./models/AuditEvent');
  const LegacyMigrationRun = require('./models/LegacyMigrationRun');

  const loaders = [
    () => readCollection(Student, '_id stuNo standard batchYear organizationId branchId', session),
    () => readCollection(Attendance, '_id organizationId branchId standard date studentDetails.studentId studentDetails.status', session),
    () => readCollection(Fee, '_id stuNo standard batchYear totalStandardFees totalFeesPaid totalFeesRemaining discount paymentDetails.amount paymentDetails.date paymentDetails.time organizationId branchId', session),
    () => readCollection(Teacher, '_id GR_No organizationId branchId', session),
    () => readCollection(User, '_id role', session),
    () => readCollection(TenantClass, '_id organizationId branchId name status', session),
    () => readCollection(Organization, '_id status timezone createdBy', session),
    () => readCollection(Branch, '_id organizationId status timezone code', session),
    () => readCollection(FeeInvoice, '_id organizationId branchId childId academicYear totalAmountPaise status legacySourceFeeId', session),
    () => readCollection(FeeTransaction, '_id organizationId branchId invoiceId childId amountPaise type legacySourceFeeId', session),
    () => readCollection(Guardian, '_id organizationId', session),
    () => readCollection(ChildGuardian, '_id organizationId branchId childId guardianId', session),
    () => readCollection(ReportCard, '_id', session),
    () => readCollection(Calendar, '_id', session),
    () => readCollection(Pdf, '_id', session),
    () => readCollection(Photo, '_id', session),
    () => readCollection(Video, '_id', session),
  ];

  // The Node MongoDB driver does not support parallel operations on one session
  // inside a transaction. Use sequential reads there, but retain concurrent
  // reads for a read-only dry run.
  const collectionRows = session
    ? await (async () => {
      const values = [];
      for (const load of loaders) values.push(await load());
      return values;
    })()
    : await Promise.all(loaders.map((load) => load()));

  const [
    students, attendance, fees, teachers, users, tenantClasses,
    organizations, branches, tenantInvoices, tenantTransactions,
    guardians, childGuardianLinks, reportCards, calendarEvents,
    pdfResources, galleryPhotos, videos,
  ] = collectionRows;

  const audit = buildLegacyMigrationAudit({
    students, attendance, fees, teachers, users, tenantClasses,
    tenantInvoices, tenantTransactions, guardians, childGuardianLinks,
    reportCards, calendarEvents, pdfResources, galleryPhotos, videos,
  });

  return {
    Student, Attendance, Fee, Teacher, User, TenantClass, Organization, Branch,
    FeeInvoice, FeeTransaction, Guardian, ChildGuardian, ReportCard, Calendar,
    Pdf, Photo, Video, OrganizationMembership, AuditEvent, LegacyMigrationRun,
    students, attendance, fees, teachers, users, tenantClasses,
    organizations, branches, tenantInvoices, tenantTransactions,
    guardians, childGuardianLinks, reportCards, calendarEvents,
    pdfResources, galleryPhotos, videos, audit,
  };
}

function evaluate(snapshot, manifest) {
  return evaluateMigrationManifest({
    manifest,
    students: snapshot.students,
    attendance: snapshot.attendance,
    fees: snapshot.fees,
    teachers: snapshot.teachers,
    users: snapshot.users,
    guardians: snapshot.guardians,
    childGuardianLinks: snapshot.childGuardianLinks,
    reportCards: snapshot.reportCards,
    calendarEvents: snapshot.calendarEvents,
    pdfResources: snapshot.pdfResources,
    galleryPhotos: snapshot.galleryPhotos,
    videos: snapshot.videos,
    tenantClasses: snapshot.tenantClasses,
    organizations: snapshot.organizations,
    branches: snapshot.branches,
    issuesByCode: snapshot.audit.issuesByCode,
  });
}

function requiredCollections(snapshot, manifest) {
  const models = [
    snapshot.Organization,
    snapshot.Branch,
    snapshot.OrganizationMembership,
    snapshot.Student,
    snapshot.Attendance,
    snapshot.Fee,
    snapshot.TenantClass,
    snapshot.User,
    snapshot.AuditEvent,
    snapshot.LegacyMigrationRun,
  ];
  if (manifest.collections.fees === 'legacy_unscoped') {
    models.push(snapshot.FeeInvoice, snapshot.FeeTransaction);
  }
  return [...new Set(models.map((model) => model.collection.name))];
}

async function checkCollectionsAndIndexes(snapshot, manifest) {
  const connection = mongoose.connection;
  const collections = new Set((await connection.db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
  const missing = requiredCollections(snapshot, manifest).filter((name) => !collections.has(name));
  if (missing.length) {
    const error = new Error('Required collections are missing; provision the approved schema/indexes before applying migration.');
    error.code = 'MIGRATION_COLLECTIONS_MISSING';
    error.details = missing;
    throw error;
  }

  async function requireUniqueIndex(Model, keys, partial = null) {
    const indexes = await Model.collection.indexes();
    const target = JSON.stringify(keys);
    const found = indexes.some((index) => {
      if (JSON.stringify(index.key) !== target || index.unique !== true) return false;
      if (!partial) return true;
      const expressions = index.partialFilterExpression || {};
      return Object.entries(partial).every(([field, value]) =>
        JSON.stringify(expressions[field]) === JSON.stringify(value)
      );
    });
    if (!found) {
      const error = new Error('Required unique index is missing on ' + Model.collection.name + ': ' + Object.keys(keys).join(', '));
      error.code = 'MIGRATION_INDEX_MISSING';
      error.details = { collection: Model.collection.name, keys, partial };
      throw error;
    }
  }

  if (manifest.collections.attendance === 'legacy_unscoped') {
    await requireUniqueIndex(snapshot.Attendance, {
      organizationId: 1, branchId: 1, date: 1, standard: 1,
    }, { organizationId: { $type: 'objectId' }, branchId: { $type: 'objectId' } });
  }

  if (manifest.collections.fees === 'legacy_unscoped') {
    await requireUniqueIndex(snapshot.FeeInvoice, {
      organizationId: 1, branchId: 1, invoiceNumber: 1,
    });
    await requireUniqueIndex(snapshot.FeeInvoice, {
      organizationId: 1, branchId: 1, legacySourceFeeId: 1,
    }, { legacySourceFeeId: { $type: 'objectId' } });
    await requireUniqueIndex(snapshot.FeeTransaction, {
      organizationId: 1, branchId: 1, receiptNumber: 1,
    });
    await requireUniqueIndex(snapshot.FeeTransaction, {
      organizationId: 1, branchId: 1, legacySourceFeeId: 1, legacyPaymentIndex: 1,
    }, { legacySourceFeeId: { $type: 'objectId' }, legacyPaymentIndex: { $type: 'number' } });
  }
  await requireUniqueIndex(snapshot.LegacyMigrationRun, { fingerprint: 1 });
}

function parseChangeTicket(value) {
  const ticket = String(value || '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{2,99}$/.test(ticket) ? ticket : null;
}

function ensureApplyGates({ manifest, validation, approvedBy, ticket, plan, evaluated }) {
  const blockers = [];
  if (process.env.NODE_ENV !== 'staging' || process.env.SAAS_MIGRATION_ENV !== 'staging') {
    blockers.push({ code: 'STAGING_ENVIRONMENT_REQUIRED' });
  }
  if (process.env.ALLOW_LEGACY_TENANT_MIGRATION !== 'true') {
    blockers.push({ code: 'WRITE_GATE_NOT_ENABLED' });
  }
  if (!hasFlag('--apply')) blockers.push({ code: 'EXPLICIT_APPLY_FLAG_REQUIRED' });
  if (validation?.valid !== true) blockers.push({ code: 'MANIFEST_INVALID' });
  if (evaluated?.status !== 'READY_FOR_MANUAL_REVIEW_ONLY') blockers.push({ code: 'MANIFEST_REVIEW_BLOCKED' });
  if (!manifest.confirmations.sourceOwnershipVerified || !manifest.confirmations.backupRestoredInStaging) {
    blockers.push({ code: 'REQUIRED_OWNERSHIP_OR_BACKUP_CONFIRMATION_MISSING' });
  }
  if (manifest.collections.fees === 'legacy_unscoped' && !manifest.confirmations.feeLedgerReviewed) {
    blockers.push({ code: 'FEE_LEDGER_REVIEW_CONFIRMATION_MISSING' });
  }
  if (!approvedBy || !approvedBy._id) blockers.push({ code: 'APPROVED_BY_USER_NOT_FOUND' });
  if (!ticket) blockers.push({ code: 'CHANGE_TICKET_REQUIRED' });
  if (!plan?.valid) blockers.push(...(plan?.errors || [{ code: 'MIGRATION_PLAN_INVALID' }]));
  return blockers;
}

async function applyPlan(snapshot, manifest, plan, approvedBy, ticket, session) {
  const existingRun = await snapshot.LegacyMigrationRun.findOne({ fingerprint: plan.fingerprint }).session(session).lean();
  if (existingRun) {
    const error = new Error('This exact source/target mapping has already been applied.');
    error.code = 'MIGRATION_ALREADY_APPLIED';
    throw error;
  }

  const now = new Date();
  const [run] = await snapshot.LegacyMigrationRun.create([{
    fingerprint: plan.fingerprint,
    sourceSchoolLabel: manifest.sourceSchoolLabel,
    organizationId: manifest.organizationId,
    branchId: manifest.branchId,
    approvedBy: approvedBy._id,
    changeTicket: ticket,
    status: 'applying',
    startedAt: now,
  }], { session });

  if (plan.studentUpdates.length) {
    const result = await snapshot.Student.bulkWrite(plan.studentUpdates.map((update) => ({
      updateOne: {
        filter: { _id: update.id, organizationId: null, branchId: null },
        update: { $set: update.set },
      },
    })), { session, ordered: true });
    if (result.matchedCount !== plan.studentUpdates.length) {
      const error = new Error('Child source rows changed since the review plan was created.');
      error.code = 'MIGRATION_SOURCE_CHANGED';
      throw error;
    }
  }

  if (plan.attendanceUpdates.length) {
    const result = await snapshot.Attendance.bulkWrite(plan.attendanceUpdates.map((update) => ({
      updateOne: {
        filter: { _id: update.id, organizationId: null, branchId: null },
        update: { $set: update.set },
      },
    })), { session, ordered: true });
    if (result.matchedCount !== plan.attendanceUpdates.length) {
      const error = new Error('Attendance source rows changed since the review plan was created.');
      error.code = 'MIGRATION_SOURCE_CHANGED';
      throw error;
    }
  }

  if (plan.feeUpdates.length) {
    const result = await snapshot.Fee.bulkWrite(plan.feeUpdates.map((update) => ({
      updateOne: {
        filter: { _id: update.id, organizationId: null, branchId: null },
        update: { $set: update.set },
      },
    })), { session, ordered: true });
    if (result.matchedCount !== plan.feeUpdates.length) {
      const error = new Error('Fee source rows changed since the review plan was created.');
      error.code = 'MIGRATION_SOURCE_CHANGED';
      throw error;
    }
  }

  if (plan.invoicesToCreate.length) {
    await snapshot.FeeInvoice.insertMany(plan.invoicesToCreate, { session, ordered: true });
  }
  if (plan.transactionsToCreate.length) {
    await snapshot.FeeTransaction.insertMany(plan.transactionsToCreate, { session, ordered: true });
  }

  await snapshot.AuditEvent.create([{
    organizationId: manifest.organizationId,
    branchId: manifest.branchId,
    actorUserId: approvedBy._id,
    action: 'legacy.migration.completed',
    resourceType: 'legacy_migration',
    resourceId: plan.fingerprint,
    summary: 'Approved legacy school data migration completed under change ' + ticket + '.',
    reason: 'Source label: ' + manifest.sourceSchoolLabel +
      '; backup restore and data-ownership confirmations were recorded in the migration manifest.',
    changedFields: ['organizationId', 'branchId', 'feeInvoices', 'feeTransactions'],
  }], { session });

  await snapshot.LegacyMigrationRun.updateOne(
    { _id: run._id, status: 'applying' },
    {
      $set: {
        status: 'completed',
        completedAt: new Date(),
        summary: {
          selectedStudents: plan.summary.selectedStudents,
          selectedAttendanceRecords: plan.summary.selectedAttendanceRecords,
          selectedLegacyFeeRecords: plan.summary.selectedLegacyFeeRecords,
          feeInvoicesCreated: plan.summary.feeInvoicesToCreate,
          paymentTransactionsCreated: plan.summary.paymentTransactionsToCreate,
          databaseOperations: plan.summary.databaseOperations,
        },
      },
    },
    { session },
  );

  return {
    status: 'MIGRATION_COMPLETED',
    writesPerformed: true,
    runId: String(run._id),
    fingerprint: plan.fingerprint,
    summary: plan.summary,
  };
}

async function run() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log(USAGE);
    return;
  }

  const manifestPath = optionValue('--manifest');
  if (!manifestPath) {
    console.error('A mapping manifest is required. No database was connected and no writes were attempted.');
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  let parsedManifest;
  try {
    parsedManifest = JSON.parse(await fs.readFile(path.resolve(process.cwd(), manifestPath), 'utf8'));
  } catch (error) {
    console.error('Could not read the JSON mapping manifest: ' + (error.message || 'invalid JSON'));
    process.exitCode = 2;
    return;
  }
  const validation = validateMigrationManifest(parsedManifest);
  if (!validation.valid) {
    output({
      status: 'BLOCKED_FOR_REVIEW',
      applyRequested: hasFlag('--apply'),
      writesPerformed: false,
      errors: Object.entries(validation.errors).map(([field, message]) => ({ code: 'MANIFEST_' + field.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase(), message })),
      message: 'Fix the manifest validation errors. No database connection or migration was attempted.',
    });
    process.exitCode = 2;
    return;
  }

  const manifest = validation.value;
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is missing. No database changes were attempted.');
    process.exitCode = 2;
    return;
  }

  const applyRequested = hasFlag('--apply');
  const confirmSource = optionValue('--confirm-source-label');
  const confirmOrganization = optionValue('--confirm-organization');
  const confirmBranch = optionValue('--confirm-branch');
  const approvedById = optionValue('--approved-by');
  const ticket = parseChangeTicket(optionValue('--change-ticket'));
  const maxOperationsRaw = optionValue('--max-operations');
  const maxOperations = maxOperationsRaw === null ? DEFAULT_MAX_OPERATIONS : Number(maxOperationsRaw);

  if (applyRequested) {
    const flags = [];
    if (confirmSource !== manifest.sourceSchoolLabel) flags.push({ code: 'SOURCE_LABEL_CONFIRMATION_MISMATCH' });
    if (String(confirmOrganization || '').toLowerCase() !== manifest.organizationId.toLowerCase()) flags.push({ code: 'ORGANIZATION_CONFIRMATION_MISMATCH' });
    if (String(confirmBranch || '').toLowerCase() !== manifest.branchId.toLowerCase()) flags.push({ code: 'BRANCH_CONFIRMATION_MISMATCH' });
    if (!validObjectId(approvedById)) flags.push({ code: 'APPROVED_BY_MUST_BE_OBJECT_ID' });
    if (!ticket) flags.push({ code: 'CHANGE_TICKET_INVALID_OR_MISSING' });
    if (!Number.isInteger(maxOperations) || maxOperations < 1 || maxOperations > 10000) flags.push({ code: 'MAX_OPERATIONS_INVALID' });
    if (process.env.NODE_ENV !== 'staging' || process.env.SAAS_MIGRATION_ENV !== 'staging') flags.push({ code: 'STAGING_ENVIRONMENT_REQUIRED' });
    if (process.env.ALLOW_LEGACY_TENANT_MIGRATION !== 'true') flags.push({ code: 'WRITE_GATE_NOT_ENABLED' });
    if (flags.length) {
      output({
        status: 'BLOCKED_FOR_REVIEW',
        applyRequested,
        writesPerformed: false,
        errors: flags,
        message: 'Apply safety gates failed. No database connection or migration was attempted.',
      });
      process.exitCode = 2;
      return;
    }
  }

  let connected = false;
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      autoIndex: false,
      autoCreate: false,
    });
    connected = true;

    // Load models and preview from the same read path used by the read-only
    // preflight. In apply mode, re-load and evaluate the snapshot inside the
    // transaction before the first write.
    let readSnapshot = await loadSnapshot(null);
    let evaluated = evaluate(readSnapshot, manifest);
    let approvedBy = null;
    if (applyRequested) {
      approvedBy = await readSnapshot.User.findById(approvedById).select('_id email username').lean();
      const membership = await readSnapshot.OrganizationMembership.findOne({
        organizationId: manifest.organizationId,
        userId: approvedById,
        status: 'active',
        role: { $in: ['organization_owner', 'head_office_admin'] },
      }).lean();
      if (!approvedBy || !membership) {
        output({
          status: 'BLOCKED_FOR_REVIEW', applyRequested, writesPerformed: false,
          errors: [{ code: 'APPROVER_MUST_BE_ACTIVE_ORGANIZATION_OWNER_OR_HEAD_OFFICE_ADMIN' }],
          message: 'The approver must be an active organization owner or head-office administrator. No data was changed.',
        });
        process.exitCode = 2;
        return;
      }
    }

    const organization = readSnapshot.organizations.find((item) => String(item._id) === manifest.organizationId);
    const branch = readSnapshot.branches.find((item) => String(item._id) === manifest.branchId);
    const existingInvoices = readSnapshot.tenantInvoices.filter((item) =>
      String(item.organizationId) === manifest.organizationId &&
      String(item.branchId) === manifest.branchId
    );
    let plan = buildLegacyTenantMigrationPlan({
      manifest,
      organization,
      branch,
      approvedBy: approvedBy || { _id: approvedById || organization?.createdBy },
      students: readSnapshot.students,
      attendance: readSnapshot.attendance,
      fees: readSnapshot.fees,
      tenantClasses: readSnapshot.tenantClasses,
      existingAttendance: readSnapshot.attendance,
      existingInvoices,
      maxOperations,
    });

    const reviewErrors = [];
    if (evaluated.status !== 'READY_FOR_MANUAL_REVIEW_ONLY') {
      reviewErrors.push({ code: 'MAPPING_MANIFEST_BLOCKED_FOR_REVIEW', count: evaluated.errors.length + evaluated.totalSelectedDataQualityIssues });
    }
    const safetyErrors = ensureApplyGates({
      manifest, validation, approvedBy, ticket, plan, evaluated,
    });
    const errors = [...reviewErrors, ...plan.errors];
    if (applyRequested) errors.push(...safetyErrors);
    const noOp = plan.noOp && errors.length === 0;

    if (!applyRequested || errors.length || noOp) {
      const report = {
        status: errors.length ? 'BLOCKED_FOR_REVIEW' : noOp ? 'NO_UNSCOPED_RECORDS_TO_MIGRATE' : 'READY_FOR_MANUAL_REVIEW',
        applyRequested,
        writesPerformed: false,
        fingerprint: plan.fingerprint,
        summary: plan.summary,
        errors,
        manifestReview: {
          status: evaluated.status,
          errors: evaluated.errors,
          selectedDataQualityIssues: evaluated.selectedDataQualityIssues,
          warnings: evaluated.warnings.map((warning) => ({ code: warning.code, count: warning.count || 0 })),
        },
        message: errors.length
          ? 'Resolve every blocker and rerun the dry-run. No data was changed.'
          : noOp
            ? 'No eligible unscoped records remain under this manifest. No data was changed.'
            : 'Dry run only. Review the counts, then obtain school-owner approval and restore verification before any staging apply.',
      };
      output(report);
      if (errors.length) process.exitCode = 2;
      return;
    }

    await checkCollectionsAndIndexes(readSnapshot, manifest);

    let applied;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const snapshot = await loadSnapshot(session);
        const freshEvaluation = evaluate(snapshot, manifest);
        const freshOrganization = snapshot.organizations.find((item) => String(item._id) === manifest.organizationId);
        const freshBranch = snapshot.branches.find((item) => String(item._id) === manifest.branchId);
        const freshInvoices = snapshot.tenantInvoices.filter((item) =>
          String(item.organizationId) === manifest.organizationId &&
          String(item.branchId) === manifest.branchId
        );
        const freshApprover = await snapshot.User.findById(approvedById).select('_id email username').session(session).lean();
        const freshMembership = await snapshot.OrganizationMembership.findOne({
          organizationId: manifest.organizationId,
          userId: approvedById,
          status: 'active',
          role: { $in: ['organization_owner', 'head_office_admin'] },
        }).session(session).lean();

        if (!freshApprover || !freshMembership) {
          const error = new Error('The migration approver lost organization-level access before the transaction started.');
          error.code = 'APPROVER_ACCESS_CHANGED';
          throw error;
        }
        if (freshEvaluation.status !== 'READY_FOR_MANUAL_REVIEW_ONLY') {
          const error = new Error('The current data no longer passes the migration review.');
          error.code = 'PREFLIGHT_NO_LONGER_READY';
          error.details = freshEvaluation.errors;
          throw error;
        }

        const freshPlan = buildLegacyTenantMigrationPlan({
          manifest,
          organization: freshOrganization,
          branch: freshBranch,
          approvedBy: freshApprover,
          students: snapshot.students,
          attendance: snapshot.attendance,
          fees: snapshot.fees,
          tenantClasses: snapshot.tenantClasses,
          existingAttendance: snapshot.attendance,
          existingInvoices: freshInvoices,
          maxOperations,
        });
        if (!freshPlan.valid || freshPlan.noOp) {
          const error = new Error('The current source rows no longer match the approved migration plan.');
          error.code = 'SOURCE_ROWS_CHANGED_OR_EMPTY';
          error.details = freshPlan.errors;
          throw error;
        }
        applied = await applyPlan(snapshot, manifest, freshPlan, freshApprover, ticket, session);
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 15000 });
    } finally {
      await session.endSession();
    }

    output({ ...applied, applyRequested: true, writesPerformed: true, errors: [], message: 'The bounded staging migration committed in one MongoDB transaction. Re-run the read-only preflight and compare source and destination counts before testing any user workflow.' });
  } catch (error) {
    const mappedCode = error.code === 11000 ? 'DUPLICATE_OR_CONCURRENT_MIGRATION' : (error.code || 'MIGRATION_FAILED');
    output({
      status: 'MIGRATION_ABORTED',
      applyRequested,
      writesPerformed: false,
      errors: [{
        code: mappedCode,
        details: error.details || undefined,
      }],
      message: (error.message || 'The migration failed.') + ' Transaction changes were rolled back if apply had begun.',
    });
    process.exitCode = 2;
  } finally {
    if (connected) await mongoose.disconnect();
  }
}

run();
