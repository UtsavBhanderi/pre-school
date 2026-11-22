'use strict';

const express = require('express');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Attendance = require('../models/Attendance');
const Fees = require('../models/Fee');
const { validateOverviewRange, buildDailySeries } = require('../utils/adminOverview');

const router = express.Router();

const LEGACY_ONLY = {
  $or: [
    { organizationId: null },
    { organizationId: { $exists: false } },
  ],
};

const ACTIVE_STUDENT = {
  $or: [
    { status: 'active' },
    { status: null },
    { status: { $exists: false } },
  ],
};

function dateMatch(start, endExclusive) {
  return { date: { $gte: start, $lt: endExclusive } };
}

router.get('/', async (req, res) => {
  const range = validateOverviewRange(req.query.startDate, req.query.endDate);
  if (!range.valid) {
    return res.status(400).json({ code: range.code, message: range.message });
  }

  try {
    const studentFilter = { $and: [LEGACY_ONLY, ACTIVE_STUDENT] };
    const withdrawnFilter = { $and: [LEGACY_ONLY, { status: 'withdrawn' }] };
    const admissionsFilter = {
      $and: [
        LEGACY_ONLY,
        ACTIVE_STUDENT,
        { admissionDate: { $gte: range.startDate, $lte: range.endDate } },
      ],
    };
    const attendanceMatch = {
      $and: [LEGACY_ONLY, dateMatch(range.start, range.endExclusive)],
    };
    const feeMatch = LEGACY_ONLY;

    const [
      activeStudents,
      withdrawnStudents,
      newAdmissions,
      teachers,
      attendanceRows,
      collectionRows,
      feeTotals,
    ] = await Promise.all([
      Student.countDocuments(studentFilter),
      Student.countDocuments(withdrawnFilter),
      Student.countDocuments(admissionsFilter),
      Teacher.countDocuments({}),
      Attendance.aggregate([
        { $match: attendanceMatch },
        { $unwind: '$studentDetails' },
        { $match: { 'studentDetails.status': { $in: ['present', 'absent'] }, 'studentDetails.studentId': { $type: 'objectId' } } },
        { $sort: { updatedAt: -1, createdAt: -1, _id: -1 } },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'UTC' } },
              studentId: '$studentDetails.studentId',
            },
            status: { $first: '$studentDetails.status' },
          },
        },
        {
          $group: {
            _id: { date: '$_id.date', status: '$status' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': 1, '_id.status': 1 } },
      ]),
      Fees.aggregate([
        { $match: feeMatch },
        { $unwind: '$paymentDetails' },
        {
          $project: {
            paymentDate: {
              $dateFromString: {
                dateString: { $toString: '$paymentDetails.date' },
                format: '%m/%d/%Y',
                onError: null,
                onNull: null,
              },
            },
            amount: {
              $convert: {
                input: '$paymentDetails.amount',
                to: 'double',
                onError: 0,
                onNull: 0,
              },
            },
          },
        },
        { $match: { paymentDate: { $gte: range.start, $lt: range.endExclusive } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$paymentDate', timezone: 'UTC' },
            },
            total: { $sum: '$amount' },
            paymentCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Fees.aggregate([
        { $match: feeMatch },
        {
          $project: {
            totalPaid: { $ifNull: ['$totalFeesPaid', 0] },
            outstanding: {
              $max: [
                0,
                {
                  $subtract: [
                    {
                      $subtract: [
                        { $ifNull: ['$totalStandardFees', 0] },
                        { $ifNull: ['$totalFeesPaid', 0] },
                      ],
                    },
                    { $ifNull: ['$discount', 0] },
                  ],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            paidToDate: { $sum: '$totalPaid' },
            outstanding: { $sum: '$outstanding' },
          },
        },
      ]),
    ]);

    const attendanceByDay = new Map();
    for (const row of attendanceRows) {
      const date = String(row?._id?.date || '');
      const status = row?._id?.status;
      if (!date || !['present', 'absent'].includes(status)) continue;
      const current = attendanceByDay.get(date) || { present: 0, absent: 0 };
      current[status] += Number(row.count || 0);
      attendanceByDay.set(date, current);
    }

    const attendanceDaily = [];
    for (let offset = 0; offset < range.dayCount; offset += 1) {
      const day = new Date(range.start);
      day.setUTCDate(day.getUTCDate() + offset);
      const date = day.toISOString().slice(0, 10);
      const counts = attendanceByDay.get(date) || { present: 0, absent: 0 };
      attendanceDaily.push({
        date,
        present: counts.present,
        absent: counts.absent,
        marked: counts.present + counts.absent,
      });
    }

    const collectionDaily = buildDailySeries(range, collectionRows, 'collected', 'total');
    const collectionCountByDay = new Map(
      collectionRows.map((row) => [String(row._id), Number(row.paymentCount || 0)]),
    );
    const dailyCollections = collectionDaily.map((item) => ({
      ...item,
      paymentCount: collectionCountByDay.get(item.date) || 0,
    }));

    const attendanceTotals = attendanceDaily.reduce((result, item) => {
      result.present += item.present;
      result.absent += item.absent;
      result.marked += item.marked;
      return result;
    }, { present: 0, absent: 0, marked: 0 });
    const feeSummary = feeTotals[0] || { paidToDate: 0, outstanding: 0 };
    const selectedEndAttendance = attendanceDaily[attendanceDaily.length - 1] || {
      date: range.endDate, present: 0, absent: 0, marked: 0,
    };
    const selectedEndCollection = dailyCollections[dailyCollections.length - 1] || {
      date: range.endDate, collected: 0, paymentCount: 0,
    };

    return res.json({
      range: { startDate: range.startDate, endDate: range.endDate, days: range.dayCount },
      students: { active: activeStudents, withdrawn: withdrawnStudents, newAdmissions },
      teachers: { total: teachers },
      attendance: {
        ...attendanceTotals,
        attendanceRate: attendanceTotals.marked
          ? Number((attendanceTotals.present / attendanceTotals.marked * 100).toFixed(1))
          : 0,
        selectedEndDate: selectedEndAttendance,
        daily: attendanceDaily,
      },
      fees: {
        collectedInRange: Number(dailyCollections.reduce((sum, item) => sum + item.collected, 0).toFixed(2)),
        paymentsInRange: dailyCollections.reduce((sum, item) => sum + item.paymentCount, 0),
        collectedOnEndDate: selectedEndCollection.collected,
        paidToDate: Number(Number(feeSummary.paidToDate || 0).toFixed(2)),
        outstanding: Number(Number(feeSummary.outstanding || 0).toFixed(2)),
        daily: dailyCollections,
      },
    });
  } catch (error) {
    console.error('Unable to load administrator overview:', error?.name || 'database_error');
    return res.status(500).json({ message: 'Unable to load school management insights. Please try again.' });
  }
});

module.exports = router;
