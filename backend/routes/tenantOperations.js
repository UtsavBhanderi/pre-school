'use strict';

const express = require('express');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Guardian = require('../models/Guardian');
const ChildGuardian = require('../models/ChildGuardian');
const Attendance = require('../models/Attendance');
const FeeInvoice = require('../models/FeeInvoice');
const FeeTransaction = require('../models/FeeTransaction');
const TenantSequence = require('../models/TenantSequence');
const Branch = require('../models/Branch');
const AuditEvent = require('../models/AuditEvent');
const { STANDARD_FEES } = require('../config/standardFees');
const { tenantContext, requireBranchContext } = require('../middleware/tenantContext');
const { hasTenantRole } = require('../utils/tenantAuthorization');
const { parseDateOnly } = require('../utils/dateOnly');
const { getZonedDayBounds, getTodayInTimeZone } = require('../utils/zonedDate');
const {
  MAX_MONEY_PAISE,
  parseMoneyToPaise,
  formatPaise,
  normalizeInvoiceLines,
  calculateInvoiceBalance,
} = require('../utils/tenantMoney');

const router = express.Router();
const CHILD_READ_ROLES = ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions'];
const CHILD_WRITE_ROLES = ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions'];
const MONEY_READ_ROLES = ['organization_owner', 'head_office_admin', 'branch_admin', 'accountant'];
const MONEY_WRITE_ROLES = ['organization_owner', 'head_office_admin', 'branch_admin', 'accountant'];
const REFUND_ROLES = ['organization_owner', 'head_office_admin', 'accountant'];
const VALID_GENDER = new Set(['Male', 'Female', 'Other']);
const VALID_RELATIONSHIPS = new Set(['mother', 'father', 'guardian', 'grandparent', 'other']);
const VALID_METHODS = new Set(['cash', 'upi', 'bank_transfer', 'card', 'online', 'cheque', 'other']);
const REGEX_SPECIAL = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);

router.use(tenantContext);

function allowed(req, roles, res) {
  if (hasTenantRole(req.tenant?.membership, roles)) return true;
  res.status(403).json({ message: 'Your account does not have permission to perform this task.' });
  return false;
}

function clean(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function escapeRegex(value) {
  return Array.from(value, (character) => REGEX_SPECIAL.has(character) ? '\\' + character : character).join('');
}

function currentAcademicYear(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric' }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const startYear = month >= 4 ? year : year - 1;
  return startYear + '-' + (startYear + 1);
}

function dateYear(date, timeZone) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(date)).toString();
}

