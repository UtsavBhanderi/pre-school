'use strict';

const express = require('express');
const mongoose = require('mongoose');
const ChildGuardian = require('../models/ChildGuardian');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const FeeInvoice = require('../models/FeeInvoice');
const FeeTransaction = require('../models/FeeTransaction');
const { tenantContext } = require('../middleware/tenantContext');
const { parseDateOnly } = require('../utils/dateOnly');
const { calculateInvoiceBalance, calculateInvoiceBalanceForStatus, formatPaise } = require('../utils/tenantMoney');
const { getTodayInTimeZone } = require('../utils/zonedDate');

const router = express.Router();
router.use(tenantContext);

function requireParent(req, res) {
  const membership = req.tenant?.membership;
  if (membership?.role !== 'parent' || membership.status !== 'active') {
    res.status(403).json({ message: 'This area is only available to an active parent or guardian account.' });
    return false;
  }
  if (!Array.isArray(membership.guardianIds) || !membership.guardianIds.length) {
    res.status(403).json({ message: 'This parent account does not have verified family links. Contact the preschool administrator.' });
    return false;
  }
  return true;
}

function authorizedBranchIds(req) {
  if (req.tenant.branch) return [req.tenant.branch._id];
  return req.tenant.membership.branchIds || [];
}

function childName(child) {
  return [child.firstName, child.middleName, child.lastName].filter(Boolean).join(' ').trim();
}

async function linkedChildren(req) {
  const branchIds = authorizedBranchIds(req);
  if (!branchIds.length) return { children: [], links: [], childIds: [] };

  const links = await ChildGuardian.find({
    organizationId: req.tenant.organization._id,
    branchId: { $in: branchIds },
    guardianId: { $in: req.tenant.membership.guardianIds },
  })
    .select('childId guardianId branchId relationship isPrimaryContact isBillingContact isEmergencyContact authorizedPickup receivesSchoolUpdates consent')
    .populate({ path: 'guardianId', select: 'fullName preferredLanguage' })
    .lean();

  const childIds = [...new Set(links.map((link) => String(link.childId)))];
  if (!childIds.length) return { children: [], links, childIds: [] };

  const children = await Student.find({
    _id: { $in: childIds },
    organizationId: req.tenant.organization._id,
    branchId: { $in: branchIds },
  })
    .select('_id firstName middleName lastName stuNo standard batchYear dob gender address branchId')
    .populate({ path: 'branchId', select: 'name code' })
    .sort({ standard: 1, middleName: 1, lastName: 1 })
    .lean();

  const availableIds = new Set(children.map((child) => String(child._id)));
  const safeLinks = links.filter((link) => availableIds.has(String(link.childId)));
  return { children, links: safeLinks, childIds: children.map((child) => String(child._id)) };
}

function serializeOwnChild(child, links) {
  const ownLinks = links.filter((link) => String(link.childId) === String(child._id));
  return {
    id: String(child._id),
    name: childName(child),
    admissionNumber: child.stuNo || '',
    className: child.standard || '',
    academicYear: child.batchYear || '',
    dateOfBirth: child.dob || '',
    gender: child.gender || '',
    address: child.address || '',
    branch: child.branchId ? { name: child.branchId.name, code: child.branchId.code } : null,
    relationships: ownLinks.map((link) => ({
      relationship: link.relationship,
      isPrimaryContact: Boolean(link.isPrimaryContact),
      isBillingContact: Boolean(link.isBillingContact),
      authorizedPickup: Boolean(link.authorizedPickup),
      receivesSchoolUpdates: Boolean(link.receivesSchoolUpdates),
      consent: link.consent ? {
        schoolCommunication: link.consent.schoolCommunication || 'unknown',
        photoUse: link.consent.photoUse || 'unknown',
      } : { schoolCommunication: 'unknown', photoUse: 'unknown' },
    })),
  };
}

