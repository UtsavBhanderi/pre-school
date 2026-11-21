'use strict';

const express = require('express');
const Calendar = require('../models/Calendar');
const { parseDateOnly } = require('../utils/dateOnly');

const router = express.Router();

function clean(value, maxLength = 10) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function getRange(fromValue, toValue) {
  const today = new Date();
  const defaultFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const defaultTo = new Date(defaultFrom);
  defaultTo.setUTCDate(defaultTo.getUTCDate() + 90);
  const from = parseDateOnly(clean(fromValue)) || defaultFrom;
  const to = parseDateOnly(clean(toValue)) || defaultTo;
  if (from > to || (to - from) / 86400000 > 366) return null;
  const endExclusive = new Date(to);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { from, endExclusive };
}

router.get('/calendar', async (req, res) => {
  if (req.user?.role !== 'teacher' || req.user?.status === 'suspended') {
    return res.status(403).json({ message: 'This calendar is available only to active teacher accounts.' });
  }
  const range = getRange(req.query.from, req.query.to);
  if (!range) return res.status(400).json({ message: 'Choose a valid calendar date range of 367 days or less.' });
  try {
    const events = await Calendar.find({
      start: { $lt: range.endExclusive },
      $and: [
        { $or: [{ end: null }, { end: { $gte: range.from } }] },
        { $or: [{ audience: { $in: ['all', 'teachers'] } }, { audience: { $exists: false } }] },
      ],
    }).select('title description start end color audience allDay location').sort({ start: 1 }).limit(250).lean();

    return res.json({
      events: events.map((event) => ({
        id: String(event._id),
        title: event.title || 'School event',
        startsAt: event.start || null,
        endsAt: event.end || event.start || null,
        color: event.color || '',
        audience: event.audience || 'all',
      })),
    });
  } catch (error) {
    console.error('Unable to load teacher calendar:', error?.name || 'calendar_error');
    return res.status(503).json({ message: 'The school calendar could not be loaded.' });
  }
});

module.exports = router;