async function nextTenantSequence({ organizationId, branchId, sequenceType, year, session }) {
  const filter = { organizationId, branchId, sequenceType, year: String(year) };
  try {
    let query = TenantSequence.findOneAndUpdate(
      filter,
      { $inc: { value: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );
    if (session) query = query.session(session);
    const sequence = await query;
    return sequence.value;
  } catch (error) {
    if (error.code !== 11000) throw error;
    let retry = TenantSequence.findOneAndUpdate(filter, { $inc: { value: 1 } }, { new: true, runValidators: true });
    if (session) retry = retry.session(session);
    const sequence = await retry;
    if (!sequence) throw error;
    return sequence.value;
  }
}

async function createAudit(req, session, { action, resourceType, resourceId, summary, changedFields = [], reason = '' }) {
  const payload = {
    organizationId: req.tenant.organization._id,
    branchId: req.tenant.branch?._id || null,
    actorUserId: req.user._id,
    action,
    resourceType,
    resourceId: String(resourceId || ''),
    summary: clean(summary, 500),
    reason: clean(reason, 500),
    changedFields,
    ipAddress: String(req.ip || '').slice(0, 64),
    userAgent: String(req.get('user-agent') || '').slice(0, 300),
  };
  const audit = await AuditEvent.create([payload], session ? { session } : {});
  return audit[0];
}

async function inTransaction(work) {
  let session;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    if (session) await session.endSession();
  }
}

function childName(child) {
  return [child.firstName, child.middleName, child.lastName].filter(Boolean).join(' ').trim();
}

function serializeGuardianLink(link) {
  const guardian = link.guardianId;
  if (!guardian) return null;
  return {
    id: String(guardian._id),
    name: guardian.fullName,
    email: guardian.email || '',
    phone: guardian.phone,
    relationship: link.relationship,
    primaryContact: Boolean(link.isPrimaryContact),
    billingContact: Boolean(link.isBillingContact),
    emergencyContact: Boolean(link.isEmergencyContact),
    authorizedPickup: Boolean(link.authorizedPickup),
    receivesSchoolUpdates: Boolean(link.receivesSchoolUpdates),
    consent: link.consent || {},
  };
}

async function serializeChildren(children, organizationId, branchId) {
  if (!children.length) return [];
  const links = await ChildGuardian.find({
    organizationId,
    branchId,
    childId: { $in: children.map((child) => child._id) },
  })
    .populate({ path: 'guardianId', select: 'fullName email phone alternatePhone preferredLanguage' })
    .lean();
  const guardiansByChild = new Map();
  for (const link of links) {
    const key = String(link.childId);
    const existing = guardiansByChild.get(key) || [];
    const safeLink = serializeGuardianLink(link);
    if (safeLink) existing.push(safeLink);
    guardiansByChild.set(key, existing);
  }
  return children.map((child) => ({
    id: String(child._id),
    admissionNumber: child.stuNo,
    firstName: child.firstName || '',
    middleName: child.middleName || '',
    lastName: child.lastName || '',
    fullName: childName(child),
    dateOfBirth: child.dob || '',
    gender: child.gender || '',
    className: child.standard || '',
    academicYear: child.batchYear || '',
    address: child.address || '',
    guardians: guardiansByChild.get(String(child._id)) || [],
    createdAt: child.createdAt,
    updatedAt: child.updatedAt,
  }));
}

function validateChildInput(body = {}, timeZone) {
  const firstName = clean(body.firstName, 80);
  const middleName = clean(body.middleName, 80);
  const lastName = clean(body.lastName, 80);
  const gender = clean(body.gender, 20);
  const standard = clean(body.className || body.standard, 80);
  const dob = clean(body.dateOfBirth || body.dob, 10);
  const address = clean(body.address, 500);
  const academicYear = clean(body.academicYear || body.batchYear, 20) || currentAcademicYear(timeZone);
  const guardians = Array.isArray(body.guardians) ? body.guardians : [];
  const errors = {};

  if (firstName.length < 1) errors.firstName = 'Enter the child’s first name.';
  if (gender && !VALID_GENDER.has(gender)) errors.gender = 'Choose a valid gender.';
  if (!standard || !Object.prototype.hasOwnProperty.call(STANDARD_FEES, standard)) {
    errors.className = 'Choose a class from the configured preschool classes.';
  }
  if (dob && !parseDateOnly(dob)) errors.dateOfBirth = 'Enter a real date of birth.';
  if (!/^\d{4}-\d{4}$/.test(academicYear) || Number(academicYear.slice(5)) !== Number(academicYear.slice(0, 4)) + 1) {
    errors.academicYear = 'Enter an academic year such as 2026-2027.';
  }
  if (guardians.length < 1 || guardians.length > 5) errors.guardians = 'Add between 1 and 5 parent or guardian contacts.';
  let primaryCount = 0;
  const normalizedGuardians = guardians.slice(0, 5).map((guardian, index) => {
    const name = clean(guardian?.name, 120);
    const relationship = clean(guardian?.relationship || 'guardian', 20).toLowerCase();
    const phone = clean(guardian?.phone, 24);
    const email = clean(guardian?.email, 254).toLowerCase();
    const isPrimaryContact = guardian?.isPrimaryContact === undefined ? index === 0 : guardian.isPrimaryContact === true;
    if (isPrimaryContact) primaryCount += 1;
    if (name.length < 2) errors['guardianName' + index] = 'Enter the name for guardian ' + (index + 1) + '.';
    if (!/^\+?[0-9 ()-]{7,24}$/.test(phone)) errors['guardianPhone' + index] = 'Enter a valid mobile number for guardian ' + (index + 1) + '.';
    if (!VALID_RELATIONSHIPS.has(relationship)) errors['guardianRelationship' + index] = 'Choose a valid relationship for guardian ' + (index + 1) + '.';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors['guardianEmail' + index] = 'Enter a valid guardian email address.';
    return {
      name, relationship, phone, email, isPrimaryContact,
      isBillingContact: guardian?.isBillingContact === true,
      isEmergencyContact: guardian?.isEmergencyContact === true,
      authorizedPickup: guardian?.authorizedPickup === true,
      receivesSchoolUpdates: guardian?.receivesSchoolUpdates !== false,
      preferredLanguage: ['en', 'hi', 'gu'].includes(guardian?.preferredLanguage) ? guardian.preferredLanguage : 'en',
      alternatePhone: clean(guardian?.alternatePhone, 24),
      consent: {
        schoolCommunication: ['unknown', 'granted', 'withdrawn'].includes(guardian?.consent?.schoolCommunication) ? guardian.consent.schoolCommunication : 'unknown',
        photoUse: ['unknown', 'granted', 'withdrawn'].includes(guardian?.consent?.photoUse) ? guardian.consent.photoUse : 'unknown',
        notes: clean(guardian?.consent?.notes, 500),
      },
    };
  });
  if (primaryCount !== 1) errors.primaryGuardian = 'Choose exactly one primary contact.';

  return Object.keys(errors).length
    ? { valid: false, errors }
    : {
      valid: true,
      value: {
        firstName, middleName, lastName, gender, standard, dob, address, academicYear,
        guardians: normalizedGuardians,
      },
    };
}

router.get('/classes', requireBranchContext, async (req, res) => {
  if (!allowed(req, CHILD_READ_ROLES, res)) return;
  try {
    return res.json(Object.entries(STANDARD_FEES).map(([name, amount]) => ({
      name,
      defaultFee: Number(amount) || 0,
      currency: req.tenant.organization.currency || 'INR',
    })));
  } catch (error) {
    console.error('Unable to load configured classes:', error);
    return res.status(503).json({ message: 'Classes could not be loaded.' });
  }
});

router.get('/summary', async (req, res) => {
  if (!allowed(req, ['organization_owner', 'head_office_admin', 'branch_admin', 'accountant', 'admissions'], res)) return;

  const scope = { organizationId: req.tenant.organization._id };
  if (req.tenant.branch) {
    scope.branchId = req.tenant.branch._id;
  } else if (!req.tenant.membership.accessAllBranches) {
    scope.branchId = { $in: req.tenant.membership.branchIds || [] };
  }

  const timezone = req.tenant.branch?.timezone || req.tenant.organization.timezone || 'Asia/Kolkata';
  const today = getTodayInTimeZone(timezone);
  const dayBounds = today ? getZonedDayBounds(today, timezone) : null;
  if (!dayBounds) return res.status(500).json({ message: 'The school time zone is not configured correctly.' });
  const attendanceDate = parseDateOnly(today);

  try {
    const [childrenCount, newChildrenCount, attendanceRecords, feeInvoices, transactionsToday, branchCount] = await Promise.all([
      Student.countDocuments(scope),
      Student.countDocuments({ ...scope, createdAt: { $gte: dayBounds.start, $lt: dayBounds.end } }),
      Attendance.find({ ...scope, date: attendanceDate }).select('studentDetails').lean(),
      FeeInvoice.find({ ...scope, status: 'open' }).select('_id totalAmountPaise').lean(),
      FeeTransaction.find({ ...scope, transactionAt: { $gte: dayBounds.start, $lt: dayBounds.end } }).select('type amountPaise').lean(),
      Branch.countDocuments({ organizationId: req.tenant.organization._id, status: 'active', ...(req.tenant.membership.accessAllBranches ? {} : { _id: { $in: req.tenant.membership.branchIds || [] } }) }),
    ]);

    const seenAttendance = new Map();
    for (const record of attendanceRecords) {
      for (const item of record.studentDetails || []) seenAttendance.set(String(item.studentId), item.status);
    }
    const attendanceSummary = { present: 0, absent: 0, recorded: seenAttendance.size };
    for (const status of seenAttendance.values()) {
      if (status === 'present') attendanceSummary.present += 1;
      if (status === 'absent') attendanceSummary.absent += 1;
    }

    const invoiceIds = feeInvoices.map((invoice) => invoice._id);
    const allTransactions = invoiceIds.length
      ? await FeeTransaction.find({ ...scope, invoiceId: { $in: invoiceIds } }).select('invoiceId type amountPaise').lean()
      : [];
    const transactionsByInvoice = new Map();
    for (const transaction of allTransactions) {
      const key = String(transaction.invoiceId);
      const list = transactionsByInvoice.get(key) || [];
      list.push(transaction);
      transactionsByInvoice.set(key, list);
    }
    let outstandingPaise = 0;
    for (const invoice of feeInvoices) {
      outstandingPaise += calculateInvoiceBalance(invoice.totalAmountPaise, transactionsByInvoice.get(String(invoice._id)) || []).outstandingPaise;
    }
    const collectedTodayPaise = transactionsToday.reduce((total, transaction) =>
      total + (transaction.type === 'payment' ? transaction.amountPaise : -transaction.amountPaise), 0);

    return res.json({
      organization: { id: String(req.tenant.organization._id), name: req.tenant.organization.name },
      branch: req.tenant.branch ? { id: String(req.tenant.branch._id), name: req.tenant.branch.name } : null,
      date: today,
      branchCount,
      children: { total: childrenCount, addedToday: newChildrenCount },
      attendance: attendanceSummary,
      fees: {
        collectedTodayPaise,
        collectedToday: Number(formatPaise(collectedTodayPaise)),
        outstandingPaise,
        outstanding: Number(formatPaise(outstandingPaise)),
        currency: req.tenant.organization.currency || 'INR',
      },
    });
  } catch (error) {
    console.error('Unable to load tenant dashboard summary:', error);
    return res.status(503).json({ message: 'The school summary could not be loaded. Please try again.' });
  }
});

router.get('/children', requireBranchContext, async (req, res) => {
  if (!allowed(req, CHILD_READ_ROLES, res)) return;
  const organizationId = req.tenant.organization._id;
  const branchId = req.tenant.branch._id;
  const search = clean(req.query.q, 100);
  const filter = { organizationId, branchId };
  if (req.query.className || req.query.standard) filter.standard = clean(req.query.className || req.query.standard, 80);
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    const or = [{ firstName: regex }, { middleName: regex }, { lastName: regex }, { stuNo: regex }];
    const matchingGuardians = await Guardian.find({
      organizationId,
      $or: [{ fullName: regex }, { phone: regex }, { email: regex }],
    }).select('_id').lean();
    if (matchingGuardians.length) {
      const links = await ChildGuardian.find({
        organizationId, branchId, guardianId: { $in: matchingGuardians.map((item) => item._id) },
      }).select('childId').lean();
      if (links.length) or.push({ _id: { $in: links.map((link) => link.childId) } });
    }
    filter.$or = or;
  }
  try {
    const children = await Student.find(filter)
      .select('_id firstName middleName lastName stuNo standard batchYear dob gender address createdAt updatedAt')
      .sort({ middleName: 1, lastName: 1, firstName: 1 })
      .limit(500)
      .lean();
    return res.json({ total: children.length, children: await serializeChildren(children, organizationId, branchId) });
  } catch (error) {
    console.error('Unable to list tenant children:', error);
    return res.status(503).json({ message: 'Child records could not be loaded.' });
  }
});

