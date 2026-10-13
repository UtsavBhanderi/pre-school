'use strict';

const express = require('express');
const mongoose = require('mongoose');
const Guardian = require('../models/Guardian');
const ChildGuardian = require('../models/ChildGuardian');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const FeeInvoice = require('../models/FeeInvoice');
const FeeTransaction = require('../models/FeeTransaction');
const { tenantContext } = require('../middleware/tenantContext');
const { hasTenantRole } = require('../utils/tenantAuthorization');
const { calculateInvoiceBalance, formatPaise } = require('../utils/tenantMoney');

const router = express.Router();
router.use(tenantContext);

function requireParent(req, res) {
  if (hasTenantRole(req.tenant?.membership, ['parent'])) return true;
  res.status(403).json({ message: 'This area is for a verified parent or guardian account.' });
  return false;
}

function allowedBranchIds(req) {
  if (req.tenant.membership.accessAllBranches) return null;
  return (req.tenant.membership.branchIds || []).map((id) => String(id?._id || id));
}

async function getContext(req) {
  const guardian = await Guardian.findOne({
    organizationId: req.tenant.organization._id,
    portalUserId: req.user._id,
  }).select('_id fullName email phone alternatePhone preferredLanguage').lean();
  if (!guardian) return { guardian: null, links: [], children: [] };

  const branchIds = allowedBranchIds(req);
  const links = await ChildGuardian.find({
    organizationId: req.tenant.organization._id,
    guardianId: guardian._id,
    ...(branchIds ? { branchId: { $in: branchIds } } : {}),
    ...(req.tenant.branch ? { branchId: req.tenant.branch._id } : {}),
  }).select('branchId childId relationship isPrimaryContact receivesSchoolUpdates consent').lean();

  const childIds = [...new Set(links.map((link) => String(link.childId)))];
  const children = await Student.find({
    _id: { $in: childIds },
    organizationId: req.tenant.organization._id,
    ...(branchIds ? { branchId: { $in: branchIds } } : {}),
    ...(req.tenant.branch ? { branchId: req.tenant.branch._id } : {}),
  }).select('_id firstName middleName lastName stuNo standard batchYear dob gender branchId').lean();

  const childIdsFound = new Set(children.map((child) => String(child._id)));
  return { guardian, links: links.filter((link) => childIdsFound.has(String(link.childId))), children };
}

function childName(child) {
  return [child.firstName, child.middleName, child.lastName].filter(Boolean).join(' ').trim();
}

function childView(child, link) {
  return {
    id: String(child._id),
    name: childName(child),
    admissionNumber: child.stuNo || '',
    className: child.standard || '',
    academicYear: child.batchYear || '',
    dateOfBirth: child.dob || '',
    gender: child.gender || '',
    relationship: link.relationship,
    primaryContact: Boolean(link.isPrimaryContact),
    receivesSchoolUpdates: Boolean(link.receivesSchoolUpdates),
    photoConsent: link.consent?.photoUse || 'unknown',
  };
}

async function getLinkedChild(req, childId) {
  if (!mongoose.Types.ObjectId.isValid(childId)) return null;
  const context = await getContext(req);
  if (!context.guardian) return null;
  const link = context.links.find((item) => String(item.childId) === String(childId));
  const child = context.children.find((item) => String(item._id) === String(childId));
  return link && child ? { context, link, child } : null;
}

router.get('/profile', async (req, res) => {
  if (!requireParent(req, res)) return;
  try {
    const context = await getContext(req);
    if (!context.guardian) return res.status(403).json({ message: 'Your guardian profile is not linked to this organization.' });
    return res.json({
      guardian: {
        name: context.guardian.fullName,
        email: context.guardian.email || req.user.email,
        phone: context.guardian.phone,
        alternatePhone: context.guardian.alternatePhone || '',
        preferredLanguage: context.guardian.preferredLanguage || 'en',
      },
      organization: {
        id: String(req.tenant.organization._id),
        name: req.tenant.organization.name,
        currency: req.tenant.organization.currency || 'INR',
        timezone: req.tenant.organization.timezone || 'Asia/Kolkata',
      },
      children: context.links.map((link) => {
        const child = context.children.find((item) => String(item._id) === String(link.childId));
        return child ? childView(child, link) : null;
      }).filter(Boolean),
    });
  } catch (error) {
    console.error('Unable to load parent profile:', error);
    return res.status(503).json({ message: 'Your parent profile could not be loaded.' });
  }
});

