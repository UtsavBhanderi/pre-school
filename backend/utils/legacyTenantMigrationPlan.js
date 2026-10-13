'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const { parseMoneyToPaise } = require('./tenantMoney');
const { parseLegacyPaymentDate } = require('./legacyMigrationAudit');
const { getZonedDayBounds } = require('./zonedDate');

const DEFAULT_MAX_OPERATIONS = 2500;
const MONEY_TOLERANCE_PAISE = 1;

function idOf(value) {
  return value === undefined || value === null ? '' : String(value._id || value);
}

function isFullyUnscoped(record) {
  return !record?.organizationId && !record?.branchId;
}

function normalizeAcademicYear(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{4}-\d{4}$/.test(text)) return null;
  const start = Number(text.slice(0, 4));
  return Number(text.slice(5)) === start + 1 ? text : null;
}

function normalizeLegacyAttendanceDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return new Date(year + '-' + month + '-' + day + 'T00:00:00.000Z');
}

function paymentTimestamp(dateValue, timeZone) {
  const isoDate = parseLegacyPaymentDate(dateValue);
  if (!isoDate) return null;
  const bounds = getZonedDayBounds(isoDate, timeZone || 'Asia/Kolkata');
  if (!bounds) return null;
  // Keep the original text date/time in explicit provenance fields. The
  // historical model did not store a time zone, so the normalized timestamp
  // is a noon-ish local-day representative, not a claim about the old clock.
  return new Date(bounds.start.getTime() + Math.floor((bounds.end.getTime() - bounds.start.getTime()) / 2));
}