router.get('/children/:id', requireBranchContext, async (req, res) => {
  if (!allowed(req, CHILD_READ_ROLES, res)) return;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid child record.' });
  try {
    const child = await Student.findOne({
      _id: req.params.id, organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id,
    }).select('_id firstName middleName lastName stuNo standard batchYear dob gender address createdAt updatedAt').lean();
    if (!child) return res.status(404).json({ message: 'Child record not found in this branch.' });
    return res.json((await serializeChildren([child], req.tenant.organization._id, req.tenant.branch._id))[0]);
  } catch (error) {
    console.error('Unable to load tenant child:', error);
    return res.status(503).json({ message: 'Child record could not be loaded.' });
  }
});

router.post('/children', requireBranchContext, async (req, res) => {
  if (!allowed(req, CHILD_WRITE_ROLES, res)) return;
  const validation = validateChildInput(req.body, req.tenant.branch.timezone || req.tenant.organization.timezone);
  if (!validation.valid) return res.status(400).json({ message: 'Please correct the child and guardian information.', errors: validation.errors });

  try {
    const createdChild = await inTransaction(async (session) => {
      const year = dateYear(new Date(), req.tenant.branch.timezone || req.tenant.organization.timezone);
      const sequence = await nextTenantSequence({
        organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id, sequenceType: 'admission', year, session,
      });
      const stuNo = 'STU-' + String(req.tenant.organization._id) + '-' + req.tenant.branch.code + '-' + year + '-' + String(sequence).padStart(5, '0');
      const [child] = await Student.create([{
        firstName: validation.value.firstName,
        middleName: validation.value.middleName,
        lastName: validation.value.lastName,
        gender: validation.value.gender || undefined,
        dob: validation.value.dob,
        address: validation.value.address,
        standard: validation.value.standard,
        batchYear: validation.value.academicYear,
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
        createdBy: req.user._id,
        stuNo,
      }], { session });

      for (const guardianInput of validation.value.guardians) {
        const [guardian] = await Guardian.create([{
          organizationId: req.tenant.organization._id,
          fullName: guardianInput.name,
          email: guardianInput.email,
          phone: guardianInput.phone,
          alternatePhone: guardianInput.alternatePhone,
          preferredLanguage: guardianInput.preferredLanguage,
          createdBy: req.user._id,
        }], { session });
        const consentGiven = guardianInput.consent.schoolCommunication !== 'unknown' || guardianInput.consent.photoUse !== 'unknown';
        await ChildGuardian.create([{
          organizationId: req.tenant.organization._id,
          branchId: req.tenant.branch._id,
          childId: child._id,
          guardianId: guardian._id,
          relationship: guardianInput.relationship,
          isPrimaryContact: guardianInput.isPrimaryContact,
          isBillingContact: guardianInput.isBillingContact,
          isEmergencyContact: guardianInput.isEmergencyContact,
          authorizedPickup: guardianInput.authorizedPickup,
          receivesSchoolUpdates: guardianInput.receivesSchoolUpdates,
          consent: {
            ...guardianInput.consent,
            consentRecordedAt: consentGiven ? new Date() : null,
            consentRecordedBy: consentGiven ? req.user._id : null,
          },
          createdBy: req.user._id,
        }], { session });
      }
      await createAudit(req, session, {
        action: 'child.created', resourceType: 'student', resourceId: child._id,
        summary: 'Child record and guardian links created.',
        changedFields: ['name', 'dateOfBirth', 'gender', 'className', 'academicYear', 'guardians'],
      });
      return child;
    });
    const populated = await Student.findOne({
      _id: createdChild._id, organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id,
    }).select('_id firstName middleName lastName stuNo standard batchYear dob gender address createdAt updatedAt').lean();
    const result = await serializeChildren([populated], req.tenant.organization._id, req.tenant.branch._id);
    return res.status(201).json({ message: 'Child registered successfully.', child: result[0] });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'A conflicting admission identifier already exists. Please try again.' });
    console.error('Unable to create tenant child:', error.message);
    return res.status(503).json({ message: 'Child registration could not be completed safely.' });
  }
});

