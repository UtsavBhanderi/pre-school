'use strict';

const express = require('express');
const mongoose = require('mongoose');
const Event = require('../models/Calendar');
const { validateCalendarEvent } = require('../utils/calendarEventValidation');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const events = await Event.find().sort({ start: 1, _id: 1 }).lean();
    return res.json(events);
  } catch (error) {
    console.error('Unable to load calendar events:', error?.name || 'database_error');
    return res.status(500).json({ message: 'The school calendar could not be loaded. Please try again.' });
  }
});

router.post('/', async (req, res) => {
  const validation = validateCalendarEvent(req.body || {});
  if (!validation.valid) return res.status(400).json({ message: validation.message });
  try {
    const event = await Event.create(validation.value);
    return res.status(201).json(event);
  } catch (error) {
    console.error('Unable to create calendar event:', error?.name || 'database_error');
    return res.status(500).json({ message: 'The event could not be saved. Please try again.' });
  }
});

router.put('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid calendar event.' });
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Calendar event not found.' });
    const updates = {};
    for (const field of ['title', 'start', 'end', 'color']) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) updates[field] = req.body[field];
    }
    if (!Object.keys(updates).length) return res.status(400).json({ message: 'Make at least one calendar event change before saving.' });
    const validation = validateCalendarEvent({ title: updates.title ?? event.title, start: updates.start ?? event.start, end: updates.end ?? event.end, color: updates.color ?? event.color });
    if (!validation.valid) return res.status(400).json({ message: validation.message });
    Object.assign(event, validation.value);
    await event.save();
    return res.json(event);
  } catch (error) {
    console.error('Unable to update calendar event:', error?.name || 'database_error');
    return res.status(500).json({ message: 'The event could not be updated. Please try again.' });
  }
});

router.delete('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid calendar event.' });
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ message: 'Calendar event not found.' });
    return res.json({ message: 'Calendar event deleted.' });
  } catch (error) {
    console.error('Unable to delete calendar event:', error?.name || 'database_error');
    return res.status(500).json({ message: 'The event could not be deleted. Please try again.' });
  }
});

module.exports = router;
