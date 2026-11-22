'use strict';

const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const Fees = require('../models/Fee');
const FeeReceiptCounter = require('../models/FeeReceiptCounter');
const { STANDARD_FEES } = require('../config/standardFees');
const { asAmount, calculateRemaining } = require('../utils/feeMath');
const { validateFeeAmounts, validatePaymentHistoryUpdate, hasFeePaymentHistory } = require('../utils/feeValidation');
const { normalizeInstallments, allocatePaymentsToInstallments } = require('../utils/feeInstallments');

const router = express.Router();

const formatPaymentMessage = (fee) => {
  const lastPayment = Array.isArray(fee.paymentDetails) && fee.paymentDetails.length
    ? fee.paymentDetails[fee.paymentDetails.length - 1]
    : null;

  return [
    `Student: ${fee.studentName || 'N/A'}`,
    `GR No.: ${fee.stuNo || 'N/A'}`,
    `Standard: ${fee.standard || 'N/A'}`,
    `Standard fees: ₹${asAmount(fee.totalStandardFees)}`,
    `Latest payment: ₹${asAmount(lastPayment?.amount)}`,
    `Total paid: ₹${asAmount(fee.totalFeesPaid)}`,
    `Discount: ₹${asAmount(fee.discount)}`,
    `Remaining: ₹${calculateRemaining(fee.totalStandardFees, fee.totalFeesPaid, fee.discount)}`,
  ].join('\n');
};

async function sendFeeEmail(fee) {
  if (!fee?.parentEmail || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: fee.parentEmail,
    subject: 'Pre-School fee payment update',
    text: formatPaymentMessage(fee),
  });
  return true;
}