router.put('/children/:id', requireBranchContext, async (req, res) => {
  if (!allowed(req, CHILD_WRITE_ROLES, res)) return;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid child record.' });
  const allowedFields = ['firstName', 'middleName', 'lastName', 'gender', 'standard', 'batchYear', 'dob', 'address'];
  const updates = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      const value = typeof req.body[field] === 'string' ? req.body[field].trim() : '';
      if (field === 'firstName' && !value) return res.status(400).json({ message: 'Child first name cannot be empty.' });
      if (field === 'gender' && value && !VALID_GENDER.has(value)) return res.status(400).json({ message: 'Choose a valid gender.' });
      if (field === 'standard' && !Object.prototype.hasOwnProperty.call(STANDARD_FEES, value)) return res.status(400).json({ message: 'Choose a configured class.' });
      if (field === 'dob' && value && !parseDateOnly(value)) return res.status(400).json({ message: 'Enter a real date of birth.' });
      updates[field] = value;
    }
  }
  if (!Object.keys(updates).length) return res.status(400).json({ message: 'There are no valid child fields to update.' });
  if (updates.batchYear && (!/^\d{4}-\d{4}$/.test(updates.batchYear) || Number(updates.batchYear.slice(5)) !== Number(updates.batchYear.slice(0, 4)) + 1)) {
    return res.status(400).json({ message: 'Enter a valid academic year.' });
  }
  updates.updatedBy = req.user._id;

  try {
    const updated = await inTransaction(async (session) => {
      const child = await Student.findOneAndUpdate(
        { _id: req.params.id, organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id },
        { $set: updates },
        { new: true, runValidators: true, session },
      ).select('_id firstName middleName lastName stuNo standard batchYear dob gender address createdAt updatedAt');
      if (!child) {
        const notFound = new Error('Child record not found in this branch.');
        notFound.code = 'NOT_FOUND';
        throw notFound;
      }
      await createAudit(req, session, {
        action: 'child.updated', resourceType: 'student', resourceId: child._id,
        summary: 'Child record updated.',
        changedFields: Object.keys(updates).filter((field) => field !== 'updatedBy'),
        reason: clean(req.body.reason, 500),
      });
      return child;
    });
    const result = await serializeChildren([updated.toObject ? updated.toObject() : updated], req.tenant.organization._id, req.tenant.branch._id);
    return res.json({ message: 'Child record updated.', child: result[0] });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return res.status(404).json({ message: error.message });
    console.error('Unable to update tenant child:', error.message);
    return res.status(503).json({ message: 'Child record could not be updated safely.' });
  }
});

