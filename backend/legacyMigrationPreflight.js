#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs/promises');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// This is deliberately a read-only audit. Disable Mongoose's implicit schema
// and index creation before loading any models; never create or repair indexes
// as a side effect of a preflight run.
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const { buildLegacyMigrationAudit } = require('./utils/legacyMigrationAudit');
const { validateMigrationManifest, evaluateMigrationManifest } = require('./utils/legacyMigrationManifest');

const USAGE = `Usage:
  npm run migration:preflight
  npm run migration:preflight -- --json
  npm run migration:preflight -- --strict
  npm run migration:preflight -- --manifest ./legacy-migration-manifest.json --json

Mapping manifest mode is still read-only; it validates targets and drafts a plan only.
Reads MONGO_URI (or backend/.env). The command never inserts, updates, deletes,
creates collections, or creates indexes. Use a read-only database account and
a backup/staging copy. Do not use a production connection for first-pass audits.`;

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

async function readCollection(Model, projection) {
  return Model.find({})
    .select(projection)
    .lean()
    .exec();
}

function formatCount(value) {
  return new Intl.NumberFormat('en-IN').format(Number(value) || 0);
}

function printHumanReport(report) {
  console.log('LEGACY MIGRATION PREFLIGHT');
  console.log('READ-ONLY: no school records were changed; no migration was performed.');
  console.log('');
  console.log('Status: ' + report.status);
  console.log('Automatic migration permitted: NO');
  console.log('Student records: ' + formatCount(report.summary.studentRecords));
  console.log('Attendance records: ' + formatCount(report.summary.attendanceRecords));
  console.log('Legacy fee records: ' + formatCount(report.summary.legacyFeeRecords));
  console.log('Teacher profiles: ' + formatCount(report.summary.teacherProfiles));
  console.log('Duplicate student admission-number groups: ' + formatCount(report.summary.duplicateStudentAdmissionNumberGroups));
  console.log('Fee records requiring review: ' + formatCount(report.summary.feeRecordsWithOneOrMoreIssues));
  console.log('Data-quality blocker findings: ' + formatCount(report.summary.blockerIssueCount));
  console.log('');
  console.log('COLLECTION SCOPE (unscoped records need an explicit organization + branch assignment)');
  console.log('Collection              Total   Unscoped   Scoped   Partial');
  for (const [name, scope] of Object.entries(report.dataScope)) {
    console.log(
      name.padEnd(23) +
      String(scope.total).padStart(7) +
      String(scope.fullyUnscoped).padStart(11) +
      String(scope.fullyScoped).padStart(9) +
      String(scope.partiallyScoped).padStart(9)
    );
  }

  const issues = Object.entries(report.issuesByCode).sort((left, right) => right[1] - left[1]);
  console.log('');
  console.log('DATA-QUALITY FINDINGS (issue codes only; no student names or contact details)');
  if (!issues.length) console.log('No data-quality issues were detected in the records inspected.');
  else for (const [code, count] of issues) console.log('- ' + code + ': ' + formatCount(count));

  if (report.issueSamples.length) {
    console.log('');
    console.log('Sample internal record references (maximum ' + report.summary.issueSampleLimit + ')');
    for (const sample of report.issueSamples) {
      console.log('- ' + sample.code + (sample.recordRef ? ' [record ' + sample.recordRef + ']' : ''));
    }
  }

  console.log('');
  console.log('NEXT STEPS');
  for (const [index, nextStep] of report.decision.requiredNextSteps.entries()) {
    console.log((index + 1) + '. ' + nextStep);
  }
  console.log('');
  console.log('This report is a preflight only. It does not approve migration or public signup.');
}