const allocateReceiptNumbers = async (count) => {
  if (!count) return [];
  const year = String(new Date().getFullYear());
  let counter;
  try {
    counter = await FeeReceiptCounter.findOneAndUpdate(
      { _id: year },
      { $inc: { sequence: count } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    // A simultaneous first-time insert may win the unique annual counter _id.
    if (error?.code !== 11000) throw error;
    counter = await FeeReceiptCounter.findOneAndUpdate(
      { _id: year },
      { $inc: { sequence: count } },
      { new: true },
    );
  }
  const first = counter.sequence - count + 1;
  return Array.from({ length: count }, (_, index) => 'RCPT-' + year + '-' + String(first + index).padStart(6, '0'));
};

const sumPaymentDetails = (details) =>
  (Array.isArray(details) ? details : []).reduce((sum, detail) => sum + asAmount(detail?.amount), 0);

const getDateRange = (daysOffset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getWeekRange = (weekOffset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - date.getDay() + 7 * weekOffset);
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getMonthRange = (monthOffset = 0) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const aggregatePayments = async (start, end) => {
  const [summary] = await Fees.aggregate([
    { $unwind: '$paymentDetails' },
    {
      $project: {
        studentName: 1,
        stuNo: 1,
        standard: 1,
        discount: { $ifNull: ['$discount', 0] },
        totalStandardFees: { $ifNull: ['$totalStandardFees', 0] },
        paymentDetails: {
          date: {
            $dateFromString: {
              dateString: { $toString: '$paymentDetails.date' },
              format: '%m/%d/%Y',
              onError: null,
              onNull: null,
            },
          },
          amount: { $convert: { input: '$paymentDetails.amount', to: 'double', onError: 0, onNull: 0 } },
        },
      },
    },
    { $match: { 'paymentDetails.date': { $gte: start, $lte: end } } },
    {
      $group: {
        _id: null,
        totalPaid: { $sum: '$paymentDetails.amount' },
        totalDiscount: { $sum: '$discount' },
        students: {
          $push: {
            studentName: '$studentName',
            discount: '$discount',
            stuNo: '$stuNo',
            amount: '$paymentDetails.amount',
            totalPaid: '$paymentDetails.amount',
            totalStandardFees: '$totalStandardFees',
            standard: '$standard',
            paymentDate: '$paymentDetails.date',
          },
        },
      },
    },
  ]);

  return summary || { totalPaid: 0, totalDiscount: 0, students: [] };
};

// Fee schedule endpoint keeps the frontend form in sync with the server-side schedule.
router.get('/standard-fees', (req, res) => res.json(STANDARD_FEES));


router.get('/installments/overview', async (req, res) => {
  try {
    const records = await Fees.find({ 'installments.0': { $exists: true } })
      .select('studentName stuNo standard batchYear totalFeesPaid totalStandardFees discount installments')
      .sort({ studentName: 1 }).lean();
    const today = new Date().toISOString().slice(0, 10);
    const items = records.flatMap((record) => allocatePaymentsToInstallments(record.installments, record.totalFeesPaid, today)
      .map((installment) => ({ feeRecordId: String(record._id), studentName: record.studentName, stuNo: record.stuNo, standard: record.standard, batchYear: record.batchYear, ...installment })));
    const summary = items.reduce((result, item) => {
      result[item.status] = (result[item.status] || 0) + 1;
      result.outstanding += item.balance;
      return result;
    }, { paid: 0, partial: 0, overdue: 0, upcoming: 0, outstanding: 0 });
    summary.outstanding = asAmount(summary.outstanding);
    return res.json({ today, summary, installments: items });
  } catch (error) {
    console.error('Failed to load installment overview:', error?.name || 'database_error');
    return res.status(500).json({ message: 'Unable to load installment overview.' });
  }
});

router.get('/all', async (req, res) => {
  try {
    const fees = await Fees.find().sort({ studentName: 1 }).lean();
    return res.json(fees);
  } catch (error) {
    console.error('Failed to fetch fee records:', error);
    return res.status(500).json({ message: 'Unable to fetch fee records.' });
  }
});

router.post('/create', async (req, res) => {
  const body = req.body || {};
  const amounts = validateFeeAmounts({
    totalStandardFees: body.totalStandardFees, discount: body.discount ?? 0,
    paymentDetails: body.paymentDetails ?? [], totalFeesPaid: body.totalFeesPaid ?? 0,
    paymentDetailsProvided: Array.isArray(body.paymentDetails),
  });
  if (!amounts.valid) return res.status(400).json({ message: amounts.message });
  const studentName = typeof body.studentName === 'string' ? body.studentName.trim() : '';
  const standard = typeof body.standard === 'string' ? body.standard.trim() : '';
  const batchYear = typeof body.batchYear === 'string' ? body.batchYear.trim() : '';
  if (!studentName || studentName.length > 150) return res.status(400).json({ message: 'Enter the student name (up to 150 characters).' });
  if (!standard || standard.length > 60) return res.status(400).json({ message: 'Choose a valid class.' });
  if (!batchYear || batchYear.length > 12) return res.status(400).json({ message: 'Choose a valid school year.' });
  try {
    const feeData = { studentName, standard, batchYear, ...amounts.value };
    if (body.installments !== undefined) {
      const schedule = normalizeInstallments(body.installments, amounts.value.totalStandardFees, amounts.value.discount);
      if (!schedule.valid) return res.status(400).json({ message: schedule.message });
      feeData.installments = schedule.value;
    }
    if (!Array.isArray(body.paymentDetails) && amounts.value.totalFeesPaid > 0) {
      feeData.openingBalancePaid = amounts.value.totalFeesPaid;
    }
    const optionalTextFields = ['studentPhoneNumber', 'ParentsPhoneNumber', 'ParentsMobileNumber', 'EmergencyMobileNumber', 'parentEmail', 'stuNo'];
    for (const field of optionalTextFields) if (typeof body[field] === 'string') feeData[field] = body[field].trim();
    if (feeData.parentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feeData.parentEmail)) {
      return res.status(400).json({ message: 'Enter a valid parent email address.' });
    }
    if (Array.isArray(feeData.paymentDetails) && feeData.paymentDetails.length) {
      const numbers = await allocateReceiptNumbers(feeData.paymentDetails.length);
      feeData.paymentDetails = feeData.paymentDetails.map((payment, index) => ({ ...payment, receiptNumber: numbers[index] }));
    }
    const fee = await Fees.create({
      ...feeData,
      totalFeesRemaining: calculateRemaining(amounts.value.totalStandardFees, amounts.value.totalFeesPaid, amounts.value.discount),
    });
    return res.status(201).json(fee);
  } catch (error) {
    console.error('Failed to create fee record:', error?.name || 'database_error');
    return res.status(400).json({ message: 'Unable to create fee record. Check the details and try again.' });
  }
});

router.put('/update/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid fee record ID.' });
  try {
    const existing = await Fees.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Fee record not found.' });
    const body = req.body || {};
    const paymentDetailsProvided = Array.isArray(body.paymentDetails);
    const paymentDetails = paymentDetailsProvided ? body.paymentDetails : existing.paymentDetails;
    const amounts = validateFeeAmounts({
      totalStandardFees: body.totalStandardFees ?? existing.totalStandardFees,
      discount: body.discount ?? existing.discount, paymentDetails,
      totalFeesPaid: paymentDetailsProvided ? (body.totalFeesPaid ?? existing.totalFeesPaid) : existing.totalFeesPaid,
      paymentDetailsProvided,
    });
    if (!amounts.valid) return res.status(400).json({ message: amounts.message });

    let paymentHistory = null;
    if (paymentDetailsProvided) {
      paymentHistory = validatePaymentHistoryUpdate(existing, amounts.value.paymentDetails);
      if (!paymentHistory.valid) {
        return res.status(409).json({ code: paymentHistory.code, message: paymentHistory.message });
      }
      amounts.value.totalFeesPaid = paymentHistory.totalFeesPaid;
      const existingPaymentCount = Array.isArray(existing.paymentDetails) ? existing.paymentDetails.length : 0;
      const newPayments = amounts.value.paymentDetails.slice(existingPaymentCount);
      const receiptNumbers = await allocateReceiptNumbers(newPayments.length);
      amounts.value.paymentDetails = [
        ...existing.paymentDetails,
        ...newPayments.map((payment, index) => ({ ...payment, receiptNumber: receiptNumbers[index] })),
      ];
    }
    const updates = { ...amounts.value };
    if (body.installments !== undefined) {
      const schedule = normalizeInstallments(body.installments, amounts.value.totalStandardFees, amounts.value.discount);
      if (!schedule.valid) return res.status(400).json({ message: schedule.message });
      updates.installments = schedule.value;
    }
    // A text-only edit must not replace receipt subdocuments or regenerate their IDs.
    if (!paymentDetailsProvided) delete updates.paymentDetails;
    if (paymentHistory) updates.openingBalancePaid = paymentHistory.openingBalancePaid;
    const allowedTextFields = ['studentName', 'studentPhoneNumber', 'ParentsPhoneNumber', 'ParentsMobileNumber', 'EmergencyMobileNumber', 'parentEmail', 'batchYear', 'standard', 'stuNo'];
    for (const field of allowedTextFields) {
      if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
      if (typeof body[field] !== 'string' || body[field].trim().length > (field === 'studentName' ? 150 : 120)) {
        return res.status(400).json({ message: 'Check the ' + field + ' value and try again.' });
      }
      updates[field] = body[field].trim();
    }
    if (updates.parentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.parentEmail)) return res.status(400).json({ message: 'Enter a valid parent email address.' });
    if (updates.standard !== undefined && !updates.standard) return res.status(400).json({ message: 'Choose a valid class.' });
    if (updates.batchYear !== undefined && !updates.batchYear) return res.status(400).json({ message: 'Choose a valid school year.' });
    updates.totalFeesRemaining = calculateRemaining(amounts.value.totalStandardFees, amounts.value.totalFeesPaid, amounts.value.discount);
    // Compare-and-set the document version so two staff members cannot overwrite
    // each other's changes after reading the same fee record.
    const expectedVersion = Number.isInteger(existing.__v) ? existing.__v : null;
    const versionFilter = expectedVersion === null
      ? { _id: req.params.id, $or: [{ __v: { $exists: false } }, { __v: null }] }
      : { _id: req.params.id, __v: expectedVersion };
    const updateOperation = expectedVersion === null
      ? { $set: { ...updates, __v: 1 } }
      : { $set: updates, $inc: { __v: 1 } };
    const updatedFees = await Fees.findOneAndUpdate(versionFilter, updateOperation, { new: true, runValidators: true });
    if (!updatedFees) {
      const stillExists = await Fees.exists({ _id: req.params.id });
      if (!stillExists) return res.status(404).json({ message: 'Fee record not found.' });
      return res.status(409).json({
        code: 'FEE_RECORD_CHANGED',
        message: 'This fee record was updated by another request. Reopen the student’s fee record before trying again.',
      });
    }
    if (amounts.value.totalFeesPaid > asAmount(existing.totalFeesPaid)) {
      try { await sendFeeEmail(updatedFees); }
      catch (emailError) { console.error('Fee record saved, but email notification failed:', emailError?.name || 'email_error'); }
    }
    return res.json(updatedFees);
  } catch (error) {
    console.error('Failed to update fee record:', error?.name || 'database_error');
    return res.status(500).json({ message: 'Unable to update fee record. Please try again.' });
  }
});