router.get('/attendance', requireBranchContext, async (req, res) => {
  if (!allowed(req, CHILD_READ_ROLES, res)) return;
  const timeZone = req.tenant.branch.timezone || req.tenant.organization.timezone;
  const date = clean(req.query.date, 10) || getTodayInTimeZone(timeZone);
  const parsedDate = parseDateOnly(date);
  if (!parsedDate) return res.status(400).json({ message: 'Choose a valid attendance date.' });
  const standard = clean(req.query.className || req.query.standard, 80);
  const filter = { organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id, date: parsedDate };
  if (standard) filter.standard = standard;
  try {
    const records = await Attendance.find(filter)
      .populate({ path: 'studentDetails.studentId', select: 'firstName middleName lastName stuNo standard' })
      .sort({ standard: 1 })
      .lean();
    return res.json(records.map((record) => ({
      id: String(record._id), date, className: record.standard, updatedAt: record.updatedAt,
      children: (record.studentDetails || []).map((entry) => ({
        id: entry.studentId ? String(entry.studentId._id) : '',
        name: entry.studentId ? childName(entry.studentId) : 'Unknown child',
        admissionNumber: entry.studentId?.stuNo || '',
        status: entry.status,
        reason: entry.reason || '',
      })),
    })));
  } catch (error) {
    console.error('Unable to load tenant attendance:', error);
    return res.status(503).json({ message: 'Attendance records could not be loaded.' });
  }
});

router.post('/attendance', requireBranchContext, async (req, res) => {
  if (!allowed(req, ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions'], res)) return;
  const date = clean(req.body?.date, 10);
  const parsedDate = parseDateOnly(date);
  const standard = clean(req.body?.className || req.body?.standard, 80);
  const submitted = Array.isArray(req.body?.children) ? req.body.children : [];
  if (!parsedDate) return res.status(400).json({ message: 'Choose a valid attendance date.' });
  if (!standard || !Object.prototype.hasOwnProperty.call(STANDARD_FEES, standard)) return res.status(400).json({ message: 'Choose a configured class.' });
  if (!submitted.length || submitted.length > 500) return res.status(400).json({ message: 'Attendance must include between 1 and 500 children.' });

  const ids = submitted.map((entry) => String(entry?.childId || ''));
  if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id)) || new Set(ids).size !== ids.length) {
    return res.status(400).json({ message: 'Attendance contains an invalid or repeated child.' });
  }
  const statuses = [];
  for (const [index, item] of submitted.entries()) {
    const status = clean(item?.status, 20).toLowerCase();
    const reason = clean(item?.reason, 300);
    if (!['present', 'absent'].includes(status)) return res.status(400).json({ message: 'Choose Present or Absent for every child.' });
    if (status === 'absent' && !reason) return res.status(400).json({ message: 'Add a reason for each child marked absent.' });
    statuses.push({ studentId: ids[index], status, reason: status === 'absent' ? reason : '' });
  }

  try {
    const saved = await inTransaction(async (session) => {
      const children = await Student.find({
        _id: { $in: ids }, organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id, standard,
      }).select('_id').session(session).lean();
      if (children.length !== ids.length) {
        const mismatch = new Error('The selected children do not all belong to this class and branch.');
        mismatch.code = 'CLASS_MISMATCH';
        throw mismatch;
      }
      const allClassChildren = await Student.find({
        organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id, standard,
      }).select('_id').session(session).lean();
      const submittedSet = new Set(ids);
      if (allClassChildren.length !== ids.length || allClassChildren.some((child) => !submittedSet.has(String(child._id)))) {
        const incomplete = new Error('Attendance must include every registered child in the selected class.');
        incomplete.code = 'INCOMPLETE_ATTENDANCE';
        throw incomplete;
      }

      const record = await Attendance.findOneAndUpdate(
        { organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id, date: parsedDate, standard },
        { $set: { studentDetails: statuses, recordedBy: req.user._id } },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true, session },
      );
      await createAudit(req, session, {
        action: 'attendance.saved', resourceType: 'attendance', resourceId: record._id,
        summary: 'Daily attendance saved for ' + standard + ' on ' + date + '.',
        changedFields: ['date', 'className', 'childrenStatuses'],
      });
      return record;
    });

    return res.json({
      message: 'Attendance saved.', recordId: String(saved._id), date, className: standard,
      total: statuses.length,
      present: statuses.filter((entry) => entry.status === 'present').length,
      absent: statuses.filter((entry) => entry.status === 'absent').length,
    });
  } catch (error) {
    if (error.code === 'CLASS_MISMATCH' || error.code === 'INCOMPLETE_ATTENDANCE') return res.status(400).json({ message: error.message });
    if (error.code === 11000) return res.status(409).json({ message: 'Attendance was saved by another user. Reload the class and review it before saving again.' });
    console.error('Unable to save tenant attendance:', error.message);
    return res.status(503).json({ message: 'Attendance could not be saved safely.' });
  }
});