router.get('/children', async (req, res) => {
  if (!requireParent(req, res)) return;
  try {
    const context = await getContext(req);
    if (!context.guardian) return res.status(403).json({ message: 'Your guardian profile is not linked to this organization.' });
    const children = context.links.map((link) => {
      const child = context.children.find((item) => String(item._id) === String(link.childId));
      return child ? childView(child, link) : null;
    }).filter(Boolean);
    return res.json({ total: children.length, children });
  } catch (error) {
    console.error('Unable to list parent children:', error);
    return res.status(503).json({ message: 'Linked child records could not be loaded.' });
  }
});

router.get('/children/:childId/attendance', async (req, res) => {
  if (!requireParent(req, res)) return;
  try {
    const linked = await getLinkedChild(req, req.params.childId);
    if (!linked) return res.status(404).json({ message: 'This child is not linked to your parent account.' });
    const records = await Attendance.find({
      organizationId: req.tenant.organization._id,
      branchId: linked.child.branchId,
      'studentDetails.studentId': linked.child._id,
    }).select('date studentDetails updatedAt').sort({ date: -1 }).limit(120).lean();

    const attendance = records.map((record) => {
      const entry = (record.studentDetails || []).find((item) => String(item.studentId) === String(linked.child._id));
      if (!entry) return null;
      return {
        date: record.date instanceof Date ? record.date.toISOString().slice(0, 10) : String(record.date).slice(0, 10),
        status: entry.status,
        reason: entry.status === 'absent' ? entry.reason || '' : '',
        updatedAt: record.updatedAt,
      };
    }).filter(Boolean);
    return res.json({
      child: childView(linked.child, linked.link),
      total: attendance.length,
      present: attendance.filter((item) => item.status === 'present').length,
      absent: attendance.filter((item) => item.status === 'absent').length,
      attendance,
    });
  } catch (error) {
    console.error('Unable to load parent attendance:', error);
    return res.status(503).json({ message: 'Attendance history could not be loaded.' });
  }
});

router.get('/children/:childId/fees', async (req, res) => {
  if (!requireParent(req, res)) return;
  try {
    const linked = await getLinkedChild(req, req.params.childId);
    if (!linked) return res.status(404).json({ message: 'This child is not linked to your parent account.' });

    const invoices = await FeeInvoice.find({
      organizationId: req.tenant.organization._id,
      branchId: linked.child.branchId,
      childId: linked.child._id,
      status: 'open',
    }).sort({ createdAt: -1 }).limit(100).lean();
    const invoiceIds = invoices.map((invoice) => invoice._id);
    const transactions = invoiceIds.length ? await FeeTransaction.find({
      organizationId: req.tenant.organization._id,
      branchId: linked.child.branchId,
      childId: linked.child._id,
      invoiceId: { $in: invoiceIds },
    }).sort({ transactionAt: -1 }).select('invoiceId receiptNumber type amountPaise method transactionAt').lean() : [];

    const byInvoice = new Map();
    for (const txn of transactions) {
      const key = String(txn.invoiceId);
      const list = byInvoice.get(key) || [];
      list.push(txn);
      byInvoice.set(key, list);
    }
    const safeInvoices = invoices.map((invoice) => {
      const ledger = byInvoice.get(String(invoice._id)) || [];
      const balance = calculateInvoiceBalance(invoice.totalAmountPaise, ledger);
      return {
        id: String(invoice._id),
        invoiceNumber: invoice.invoiceNumber,
        academicYear: invoice.academicYear,
        lineItems: (invoice.lineItems || []).map((item) => ({
          description: item.description,
          quantity: item.quantity,
          lineTotal: Number(formatPaise(item.lineTotalPaise)),
        })),
        total: Number(formatPaise(invoice.totalAmountPaise)),
        paid: Number(formatPaise(balance.netPaidPaise)),
        outstanding: Number(formatPaise(balance.outstandingPaise)),
        dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : '',
        transactions: ledger.map((txn) => ({
          receiptNumber: txn.receiptNumber,
          type: txn.type,
          amount: Number(formatPaise(txn.amountPaise)),
          method: txn.method,
          date: txn.transactionAt,
        })),
      };
    });
    return res.json({ child: childView(linked.child, linked.link), total: safeInvoices.length, invoices: safeInvoices });
  } catch (error) {
    console.error('Unable to load parent fee details:', error);
    return res.status(503).json({ message: 'Fee details could not be loaded.' });
  }
});

module.exports = router;