router.delete('/delete/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid fee record ID.' });
    }

    // A paid fee record is part of the school's financial history. Do not
    // allow a profile-screen cleanup action to erase receipts or payment data.
    const existing = await Fees.findById(req.params.id).select('totalFeesPaid openingBalancePaid paymentDetails').lean();
    if (!existing) return res.status(404).json({ message: 'Fee record not found.' });
    if (hasFeePaymentHistory(existing)) {
      return res.status(409).json({
        code: 'FEE_PAYMENT_HISTORY_PRESERVED',
        message: 'This fee record contains payment history and cannot be deleted. Keep it for financial records.',
      });
    }

    // Re-check the unpaid condition atomically so a concurrent payment update
    // cannot be lost between the read above and deletion.
    const deleted = await Fees.findOneAndDelete({
      _id: req.params.id,
      $and: [
        { $or: [{ totalFeesPaid: { $lte: 0 } }, { totalFeesPaid: { $exists: false } }, { totalFeesPaid: null }] },
        { $or: [{ openingBalancePaid: { $lte: 0 } }, { openingBalancePaid: { $exists: false } }, { openingBalancePaid: null }] },
        { $or: [{ paymentDetails: { $size: 0 } }, { paymentDetails: { $exists: false } }, { paymentDetails: null }] },
      ],
    });
    if (!deleted) {
      const stillExists = await Fees.exists({ _id: req.params.id });
      if (!stillExists) return res.status(404).json({ message: 'Fee record not found.' });
      return res.status(409).json({
        code: 'FEE_RECORD_CHANGED',
        message: 'The fee record changed while you were deleting it. Refresh the page and try again.',
      });
    }
    return res.json({ message: 'Unpaid fee record deleted.' });
  } catch (error) {
    console.error('Failed to delete fee record:', error?.name || 'database_error');
    return res.status(500).json({ message: 'Unable to delete fee record.' });
  }
});