function invoiceFilter(req) {
  return { organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id };
}

async function serializeInvoices(invoices, req) {
  if (!invoices.length) return [];
  const invoiceIds = invoices.map((invoice) => invoice._id);
  const transactions = await FeeTransaction.find({
    organizationId: req.tenant.organization._id,
    branchId: req.tenant.branch._id,
    invoiceId: { $in: invoiceIds },
  }).sort({ transactionAt: 1, createdAt: 1 }).lean();
  const childIds = [...new Set(invoices.map((invoice) => String(invoice.childId)))];
  const children = await Student.find({
    _id: { $in: childIds },
    organizationId: req.tenant.organization._id,
    branchId: req.tenant.branch._id,
  }).select('_id firstName middleName lastName stuNo standard').lean();
  const childById = new Map(children.map((child) => [String(child._id), child]));
  const transactionsByInvoice = new Map();
  for (const txn of transactions) {
    const key = String(txn.invoiceId);
    const list = transactionsByInvoice.get(key) || [];
    list.push(txn);
    transactionsByInvoice.set(key, list);
  }
  return invoices.map((invoice) => {
    const ledger = transactionsByInvoice.get(String(invoice._id)) || [];
    const balance = calculateInvoiceBalance(invoice.totalAmountPaise, ledger);
    return {
      id: String(invoice._id), invoiceNumber: invoice.invoiceNumber, academicYear: invoice.academicYear,
      child: childById.has(String(invoice.childId)) ? {
        id: String(invoice.childId),
        name: childName(childById.get(String(invoice.childId))),
        admissionNumber: childById.get(String(invoice.childId)).stuNo,
        className: childById.get(String(invoice.childId)).standard,
      } : null,
      lineItems: (invoice.lineItems || []).map((item) => ({
        description: item.description, quantity: item.quantity,
        unitAmountPaise: item.unitAmountPaise, unitAmount: Number(formatPaise(item.unitAmountPaise)),
        lineTotalPaise: item.lineTotalPaise, lineTotal: Number(formatPaise(item.lineTotalPaise)),
      })),
      subtotalPaise: invoice.subtotalPaise, subtotal: Number(formatPaise(invoice.subtotalPaise)),
      discountPaise: invoice.discountPaise, discount: Number(formatPaise(invoice.discountPaise)),
      totalAmountPaise: invoice.totalAmountPaise, totalAmount: Number(formatPaise(invoice.totalAmountPaise)),
      paidPaise: balance.netPaidPaise, paid: Number(formatPaise(balance.netPaidPaise)),
      outstandingPaise: balance.outstandingPaise, outstanding: Number(formatPaise(balance.outstandingPaise)),
      overpaidPaise: balance.overpaidPaise, status: invoice.status,
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : '',
      notes: invoice.notes || '',
      transactions: ledger.map((txn) => ({
        id: String(txn._id), receiptNumber: txn.receiptNumber, type: txn.type,
        amountPaise: txn.amountPaise, amount: Number(formatPaise(txn.amountPaise)),
        method: txn.method, reference: txn.reference || '', transactionAt: txn.transactionAt,
        relatedTransactionId: txn.relatedTransactionId ? String(txn.relatedTransactionId) : null,
        reason: txn.reason || '',
      })),
      createdAt: invoice.createdAt,
    };
  });
}

router.get('/fees/invoices', requireBranchContext, async (req, res) => {
  if (!allowed(req, MONEY_READ_ROLES, res)) return;
  const filter = invoiceFilter(req);
  if (req.query.childId) {
    if (!mongoose.Types.ObjectId.isValid(String(req.query.childId))) return res.status(400).json({ message: 'Choose a valid child record.' });
    filter.childId = req.query.childId;
  }
  if (req.query.status === 'open' || req.query.status === 'void') filter.status = req.query.status;
  try {
    const invoices = await FeeInvoice.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    return res.json({ total: invoices.length, invoices: await serializeInvoices(invoices, req) });
  } catch (error) {
    console.error('Unable to list tenant fee invoices:', error);
    return res.status(503).json({ message: 'Fee invoices could not be loaded.' });
  }
});