router.get('/summary', async (req, res) => {
  if (!requireParent(req, res)) return;
  try {
    const { children, links, childIds } = await linkedChildren(req);
    const timeZone = req.tenant.branch?.timezone || req.tenant.organization.timezone || 'Asia/Kolkata';
    const today = getTodayInTimeZone(timeZone);
    const todayDate = today ? parseDateOnly(today) : null;
    if (!todayDate) return res.status(500).json({ message: 'The school time zone is not configured correctly.' });
    const branchIds = authorizedBranchIds(req);
    const records = childIds.length ? await Attendance.find({
      organizationId: req.tenant.organization._id,
      branchId: { $in: branchIds },
      date: todayDate,
      'studentDetails.studentId': { $in: childIds },
    }).select('studentDetails').lean() : [];

    const states = new Map();
    const visible = new Set(childIds);
    for (const record of records) {
      for (const detail of record.studentDetails || []) {
        const id = String(detail.studentId);
        if (visible.has(id)) states.set(id, detail.status);
      }
    }
    const billableChildIds = [...new Set(links
      .filter((link) => link.isBillingContact)
      .map((link) => String(link.childId)))];
    const openInvoices = billableChildIds.length ? await FeeInvoice.find({
      organizationId: req.tenant.organization._id,
      branchId: { $in: branchIds },
      childId: { $in: billableChildIds },
      status: 'open',
    }).select('_id totalAmountPaise').lean() : [];
    const transactions = openInvoices.length ? await FeeTransaction.find({
      organizationId: req.tenant.organization._id,
      branchId: { $in: branchIds },
      invoiceId: { $in: openInvoices.map((invoice) => invoice._id) },
    }).select('invoiceId type amountPaise').lean() : [];
    const byInvoice = new Map();
    for (const txn of transactions) {
      const key = String(txn.invoiceId);
      const rows = byInvoice.get(key) || [];
      rows.push(txn);
      byInvoice.set(key, rows);
    }
    let outstandingPaise = 0;
    for (const invoice of openInvoices) {
      outstandingPaise += calculateInvoiceBalance(invoice.totalAmountPaise, byInvoice.get(String(invoice._id)) || []).outstandingPaise;
    }

    return res.json({
      organization: { name: req.tenant.organization.name, currency: req.tenant.organization.currency || 'INR' },
      date: today,
      children: children.length,
      attendanceToday: { present: [...states.values()].filter((status) => status === 'present').length, absent: [...states.values()].filter((status) => status === 'absent').length },
      fees: { outstandingPaise, outstanding: Number(formatPaise(outstandingPaise)), billingChildren: billableChildIds.length },
    });
  } catch (error) {
    console.error('Unable to load parent portal summary:', error.message);
    return res.status(503).json({ message: 'The family summary could not be loaded.' });
  }
});

router.get('/children', async (req, res) => {
  if (!requireParent(req, res)) return;
  try {
    const { children, links } = await linkedChildren(req);
    return res.json({
      total: children.length,
      children: children.map((child) => serializeOwnChild(child, links)),
    });
  } catch (error) {
    console.error('Unable to load parent-linked children:', error.message);
    return res.status(503).json({ message: 'Family records could not be loaded.' });
  }
});

router.get('/children/:id', async (req, res) => {
  if (!requireParent(req, res)) return;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid child record.' });
  try {
    const { children, links } = await linkedChildren(req);
    const child = children.find((entry) => String(entry._id) === req.params.id);
    if (!child) return res.status(404).json({ message: 'This child is not connected to your parent account.' });
    return res.json(serializeOwnChild(child, links));
  } catch (error) {
    console.error('Unable to load parent-linked child:', error.message);
    return res.status(503).json({ message: 'The child record could not be loaded.' });
  }
});