router.get('/fees-collection-data', async (req, res) => {
  try {
    const today = await aggregatePayments(...Object.values(getDateRange()));
    const yesterday = await aggregatePayments(...Object.values(getDateRange(-1)));
    const thisWeek = await aggregatePayments(...Object.values(getWeekRange()));
    const prevWeek = await aggregatePayments(...Object.values(getWeekRange(-1)));
    const thisMonth = await aggregatePayments(...Object.values(getMonthRange()));
    const prevMonth = await aggregatePayments(...Object.values(getMonthRange(-1)));

    const standardWise = await Fees.aggregate([
      {
        $group: {
          _id: '$standard',
          totalPaid: { $sum: { $ifNull: ['$totalFeesPaid', 0] } },
          totalDiscount: { $sum: { $ifNull: ['$discount', 0] } },
          totalStandardFees: { $sum: { $ifNull: ['$totalStandardFees', 0] } },
          students: {
            $push: {
              studentName: '$studentName',
              stuNo: '$stuNo',
              standard: '$standard',
              totalPaid: { $ifNull: ['$totalFeesPaid', 0] },
              totalFeesPaid: { $ifNull: ['$totalFeesPaid', 0] },
              totalStandardFees: { $ifNull: ['$totalStandardFees', 0] },
              discount: { $ifNull: ['$discount', 0] },
              totalDiscount: { $ifNull: ['$discount', 0] },
              paymentDetails: { $ifNull: ['$paymentDetails', []] },
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return res.json({ today, yesterday, thisWeek, prevWeek, thisMonth, prevMonth, standardWise });
  } catch (error) {
    console.error('Failed to calculate fee collection overview:', error);
    return res.status(500).json({ message: 'Unable to calculate fee collection overview.' });
  }
});


router.get('/collection-report', async (req, res) => {
  const startValue = String(req.query.startDate || '').trim();
  const endValue = String(req.query.endDate || '').trim();
  const parseDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  };
  const start = parseDate(startValue), end = parseDate(endValue);
  if (!start || !end) return res.status(400).json({ message: 'Choose valid start and end dates.' });
  if (start > end) return res.status(400).json({ message: 'Start date must be on or before the end date.' });
  const days = Math.floor((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000) + 1;
  if (days > 366) return res.status(400).json({ message: 'Choose a date range of 366 days or fewer.' });
  start.setHours(0, 0, 0, 0);
  const endExclusive = new Date(end); endExclusive.setDate(endExclusive.getDate() + 1); endExclusive.setHours(0, 0, 0, 0);
  try {
    const [result] = await Fees.aggregate([
      { $unwind: '$paymentDetails' },
      { $project: {
        studentName: 1, stuNo: 1, standard: 1,
        payment: {
          date: { $dateFromString: { dateString: { $toString: '$paymentDetails.date' }, format: '%m/%d/%Y', onError: null, onNull: null } },
          amount: { $convert: { input: '$paymentDetails.amount', to: 'double', onError: 0, onNull: 0 } },
          method: { $ifNull: ['$paymentDetails.method', 'cash'] },
          reference: { $ifNull: ['$paymentDetails.reference', ''] },
        },
      } },
      { $match: { 'payment.date': { $gte: start, $lt: endExclusive } } },
      { $sort: { 'payment.date': 1, studentName: 1 } },
      { $facet: {
        totals: [{ $group: { _id: null, total: { $sum: '$payment.amount' }, count: { $sum: 1 } } }],
        methods: [{ $group: { _id: '$payment.method', total: { $sum: '$payment.amount' }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
        entries: [{ $limit: 5000 }, { $project: { _id: 0, studentName: 1, stuNo: 1, standard: 1, date: '$payment.date', amount: '$payment.amount', method: '$payment.method', reference: '$payment.reference' } }],
      } },
    ]);
    const total = result?.totals?.[0] || { total: 0, count: 0 };
    return res.json({ startDate: startValue, endDate: endValue, total: asAmount(total.total), paymentCount: total.count, truncated: total.count > 5000, byMethod: (result?.methods || []).map((item) => ({ method: item._id || 'cash', total: asAmount(item.total), count: item.count })), entries: result?.entries || [] });
  } catch (error) {
    console.error('Failed to generate fee collection report:', error?.name || 'database_error');
    return res.status(500).json({ message: 'Unable to generate the collection report.' });
  }
});

router.get('/fees-by-date', async (req, res) => {
  const value = String(req.query.date || '').trim();
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return res.status(400).json({ message: 'Payment date must be in MM/DD/YYYY format.' });
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const start = new Date(year, month - 1, day);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) {
    return res.status(400).json({ message: 'Invalid payment date.' });
  }
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  try {
    const fees = await Fees.aggregate([
      { $unwind: '$paymentDetails' },
      {
        $addFields: {
          parsedPaymentDate: {
            $dateFromString: {
              dateString: { $toString: '$paymentDetails.date' },
              format: '%m/%d/%Y',
              onError: null,
              onNull: null,
            },
          },
        },
      },
      { $match: { parsedPaymentDate: { $gte: start, $lt: end } } },
      {
        $project: {
          studentName: 1,
          standard: 1,
          rollNo: '$stuNo',
          totalPaid: { $ifNull: ['$paymentDetails.amount', 0] },
          totalDiscount: { $ifNull: ['$discount', 0] },
          paymentDate: '$parsedPaymentDate',
        },
      },
    ]);
    return res.json(fees);
  } catch (error) {
    console.error('Failed to fetch date-specific fee collection:', error);
    return res.status(500).json({ message: 'Unable to fetch fee collection for this date.' });
  }
});

router.get('/fees-month-collection', async (req, res) => {
  try {
    const monthsData = await Fees.aggregate([
      { $unwind: '$paymentDetails' },
      {
        $project: {
          month: {
            $month: {
              $dateFromString: {
                dateString: { $toString: '$paymentDetails.date' },
                format: '%m/%d/%Y',
                onError: null,
                onNull: null,
              },
            },
          },
          amount: { $convert: { input: '$paymentDetails.amount', to: 'double', onError: 0, onNull: 0 } },
        },
      },
      { $match: { month: { $ne: null } } },
      { $group: { _id: '$month', totalCollection: { $sum: '$amount' } } },
      { $sort: { _id: 1 } },
    ]);
    return res.json(monthsData);
  } catch (error) {
    console.error('Failed to fetch monthly fee collection:', error);
    return res.status(500).json({ message: 'Unable to fetch monthly fee collection.' });
  }
});

module.exports = router;