router.post('/fees/invoices', requireBranchContext, async (req, res) => {
  if (!allowed(req, MONEY_WRITE_ROLES, res)) return;
  const childId = String(req.body?.childId || '');
  const academicYear = clean(req.body?.academicYear, 20);
  if (!mongoose.Types.ObjectId.isValid(childId)) return res.status(400).json({ message: 'Choose a valid child.' });
  if (!/^\d{4}-\d{4}$/.test(academicYear) || Number(academicYear.slice(5)) !== Number(academicYear.slice(0, 4)) + 1) {
    return res.status(400).json({ message: 'Enter an academic year such as 2026-2027.' });
  }
  const lines = normalizeInvoiceLines(req.body?.lineItems);
  if (!lines.valid) return res.status(400).json({ message: lines.error });
  const discountPaise = parseMoneyToPaise(req.body?.discount || '0');
  if (discountPaise === null || discountPaise > lines.subtotalPaise) {
    return res.status(400).json({ message: 'Discount must be a valid amount no greater than the subtotal.' });
  }
  const totalAmountPaise = lines.subtotalPaise - discountPaise;
  if (totalAmountPaise < 1 || totalAmountPaise > MAX_MONEY_PAISE) {
    return res.status(400).json({ message: 'Invoice total must be greater than zero and within the allowed limit.' });
  }
  const dueDateText = clean(req.body?.dueDate, 10);
  const dueDate = dueDateText ? parseDateOnly(dueDateText) : null;
  if (dueDateText && !dueDate) return res.status(400).json({ message: 'Enter a valid due date.' });
  const notes = clean(req.body?.notes, 1000);

  try {
    const invoice = await inTransaction(async (session) => {
      const child = await Student.findOne({
        _id: childId, organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id,
      }).select('_id').session(session).lean();
      if (!child) {
        const notFound = new Error('The child does not belong to the selected organization and branch.');
        notFound.code = 'CHILD_NOT_FOUND';
        throw notFound;
      }
      const year = academicYear.slice(0, 4);
      const sequence = await nextTenantSequence({
        organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id, sequenceType: 'invoice', year, session,
      });
      const invoiceNumber = 'INV-' + req.tenant.branch.code + '-' + year + '-' + String(sequence).padStart(6, '0');
      const [created] = await FeeInvoice.create([{
        organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id,
        childId, invoiceNumber, academicYear, lineItems: lines.lineItems,
        subtotalPaise: lines.subtotalPaise, discountPaise, totalAmountPaise, dueDate, notes, createdBy: req.user._id,
      }], { session });
      await createAudit(req, session, {
        action: 'fee.invoice_created', resourceType: 'fee_invoice', resourceId: created._id,
        summary: 'Fee invoice created: ' + invoiceNumber + '.',
        changedFields: ['childId', 'academicYear', 'lineItems', 'discount', 'dueDate'],
      });
      return created;
    });
    const [result] = await serializeInvoices([invoice.toObject ? invoice.toObject() : invoice], req);
    return res.status(201).json({ message: 'Invoice created.', invoice: result });
  } catch (error) {
    if (error.code === 'CHILD_NOT_FOUND') return res.status(404).json({ message: error.message });
    if (error.code === 11000) return res.status(409).json({ message: 'An invoice number conflict occurred. Please try again.' });
    console.error('Unable to create tenant invoice:', error.message);
    return res.status(503).json({ message: 'The invoice could not be created safely.' });
  }
});

