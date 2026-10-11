'use strict';

const express = require('express');
const Announcement = require('../models/Announcement');
const adminOnly = require('../middleware/adminOnly');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const notices = await Announcement.find({
      isActive: true,
      startsAt: { $lte: now },
      $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
      audience: { $in: ['all', 'teachers'] },
    }).sort({ createdAt: -1 }).lean();
    return res.json(notices);
  } catch (error) {
    console.error('Unable to load school notices:', error);
    return res.status(500).json({ message: 'Unable to load school notices.' });
  }
});

router.get('/manage', adminOnly, async (req, res) => {
  try {
    return res.json(await Announcement.find().sort({ createdAt: -1 }).lean());
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load school notices.' });
  }
});

router.post('/', adminOnly, async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const message = String(req.body?.message || '').trim();
  const audience = String(req.body?.audience || 'all');
  const priority = String(req.body?.priority || 'normal');
  const startsAt = req.body?.startsAt ? new Date(req.body.startsAt) : new Date();
  const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
  if (title.length < 3 || title.length > 120) return res.status(400).json({ message: 'Title must contain 3 to 120 characters.' });
  if (!message || message.length > 3000) return res.status(400).json({ message: 'Message must contain 1 to 3000 characters.' });
  if (!['all', 'teachers'].includes(audience)) return res.status(400).json({ message: 'Choose a valid audience.' });
  if (!['normal', 'important', 'urgent'].includes(priority)) return res.status(400).json({ message: 'Choose a valid priority.' });
  if (Number.isNaN(startsAt.getTime()) || (expiresAt && Number.isNaN(expiresAt.getTime())) || (expiresAt && expiresAt <= startsAt)) return res.status(400).json({ message: 'Check the notice dates.' });
  try {
    const notice = await Announcement.create({ title, message, audience, priority, startsAt, expiresAt, createdBy: req.user._id, createdByName: req.user.username || '' });
    return res.status(201).json({ message: 'School notice published.', announcement: notice });
  } catch (error) {
    console.error('Unable to publish school notice:', error);
    return res.status(500).json({ message: 'Unable to publish school notice.' });
  }
});


router.put('/:id', adminOnly, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid notice ID.' });
    const notice = await Announcement.findById(req.params.id);
    if (!notice) return res.status(404).json({ message: 'Notice not found.' });

    const title = String(req.body?.title ?? notice.title).trim();
    const message = String(req.body?.message ?? notice.message).trim();
    const audience = String(req.body?.audience ?? notice.audience);
    const priority = String(req.body?.priority ?? notice.priority);
    const startsAt = req.body?.startsAt === undefined ? notice.startsAt : new Date(req.body.startsAt);
    const expiresAt = req.body?.expiresAt === undefined ? notice.expiresAt : req.body.expiresAt ? new Date(req.body.expiresAt) : null;

    if (title.length < 3 || title.length > 120) return res.status(400).json({ message: 'Title must contain 3 to 120 characters.' });
    if (!message || message.length > 3000) return res.status(400).json({ message: 'Message must contain 1 to 3000 characters.' });
    if (!['all', 'teachers'].includes(audience)) return res.status(400).json({ message: 'Choose a valid audience.' });
    if (!['normal', 'important', 'urgent'].includes(priority)) return res.status(400).json({ message: 'Choose a valid priority.' });
    if (Number.isNaN(startsAt.getTime()) || (expiresAt && Number.isNaN(expiresAt.getTime())) || (expiresAt && expiresAt <= startsAt)) return res.status(400).json({ message: 'Check the notice dates.' });

    Object.assign(notice, { title, message, audience, priority, startsAt, expiresAt });
    await notice.save();
    return res.json({ message: 'Notice updated.', announcement: notice });
  } catch (error) {
    console.error('Unable to update school notice:', error);
    return res.status(500).json({ message: 'Unable to update school notice.' });
  }
});

router.patch('/:id/status', adminOnly, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid notice ID.' });
    if (typeof req.body?.isActive !== 'boolean') return res.status(400).json({ message: 'Choose whether this notice should be active.' });
    const notice = await Announcement.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: req.body.isActive } },
      { new: true, runValidators: true }
    );
    if (!notice) return res.status(404).json({ message: 'Notice not found.' });
    return res.json({ message: notice.isActive ? 'Notice reactivated.' : 'Notice archived.', announcement: notice });
  } catch (error) {
    console.error('Unable to update notice status:', error);
    return res.status(500).json({ message: 'Unable to update notice status.' });
  }
});

module.exports = router;