async function run() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log(USAGE);
    return;
  }

  const mappingPath = optionValue('--manifest');
  let manifestValue = null;
  if (mappingPath) {
    try {
      const manifestText = await fs.readFile(path.resolve(process.cwd(), mappingPath), 'utf8');
      const manifestInput = JSON.parse(manifestText);
      const validation = validateMigrationManifest(manifestInput);
      if (!validation.valid) {
        const failure = {
          readOnly: true,
          mappingManifest: { valid: false, errors: validation.errors },
          message: 'The mapping manifest is invalid; no database connection or migration was attempted.',
        };
        if (hasFlag('--json')) console.log(JSON.stringify(failure, null, 2));
        else {
          console.error(failure.message);
          for (const [field, message] of Object.entries(validation.errors)) console.error('- ' + field + ': ' + message);
        }
        process.exitCode = 2;
        return;
      }
      manifestValue = validation.value;
    } catch (error) {
      const message = 'Could not read the mapping manifest: ' + (error.message || 'invalid JSON');
      if (hasFlag('--json')) console.log(JSON.stringify({ readOnly: true, mappingManifest: { valid: false, error: message } }, null, 2));
      else console.error(message);
      process.exitCode = 2;
      return;
    }
  }

  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is missing. Configure backend/.env or export MONGO_URI.');
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  let connected = false;
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      autoIndex: false,
      autoCreate: false,
    });
    connected = true;

    // Models are loaded after autoIndex/autoCreate were disabled. All calls
    // below are find-only reads using projections that omit personal details.
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

    const [
      students, attendance, fees, teachers, users, tenantClasses,
      organizations, branches, tenantInvoices, tenantTransactions,
      guardians, childGuardianLinks, reportCards, calendarEvents,
      pdfResources, galleryPhotos, videos,
    ] = await Promise.all([
      readCollection(Student, '_id stuNo standard batchYear organizationId branchId'),
      readCollection(Attendance, '_id organizationId branchId standard date studentDetails.studentId studentDetails.status'),
      readCollection(Fee, '_id stuNo standard batchYear totalStandardFees totalFeesPaid totalFeesRemaining discount paymentDetails.amount paymentDetails.date organizationId branchId'),
      readCollection(Teacher, '_id GR_No organizationId branchId'),
      readCollection(User, '_id role'),
      readCollection(TenantClass, '_id organizationId branchId'),
      readCollection(Organization, '_id status'),
      readCollection(Branch, '_id organizationId status'),
      readCollection(FeeInvoice, '_id organizationId branchId childId totalAmountPaise status'),
      readCollection(FeeTransaction, '_id organizationId branchId invoiceId childId amountPaise type'),
      readCollection(Guardian, '_id organizationId'),
      readCollection(ChildGuardian, '_id organizationId branchId childId guardianId'),
      readCollection(ReportCard, '_id'),
      readCollection(Calendar, '_id'),
      readCollection(Pdf, '_id'),
      readCollection(Photo, '_id'),
      readCollection(Video, '_id'),
    ]);

    const report = buildLegacyMigrationAudit({
      students,
      attendance,
      fees,
      teachers,
      users,
      tenantClasses,
      tenantInvoices,
      tenantTransactions,
      guardians,
      childGuardianLinks,
      reportCards,
      calendarEvents,
      pdfResources,
      galleryPhotos,
      videos,
    });

    report.connection = {
      connected: true,
      configuredReadOnlyAccount: 'unknown',
      organizationRecords: organizations.length,
      branchRecords: branches.length,
      organizationsActive: organizations.filter((record) => record.status === 'active').length,
      branchesActive: branches.filter((record) => record.status === 'active').length,
    };

    if (hasFlag('--json')) console.log(JSON.stringify(report, null, 2));
    else printHumanReport(report);

    if (hasFlag('--strict') && report.summary.blockerIssueCount > 0) {
      process.exitCode = 2;
    }
  } catch (error) {
    console.error('Migration preflight failed: ' + (error.message || 'unknown error'));
    console.error('No data migration was attempted. Check the connection, read permissions, and schema compatibility.');
    process.exitCode = 2;
  } finally {
    if (connected) await mongoose.disconnect();
  }
}

run();