router.post('/fees/invoices/:id/transactions', requireBranchContext, async (req, res) => {
  if (!allowed(req, MONEY_WRITE_ROLES, res)) return;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid invoice.' });
  const type = clean(req.body?.type || 'payment', 20).toLowerCase();
  const amountPaise = parseMoneyToPaise(req.body?.amount);
  const method = clean(req.body?.method, 30);
  const reference = clean(req.body?.reference, 160);
  const reason = clean(req.body?.reason, 500);
  const relatedTransactionId = clean(req.body?.relatedTransactionId, 32);
  if (!['payment', 'refund'].includes(type)) return res.status(400).json({ message: 'Choose Payment or Refund.' });
  if (amountPaise === null || amountPaise < 1) return res.status(400).json({ message: 'Enter an amount greater than zero with up to 2 decimal places.' });
  if (!VALID_METHODS.has(method)) return res.status(400).json({ message: 'Choose a valid payment method.' });
  if (type === 'refund' && !allowed(req, REFUND_ROLES, res)) return;
  if (type === 'refund' && (reason.length < 3 || !mongoose.Types.ObjectId.isValid(relatedTransactionId))) {
    return res.status(400).json({ message: 'Refunds need a reason and the original payment record.' });
  }
  const transactionAt = req.body?.transactionAt ? new Date(req.body.transactionAt) : new Date();
  if (Number.isNaN(transactionAt.getTime()) || transactionAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return res.status(400).json({ message: 'Choose a valid transaction date and time that is not in the future.' });
  }

  try {
    const transaction = await inTransaction(async (session) => {
      const invoice = await FeeInvoice.findOne({
        _id: req.params.id, organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id, status: 'open',
      }).session(session).lean();
      if (!invoice) {
        const notFound = new Error('Open invoice not found in this branch.');
        notFound.code = 'INVOICE_NOT_FOUND';
        throw notFound;
      }
      const existing = await FeeTransaction.find({
        organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id, invoiceId: invoice._id,
      }).session(session).lean();
      const balance = calculateInvoiceBalance(invoice.totalAmountPaise, existing);
      if (type === 'payment' && amountPaise > balance.outstandingPaise) {
        const overPayment = new Error('Payment exceeds the outstanding balance of ₹' + formatPaise(balance.outstandingPaise) + '.');
        overPayment.code = 'PAYMENT_EXCEEDS_BALANCE';
        throw overPayment;
      }

      let related = null;
      if (type === 'refund') {
        related = existing.find((entry) => String(entry._id) === relatedTransactionId && entry.type === 'payment');
        if (!related) {
          const badLink = new Error('The original payment was not found for this invoice.');
          badLink.code = 'REFUND_ORIGINAL_NOT_FOUND';
          throw badLink;
        }
        const alreadyRefundedPaise = existing
          .filter((entry) => entry.type === 'refund' && String(entry.relatedTransactionId) === relatedTransactionId)
          .reduce((sum, entry) => sum + entry.amountPaise, 0);
        if (amountPaise > related.amountPaise - alreadyRefundedPaise) {
          const excessiveRefund = new Error('Refund exceeds the amount remaining on the original payment.');
          excessiveRefund.code = 'REFUND_EXCEEDS_PAYMENT';
          throw excessiveRefund;
        }
      }

      const year = dateYear(transactionAt, req.tenant.branch.timezone || req.tenant.organization.timezone);
      const sequence = await nextTenantSequence({
        organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id, sequenceType: 'receipt', year, session,
      });
      const receiptNumber = 'REC-' + req.tenant.branch.code + '-' + year + '-' + String(sequence).padStart(6, '0');
      const [created] = await FeeTransaction.create([{
        organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id,
        invoiceId: invoice._id, childId: invoice.childId, receiptNumber, type, amountPaise, method,
        reference, transactionAt, relatedTransactionId: related?._id || null,
        reason: type === 'refund' ? reason : '', recordedBy: req.user._id,
      }], { session });
      await createAudit(req, session, {
        action: type === 'payment' ? 'fee.payment_recorded' : 'fee.refund_recorded',
        resourceType: 'fee_transaction', resourceId: created._id,
        summary: (type === 'payment' ? 'Payment recorded: ' : 'Refund recorded: ') + receiptNumber + '.',
        changedFields: ['type', 'amount', 'method', 'transactionAt'],
        reason: type === 'refund' ? reason : '',
      });
      return created;
    });

    const invoice = await FeeInvoice.findOne({
      _id: req.params.id, organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id,
    }).lean();
    const [result] = await serializeInvoices([invoice], req);
    return res.status(201).json({
      message: type === 'payment' ? 'Payment recorded.' : 'Refund recorded.',
      transaction: {
        id: String(transaction._id), receiptNumber: transaction.receiptNumber, type: transaction.type,
        amountPaise: transaction.amountPaise, amount: Number(formatPaise(transaction.amountPaise)),
        method: transaction.method, transactionAt: transaction.transactionAt,
      },
      invoice: result,
    });
  } catch (error) {
    if (['INVOICE_NOT_FOUND', 'REFUND_ORIGINAL_NOT_FOUND'].includes(error.code)) return res.status(404).json({ message: error.message });
    if (['PAYMENT_EXCEEDS_BALANCE', 'REFUND_EXCEEDS_PAYMENT'].includes(error.code)) return res.status(409).json({ message: error.message });
    if (error.code === 11000) return res.status(409).json({ message: 'The receipt number was already used. Please try again.' });
    console.error('Unable to record tenant financial transaction:', error.message);
    return res.status(503).json({ message: 'The financial transaction could not be saved safely.' });
  }
});

router.post('/fees/invoices/:id/void', requireBranchContext, async (req, res) => {
  if (!allowed(req, ['organization_owner', 'head_office_admin', 'accountant'], res)) return;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid invoice.' });
  const reason = clean(req.body?.reason, 500);
  if (reason.length < 3) return res.status(400).json({ message: 'Enter a reason before voiding the invoice.' });
  try {
    await inTransaction(async (session) => {
      const invoice = await FeeInvoice.findOne({
        _id: req.params.id, organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id, status: 'open',
      }).session(session);
      if (!invoice) {
        const notFound = new Error('Open invoice not found in this branch.');
        notFound.code = 'INVOICE_NOT_FOUND';
        throw notFound;
      }
      const existingTransactions = await FeeTransaction.countDocuments({
        organizationId: req.tenant.organization._id, branchId: req.tenant.branch._id, invoiceId: invoice._id,
      }).session(session);
      if (existingTransactions > 0) {
        const hasTransactions = new Error('An invoice with payments or refunds cannot be voided. Record a refund or contact your administrator.');
        hasTransactions.code = 'INVOICE_HAS_TRANSACTIONS';
        throw hasTransactions;
      }
      invoice.status = 'void';
      invoice.voidedAt = new Date();
      invoice.voidedBy = req.user._id;
      invoice.voidReason = reason;
      await invoice.save({ session });
      await createAudit(req, session, {
        action: 'fee.invoice_voided', resourceType: 'fee_invoice', resourceId: invoice._id,
        summary: 'Invoice voided: ' + invoice.invoiceNumber + '.',
        changedFields: ['status'], reason,
      });
    });
    return res.json({ message: 'Invoice voided.' });
  } catch (error) {
    if (error.code === 'INVOICE_NOT_FOUND') return res.status(404).json({ message: error.message });
    if (error.code === 'INVOICE_HAS_TRANSACTIONS') return res.status(409).json({ message: error.message });
    console.error('Unable to void tenant invoice:', error.message);
    return res.status(503).json({ message: 'The invoice could not be voided safely.' });
  }
});

module.exports = router;