router.get('/attendance', async (req, res) => {
  if (!requireParent(req, res)) return;
  const dateTo = clean(req.query.to, 10) || getTodayInTimeZone(req.tenant.branch?.timezone || req.tenant.organization.timezone);
  const toDate = parseDateOnly(dateTo);
  const defaultFrom = new Date(toDate || new Date());
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  const defaultFromText = defaultFrom.toISOString().slice(0, 10);
  const dateFrom = clean(req.query.from, 10) || defaultFromText;
  const fromDate = parseDateOnly(dateFrom);
  if (!fromDate || !toDate || fromDate > toDate) return res.status(400).json({ message: 'Choose a valid attendance date range.' });
  if ((toDate - fromDate) / (24 * 60 * 60 * 1000) > 90) return res.status(400).json({ message: 'Choose a range of 91 days or less.' });

  try {
    const { children, links, childIds } = await linkedChildren(req);
    const visibleIds = new Set(childIds);
    const records = childIds.length ? await Attendance.find({
      organizationId: req.tenant.organization._id,
      branchId: { $in: authorizedBranchIds(req) },
      date: { $gte: fromDate, $lte: toDate },
      'studentDetails.studentId': { $in: childIds },
    }).select('date standard studentDetails createdAt updatedAt').sort({ date: -1, updatedAt: -1 }).limit(1000).lean() : [];
    const byChild = new Map();
    for (const record of records) {
      for (const detail of record.studentDetails || []) {
        const childId = String(detail.studentId);
        if (!visibleIds.has(childId)) continue;
        const list = byChild.get(childId) || [];
        list.push({
          date: record.date ? new Date(record.date).toISOString().slice(0, 10) : '',
          className: record.standard || '',
          status: detail.status,
          reason: detail.reason || '',
        });
        byChild.set(childId, list);
      }
    }
    return res.json({
      from: dateFrom,
      to: dateTo,
      children: children.map((child) => ({
        child: serializeOwnChild(child, links),
        records: byChild.get(String(child._id)) || [],
      })),
    });
  } catch (error) {
    console.error('Unable to load parent attendance:', error.message);
    return res.status(503).json({ message: 'Attendance history could not be loaded.' });
  }
});

router.get('/fees', async (req, res) => {
  if (!requireParent(req, res)) return;
  try {
    const { children, links } = await linkedChildren(req);
    const billableIds = [...new Set(links.filter((link) => link.isBillingContact).map((link) => String(link.childId)))];
    if (!billableIds.length) return res.json({ invoices: [], message: 'No fee invoices are assigned to your contact as the billing contact. Contact the preschool office if this looks incorrect.' });

    const branchIds = authorizedBranchIds(req);
    const invoices = await FeeInvoice.find({
      organizationId: req.tenant.organization._id,
      branchId: { $in: branchIds },
      childId: { $in: billableIds },
    }).sort({ createdAt: -1 }).limit(500).lean();
    const ids = invoices.map((invoice) => invoice._id);
    const transactions = ids.length ? await FeeTransaction.find({
      organizationId: req.tenant.organization._id,
      branchId: { $in: branchIds },
      invoiceId: { $in: ids },
    }).sort({ transactionAt: 1 }).lean() : [];
    const txnsByInvoice = new Map();
    for (const txn of transactions) {
      const key = String(txn.invoiceId);
      const list = txnsByInvoice.get(key) || [];
      list.push(txn);
      txnsByInvoice.set(key, list);
    }
    const childById = new Map(children.map((child) => [String(child._id), child]));
    return res.json({
      invoices: invoices.map((invoice) => {
        const txns = txnsByInvoice.get(String(invoice._id)) || [];
        const balance = calculateInvoiceBalanceForStatus(invoice.status, invoice.totalAmountPaise, txns);
        const child = childById.get(String(invoice.childId));
        return {
          id: String(invoice._id),
          invoiceNumber: invoice.invoiceNumber,
          childId: String(invoice.childId),
          childName: child ? childName(child) : 'Child record',
          className: child?.standard || '',
          academicYear: invoice.academicYear,
          dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : '',
          status: invoice.status,
          subtotal: Number(formatPaise(invoice.subtotalPaise)),
          discount: Number(formatPaise(invoice.discountPaise)),
          total: Number(formatPaise(invoice.totalAmountPaise)),
          paid: Number(formatPaise(balance.netPaidPaise)),
          outstanding: Number(formatPaise(balance.outstandingPaise)),
          currency: req.tenant.organization.currency || 'INR',
          transactions: txns.map((txn) => ({
            receiptNumber: txn.receiptNumber,
            type: txn.type,
            amount: Number(formatPaise(txn.amountPaise)),
            method: txn.method,
            transactionAt: txn.transactionAt,
            reason: txn.type === 'refund' ? txn.reason : '',
          })),
        };
      }),
    });
  } catch (error) {
    console.error('Unable to load parent fee information:', error.message);
    return res.status(503).json({ message: 'Fee information could not be loaded.' });
  }
});

module.exports = router;

function clean(value, maxLength = 40) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}