function safeString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function buildLegacyTenantMigrationPlan({
  manifest,
  organization,
  branch,
  approvedBy,
  students = [],
  attendance = [],
  fees = [],
  tenantClasses = [],
  existingAttendance = [],
  existingInvoices = [],
  now = new Date(),
  maxOperations = DEFAULT_MAX_OPERATIONS,
} = {}) {
  const errors = [];
  const targetOrganizationId = String(manifest?.organizationId || '');
  const targetBranchId = String(manifest?.branchId || '');
  const approvedById = idOf(approvedBy);
  const timezone = safeString(branch?.timezone || organization?.timezone, 100) || 'Asia/Kolkata';
  const orgId = organization?._id || targetOrganizationId;
  const branchObjectId = branch?._id || targetBranchId;
  const organizationId = idOf(orgId);
  const branchId = idOf(branchObjectId);

  if (!manifest || typeof manifest !== 'object') errors.push({ code: 'manifest_missing' });
  if (!organization || organizationId !== targetOrganizationId || organization.status !== 'active') {
    errors.push({ code: 'target_organization_unavailable_or_mismatched' });
  }
  if (!branch || branchId !== targetBranchId || idOf(branch.organizationId) !== targetOrganizationId || branch.status !== 'active') {
    errors.push({ code: 'target_branch_unavailable_or_mismatched' });
  }
  if (!approvedById || !mongoose.Types.ObjectId.isValid(approvedById)) errors.push({ code: 'approved_by_user_missing' });
  if (!Number.isInteger(maxOperations) || maxOperations < 1 || maxOperations > 10000) {
    errors.push({ code: 'max_operations_out_of_range' });
  }

  const modes = manifest?.collections || {};
  const selectedStudents = modes.students === 'legacy_unscoped' ? students.filter(isFullyUnscoped) : [];
  const selectedAttendance = modes.attendance === 'legacy_unscoped' ? attendance.filter(isFullyUnscoped) : [];
  const selectedFees = modes.fees === 'legacy_unscoped' ? fees.filter(isFullyUnscoped) : [];
  for (const [name, mode, rows] of [
    ['students', modes.students, students],
    ['attendance', modes.attendance, attendance],
    ['fees', modes.fees, fees],
  ]) {
    const partialCount = rows.filter((record) => Boolean(record?.organizationId) !== Boolean(record?.branchId)).length;
    if (mode === 'legacy_unscoped' && partialCount > 0) {
      errors.push({ code: name + '_contains_partially_scoped_records', count: partialCount });
    }
  }

  const classNames = new Set((tenantClasses || [])
    .filter((item) => idOf(item.organizationId) === targetOrganizationId &&
      idOf(item.branchId) === targetBranchId &&
      item.status === 'active')
    .map((item) => safeString(item.name, 80)));

  const studentById = new Map();
  const studentsByAdmission = new Map();
  for (const student of selectedStudents) {
    const studentId = idOf(student);
    studentById.set(studentId, student);
    const admission = safeString(student.stuNo, 80);
    if (!admission) {
      errors.push({ code: 'student_missing_admission_number', recordRef: studentId });
      continue;
    }
    const current = studentsByAdmission.get(admission) || [];
    current.push(student);
    studentsByAdmission.set(admission, current);
    if (!safeString(student.standard, 80) || !classNames.has(safeString(student.standard, 80))) {
      errors.push({ code: 'student_class_not_configured_at_target_branch', recordRef: studentId });
    }
    const duplicateAdmissionCount = students.filter((item) => safeString(item.stuNo, 80) === admission).length;
    if (duplicateAdmissionCount !== 1) errors.push({ code: 'student_admission_number_not_globally_unique', recordRef: studentId });
  }

  const studentUpdates = selectedStudents.map((student) => ({
    id: student._id,
    set: {
      organizationId: orgId,
      branchId: branchObjectId,
      updatedBy: approvedBy?._id || approvedBy,
    },
  }));

  const attendanceUpdates = [];
  const attendanceKeys = new Set();
  const selectedAttendanceIds = new Set(selectedAttendance.map(idOf));
  for (const record of selectedAttendance) {
    const entries = Array.isArray(record.studentDetails) ? record.studentDetails : [];
    const childClasses = new Set();
    let invalidReference = false;
    const seenChildren = new Set();
    for (const entry of entries) {
      const childId = idOf(entry?.studentId?._id || entry?.studentId);
      const child = studentById.get(childId);
      if (!child) {
        errors.push({ code: 'attendance_child_outside_selected_student_cohort', recordRef: idOf(record) });
        invalidReference = true;
        continue;
      }
      if (seenChildren.has(childId)) errors.push({ code: 'attendance_child_duplicated_in_record', recordRef: idOf(record) });
      seenChildren.add(childId);
      if (!['present', 'absent'].includes(String(entry.status || '').toLowerCase())) {
        errors.push({ code: 'attendance_status_invalid', recordRef: idOf(record) });
      }
      childClasses.add(safeString(child.standard, 80));
    }
    const recordDate = normalizeLegacyAttendanceDate(record.date);
    if (!recordDate || !entries.length) {
      errors.push({ code: 'attendance_date_or_roster_invalid', recordRef: idOf(record) });
      continue;
    }
    if (childClasses.size !== 1 || childClasses.has('')) {
      errors.push({ code: 'attendance_must_belong_to_one_configured_class', recordRef: idOf(record) });
      continue;
    }
    const className = [...childClasses][0];
    if (!classNames.has(className)) {
      errors.push({ code: 'attendance_class_not_configured_at_target_branch', recordRef: idOf(record) });
    }
    if (record.standard && safeString(record.standard, 80) !== className) {
      errors.push({ code: 'attendance_record_class_mismatch', recordRef: idOf(record) });
    }
    if (invalidReference) continue;

    const dayKey = recordDate.toISOString().slice(0, 10) + '|' + className;
    if (attendanceKeys.has(dayKey)) errors.push({ code: 'duplicate_legacy_attendance_date_class', recordRef: idOf(record) });
    attendanceKeys.add(dayKey);
    for (const existing of existingAttendance) {
      if (selectedAttendanceIds.has(idOf(existing))) continue;
      if (idOf(existing.organizationId) !== targetOrganizationId || idOf(existing.branchId) !== targetBranchId) continue;
      const existingDate = normalizeLegacyAttendanceDate(existing.date);
      if (existingDate && existingDate.getTime() === recordDate.getTime() &&
          safeString(existing.standard, 80) === className) {
        errors.push({ code: 'target_attendance_date_class_already_exists', recordRef: idOf(record) });
        break;
      }
    }
    attendanceUpdates.push({
      id: record._id,
      set: {
        organizationId: orgId,
        branchId: branchObjectId,
        recordedBy: approvedBy?._id || approvedBy,
        standard: className,
        date: recordDate,
      },
    });
  }

  const existingInvoicesByChild = new Map();
  for (const invoice of existingInvoices || []) {
    if (idOf(invoice.organizationId) !== targetOrganizationId || idOf(invoice.branchId) !== targetBranchId) continue;
    const childId = idOf(invoice.childId);
    const existing = existingInvoicesByChild.get(childId) || [];
    existing.push(invoice);
    existingInvoicesByChild.set(childId, existing);
  }

  const feeUpdates = [];
  const invoicesToCreate = [];
  const transactionsToCreate = [];
  const invoiceIds = [];
  for (const fee of selectedFees) {
    const admission = safeString(fee.stuNo, 80);
    const matches = studentsByAdmission.get(admission) || [];
    if (matches.length !== 1) {
      errors.push({ code: 'fee_child_does_not_resolve_uniquely', recordRef: idOf(fee) });
      continue;
    }
    const child = matches[0];
    const childId = idOf(child);
    const academicYear = normalizeAcademicYear(fee.batchYear || child.batchYear);
    if (!academicYear) {
      errors.push({ code: 'fee_academic_year_missing_or_invalid', recordRef: idOf(fee) });
      continue;
    }
    if ((existingInvoicesByChild.get(childId) || []).length) {
      errors.push({ code: 'target_child_already_has_fee_invoice', recordRef: idOf(fee) });
      continue;
    }
    const subtotalPaise = parseMoneyToPaise(fee.totalStandardFees ?? 0);
    const discountPaise = parseMoneyToPaise(fee.discount ?? 0);
    const paidPaise = parseMoneyToPaise(fee.totalFeesPaid ?? 0);
    const remainingPaise = parseMoneyToPaise(fee.totalFeesRemaining ?? 0);
    if ([subtotalPaise, discountPaise, paidPaise, remainingPaise].some((value) => value === null) ||
        discountPaise > subtotalPaise || paidPaise > subtotalPaise - discountPaise ||
        Math.abs(Math.max(0, subtotalPaise - discountPaise - paidPaise) - remainingPaise) > MONEY_TOLERANCE_PAISE) {
      errors.push({ code: 'fee_amounts_do_not_reconcile', recordRef: idOf(fee) });
      continue;
    }

    const details = Array.isArray(fee.paymentDetails) ? fee.paymentDetails : [];
    let detailPaidPaise = 0;
    let detailsValid = true;
    const normalizedPayments = [];
    for (const [index, detail] of details.entries()) {
      const amountPaise = parseMoneyToPaise(detail?.amount ?? 0);
      if (amountPaise === null) {
        errors.push({ code: 'fee_payment_amount_invalid', recordRef: idOf(fee) });
        detailsValid = false;
        continue;
      }
      detailPaidPaise += amountPaise;
      if (!Number.isSafeInteger(detailPaidPaise)) {
        errors.push({ code: 'fee_payment_total_overflow', recordRef: idOf(fee) });
        detailsValid = false;
        break;
      }
      let transactionAt = null;
      if (amountPaise > 0) {
        transactionAt = paymentTimestamp(detail?.date, timezone);
        if (!transactionAt) {
          errors.push({ code: 'fee_payment_date_invalid', recordRef: idOf(fee) });
          detailsValid = false;
        }
      }
      normalizedPayments.push({
        index,
        amountPaise,
        transactionAt,
        originalDate: safeString(detail?.date, 40),
        originalTime: safeString(detail?.time, 40),
      });
    }
    if (Math.abs(detailPaidPaise - paidPaise) > MONEY_TOLERANCE_PAISE) {
      errors.push({ code: 'fee_payment_history_does_not_match_total_paid', recordRef: idOf(fee) });
      detailsValid = false;
    }
    if (!detailsValid) continue;

    const invoiceId = new mongoose.Types.ObjectId();
    const sourceFeeId = fee._id;
    const invoiceNumber = 'LEGACY-' + idOf(fee);
    const lineItems = [{
      description: 'Legacy standard fee',
      quantity: 1,
      unitAmountPaise: subtotalPaise,
      lineTotalPaise: subtotalPaise,
    }];
    const paymentDetailCount = details.length;
    const invoiceNotes = 'Imported legacy fee record ' + idOf(fee) +
      ' from "' + safeString(manifest.sourceSchoolLabel, 120) + '". ' +
      'Historical payment rows imported: ' + paymentDetailCount + '. ' +
      'The legacy fee record remains available as scoped source data for reconciliation.';
    invoicesToCreate.push({
      _id: invoiceId,
      organizationId: orgId,
      branchId: branchObjectId,
      childId: child._id,
      invoiceNumber,
      academicYear,
      lineItems,
      subtotalPaise,
      discountPaise,
      totalAmountPaise: subtotalPaise - discountPaise,
      dueDate: null,
      status: 'open',
      ledgerVersion: 0,
      notes: invoiceNotes.slice(0, 1000),
      createdBy: approvedBy?._id || approvedBy,
      legacySourceFeeId: sourceFeeId,
      createdAt: now,
      updatedAt: now,
    });
    invoiceIds.push(String(invoiceId));

    for (const payment of normalizedPayments) {
      if (payment.amountPaise <= 0) continue;
      const transactionId = new mongoose.Types.ObjectId();
      const receiptNumber = 'LEGACY-' + idOf(fee) + '-' + String(payment.index + 1).padStart(3, '0');
      transactionsToCreate.push({
        _id: transactionId,
        organizationId: orgId,
        branchId: branchObjectId,
        invoiceId,
        childId: child._id,
        receiptNumber,
        type: 'payment',
        amountPaise: payment.amountPaise,
        method: 'other',
        reference: 'Imported legacy payment; original date/time stored in provenance fields.',
        transactionAt: payment.transactionAt,
        relatedTransactionId: null,
        reason: 'Historical payment imported; the original recording user and time zone were not stored.',
        recordedBy: approvedBy?._id || approvedBy,
        legacyImported: true,
        legacySourceFeeId: sourceFeeId,
        legacyPaymentIndex: payment.index,
        legacyOriginalDate: payment.originalDate,
        legacyOriginalTime: payment.originalTime,
        createdAt: now,
      });
    }

    feeUpdates.push({
      id: fee._id,
      set: {
        organizationId: orgId,
        branchId: branchObjectId,
      },
    });
  }

  const plannedOperations = studentUpdates.length + attendanceUpdates.length + feeUpdates.length +
    invoicesToCreate.length + transactionsToCreate.length + 1;
  if (plannedOperations > maxOperations) {
    errors.push({ code: 'migration_operation_limit_exceeded', count: plannedOperations, maxOperations });
  }

  const selectedIds = {
    students: selectedStudents.map(idOf).sort(),
    attendance: selectedAttendance.map(idOf).sort(),
    fees: selectedFees.map(idOf).sort(),
  };
  const fingerprint = crypto.createHash('sha256')
    .update(JSON.stringify({
      manifestVersion: manifest?.version,
      sourceSchoolLabel: manifest?.sourceSchoolLabel,
      organizationId: targetOrganizationId,
      branchId: targetBranchId,
      selectedIds,
      code: 'legacy-tenant-migration-v1',
    }))
    .digest('hex');

  return {
    valid: errors.length === 0,
    errors,
    fingerprint,
    noOp: plannedOperations === 1 && errors.length === 0,
    summary: {
      sourceSchoolLabel: safeString(manifest?.sourceSchoolLabel, 120),
      organizationId: targetOrganizationId,
      branchId: targetBranchId,
      selectedStudents: selectedStudents.length,
      selectedAttendanceRecords: selectedAttendance.length,
      selectedLegacyFeeRecords: selectedFees.length,
      feeInvoicesToCreate: invoicesToCreate.length,
      paymentTransactionsToCreate: transactionsToCreate.length,
      databaseOperations: plannedOperations,
      maximumDatabaseOperations: maxOperations,
    },
    studentUpdates,
    attendanceUpdates,
    feeUpdates,
    invoicesToCreate,
    transactionsToCreate,
    selectedIds,
  };
}

module.exports = {
  DEFAULT_MAX_OPERATIONS,
  normalizeAcademicYear,
  normalizeLegacyAttendanceDate,
  paymentTimestamp,
  buildLegacyTenantMigrationPlan,
};
