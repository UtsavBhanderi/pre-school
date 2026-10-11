'use strict';

const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const Fees = require('../models/Fee');
const { STANDARD_FEES } = require('../config/standardFees');
const { asAmount, calculateRemaining } = require('../utils/feeMath');

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
  try {
    const totalStandardFees = asAmount(req.body.totalStandardFees);
    const discount = asAmount(req.body.discount);
    const paymentDetails = Array.isArray(req.body.paymentDetails) ? req.body.paymentDetails : [];
    const totalFeesPaid = paymentDetails.length
      ? sumPaymentDetails(paymentDetails)
      : asAmount(req.body.totalFeesPaid);

    const fee = await Fees.create({
      ...req.body,
      totalStandardFees,
      totalFeesPaid,
      discount,
      paymentDetails,
      totalFeesRemaining: calculateRemaining(totalStandardFees, totalFeesPaid, discount),
    });
    return res.status(201).json(fee);
  } catch (error) {
    console.error('Failed to create fee record:', error);
    return res.status(400).json({ message: 'Unable to create fee record.' });
  }
});

router.put('/update/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid fee record ID.' });
    }

    const existing = await Fees.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Fee record not found.' });

    const paymentDetails = Array.isArray(req.body.paymentDetails)
      ? req.body.paymentDetails
      : existing.paymentDetails;
    const totalStandardFees = asAmount(req.body.totalStandardFees, asAmount(existing.totalStandardFees));
    const discount = asAmount(req.body.discount, asAmount(existing.discount));
    const totalFeesPaid = Array.isArray(req.body.paymentDetails)
      ? sumPaymentDetails(paymentDetails)
      : asAmount(req.body.totalFeesPaid, asAmount(existing.totalFeesPaid));

    const { _id, __v, ...payload } = req.body;
    const updates = {
      ...payload,
      paymentDetails,
      totalStandardFees,
      totalFeesPaid,
      discount,
      totalFeesRemaining: calculateRemaining(totalStandardFees, totalFeesPaid, discount),
    };

    const updatedFees = await Fees.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    // Do not fail a valid fee update because the optional email integration is unavailable.
    if (totalFeesPaid > asAmount(existing.totalFeesPaid)) {
      try {
        await sendFeeEmail(updatedFees);
      } catch (emailError) {
        console.error('Fee record saved, but email notification failed:', emailError.message);
      }
    }

    return res.json(updatedFees);
  } catch (error) {
    console.error('Failed to update fee record:', error);
    return res.status(400).json({ message: 'Unable to update fee record.' });
  }
});

router.delete('/delete/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid fee record ID.' });
    }
    const deleted = await Fees.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Fee record not found.' });
    return res.json({ message: 'Fee record deleted.' });
  } catch (error) {
    console.error('Failed to delete fee record:', error);
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
