'use strict';

const express = require('express');
const mongoose = require('mongoose');
const TenantCommunication = require('../models/TenantCommunication');
const Branch = require('../models/Branch');
const ChildGuardian = require('../models/ChildGuardian');
const { tenantContext } = require('../middleware/tenantContext');
const { canManageTenantNotices, canReadTenantNotices, audienceFilterForRole } = require('../utils/tenantNoticePolicy');

const router = express.Router();
router.use(tenantContext);

function clean(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

async function visibleBranchIds(req) {
  if (req.tenant.branch) return [req.tenant.branch._id];
  if (req.tenant.membership.accessAllBranches) {
    const branches = await Branch.find({ organizationId: req.tenant.organization._id, status: 'active' }).select('_id').lean();
    return branches.map((branch) => branch._id);
  }
  return (req.tenant.membership.branchIds || []).map((id) => id?._id || id);
}

async function readableBranchIds(req) {
  const allowed = await visibleBranchIds(req);
  if (req.tenant.membership.role !== 'parent') return allowed;
  const guardianIds = req.tenant.membership.guardianIds || [];
  if (!guardianIds.length) return [];
  const links = await ChildGuardian.find({
    organizationId: req.tenant.organization._id,
    branchId: { $in: allowed },
    guardianId: { $in: guardianIds },
  }).select('branchId').lean();
  const linked = new Set(links.map((link) => String(link.branchId)));
  return allowed.filter((id) => linked.has(String(id)));
}

function serialize(item, userId, role, includeCounts = false) {
  const readBy = item.readBy || [];
  const votes = item.votes || [];
  const results = (item.options || []).map((option, index) => votes.filter((vote) => vote.optionIndex === index).length);
  const output = {
    id: String(item._id),
    type: item.type,
    title: item.title,
    message: item.message || '',
    audience: item.audience,
    priority: item.priority,
    startsAt: item.startsAt,
    expiresAt: item.expiresAt,
    endsAt: item.endsAt,
    options: item.options || [],
    status: item.status,
    hasRead: readBy.some((receipt) => String(receipt.userId) === String(userId)),
    hasVoted: votes.some((vote) => String(vote.userId) === String(userId)),
    totalVotes: votes.length,
    results,
    branch: item.branchId ? {
      id: String(item.branchId._id || item.branchId),
      name: item.branchId.name || '',
      code: item.branchId.code || '',
    } : null,
    createdBy: item.createdBy ? {
      id: String(item.createdBy._id || item.createdBy),
      name: item.createdBy.username || '',
    } : null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
  if (includeCounts) output.readCount = readBy.length;
  return output;
}

function readerAudience(req) {
  return { $in: audienceFilterForRole(req.tenant.membership.role) };
}

router.get('/', async (req, res) => {
  if (!canReadTenantNotices(req.tenant.membership)) {
    return res.status(403).json({ message: 'You do not have access to school communications.' });
  }
  try {
    const branchIds = await readableBranchIds(req);
    if (!branchIds.length) return res.json({ items: [] });
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const type = clean(req.query.type, 10);
    const filter = {
      organizationId: req.tenant.organization._id,
      branchId: { $in: branchIds },
      status: 'active',
      startsAt: { $lte: now },
      audience: readerAudience(req),
      $or: [
        { type: 'message', $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }] },
        { type: 'poll', endsAt: { $gte: thirtyDaysAgo } },
      ],
    };
    if (['message', 'poll'].includes(type)) filter.type = type;
    const items = await TenantCommunication.find(filter)
      .populate({ path: 'branchId', select: 'name code' })
      .populate({ path: 'createdBy', select: 'username' })
      .sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ items: items.map((item) => serialize(item, req.user._id, req.tenant.membership.role)) });
  } catch (error) {
    console.error('Unable to load tenant communications:', error.message);
    return res.status(503).json({ message: 'School communications could not be loaded.' });
  }
});

router.get('/manage', async (req, res) => {
  if (!canManageTenantNotices(req.tenant.membership)) {
    return res.status(403).json({ message: 'Only an authorized school administrator can manage communications.' });
  }
  try {
    const branchIds = await visibleBranchIds(req);
    if (!branchIds.length) return res.json({ items: [] });
    const filter = {
      organizationId: req.tenant.organization._id,
      branchId: { $in: branchIds },
    };
    if (['message', 'poll'].includes(req.query.type)) filter.type = req.query.type;
    const items = await TenantCommunication.find(filter)
      .populate({ path: 'branchId', select: 'name code' })
      .populate({ path: 'createdBy', select: 'username' })
      .sort({ createdAt: -1 }).limit(300).lean();
    return res.json({ items: items.map((item) => serialize(item, req.user._id, req.tenant.membership.role, true)) });
  } catch (error) {
    console.error('Unable to load tenant communications for management:', error.message);
    return res.status(503).json({ message: 'Communications could not be loaded for management.' });
  }
});

router.post('/messages', async (req, res) => {
  if (!canManageTenantNotices(req.tenant.membership)) {
    return res.status(403).json({ message: 'Only an authorized school administrator can send school messages.' });
  }
  if (!req.tenant.branch) return res.status(400).json({ message: 'Choose a branch before sending a message.' });
  const title = clean(req.body?.title, 160);
  const message = clean(req.body?.message, 3000);
  const audience = clean(req.body?.audience, 20) || 'all';
  const priority = clean(req.body?.priority, 20) || 'normal';
  const startsAt = req.body?.startsAt ? new Date(req.body.startsAt) : new Date();
  const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
  if (title.length < 3 || !message || !['all', 'staff', 'parents'].includes(audience) ||
      !['normal', 'important', 'urgent'].includes(priority) || Number.isNaN(startsAt.getTime()) ||
      (req.body?.expiresAt && (!expiresAt || Number.isNaN(expiresAt.getTime()))) ||
      (expiresAt && expiresAt <= startsAt)) {
    return res.status(400).json({ message: 'Enter a title, message, audience, priority and valid dates.' });
  }
  try {
    const item = await TenantCommunication.create({
      organizationId: req.tenant.organization._id,
      branchId: req.tenant.branch._id,
      type: 'message',
      title, message, audience, priority, startsAt, expiresAt,
      createdBy: req.user._id,
    });
    return res.status(201).json({ message: 'School message published to the selected audience.', item: serialize(item, req.user._id, req.tenant.membership.role, true) });
  } catch (error) {
    console.error('Unable to create tenant school message:', error.message);
    return res.status(503).json({ message: 'School message could not be sent.' });
  }
});

router.post('/polls', async (req, res) => {
  if (!canManageTenantNotices(req.tenant.membership)) {
    return res.status(403).json({ message: 'Only an authorized school administrator can publish polls.' });
  }
  if (!req.tenant.branch) return res.status(400).json({ message: 'Choose a branch before publishing a poll.' });
  const title = clean(req.body?.title, 160);
  const message = clean(req.body?.message, 3000);
  const audience = clean(req.body?.audience, 20) || 'all';
  const options = Array.isArray(req.body?.options) ? [...new Set(req.body.options.map((item) => clean(item, 80)).filter(Boolean))] : [];
  const startsAt = req.body?.startsAt ? new Date(req.body.startsAt) : new Date();
  const endsAt = req.body?.endsAt ? new Date(req.body.endsAt) : null;
  if (title.length < 5 || !['all', 'staff', 'parents'].includes(audience) ||
      options.length < 2 || options.length > 6 || !endsAt || Number.isNaN(endsAt.getTime()) ||
      Number.isNaN(startsAt.getTime()) || endsAt <= startsAt) {
    return res.status(400).json({ message: 'Enter a poll question, 2–6 options, audience and valid closing date.' });
  }
  try {
    const item = await TenantCommunication.create({
      organizationId: req.tenant.organization._id,
      branchId: req.tenant.branch._id,
      type: 'poll',
      title, message, audience, options, startsAt, endsAt,
      createdBy: req.user._id,
    });
    return res.status(201).json({ message: 'Poll published to the selected audience.', item: serialize(item, req.user._id, req.tenant.membership.role, true) });
  } catch (error) {
    console.error('Unable to create tenant poll:', error.message);
    return res.status(503).json({ message: 'Poll could not be published.' });
  }
});

router.post('/:id/read', async (req, res) => {
  if (!canReadTenantNotices(req.tenant.membership) || !mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: 'School message not found.' });
  }
  try {
    const branchIds = await readableBranchIds(req);
    const item = await TenantCommunication.findOneAndUpdate({
      _id: req.params.id,
      organizationId: req.tenant.organization._id,
      branchId: { $in: branchIds },
      type: 'message',
      status: 'active',
      startsAt: { $lte: new Date() },
      $or: [{ expiresAt: null }, { expiresAt: { $gte: new Date() } }],
      audience: readerAudience(req),
      readBy: { $not: { $elemMatch: { userId: req.user._id } } },
    }, {
      $push: { readBy: { userId: req.user._id, role: req.tenant.membership.role, recordedAt: new Date() } },
    }, { new: true });
    if (!item) {
      const existing = await TenantCommunication.exists({
        _id: req.params.id,
        organizationId: req.tenant.organization._id,
        branchId: { $in: branchIds },
        type: 'message',
        audience: readerAudience(req),
      });
      return res.status(existing ? 200 : 404).json({ message: existing ? 'Message already marked as read.' : 'School message not found.' });
    }
    return res.json({ message: 'Message marked as read.' });
  } catch (error) {
    console.error('Unable to mark tenant communication as read:', error.message);
    return res.status(503).json({ message: 'Message could not be updated.' });
  }
});

router.post('/:id/vote', async (req, res) => {
  if (!canReadTenantNotices(req.tenant.membership) || !mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: 'Poll not found.' });
  }
  const optionIndex = Number(req.body?.optionIndex);
  if (!Number.isInteger(optionIndex) || optionIndex < 0) return res.status(400).json({ message: 'Choose one poll option.' });
  try {
    const branchIds = await readableBranchIds(req);
    const now = new Date();
    const filter = {
      _id: req.params.id,
      organizationId: req.tenant.organization._id,
      branchId: { $in: branchIds },
      type: 'poll',
      status: 'active',
      startsAt: { $lte: now },
      endsAt: { $gt: now },
      audience: readerAudience(req),
    };
    const existing = await TenantCommunication.findOne(filter).select('options').lean();
    if (!existing) return res.status(404).json({ message: 'This poll is closed or unavailable.' });
    if (optionIndex >= existing.options.length) return res.status(400).json({ message: 'Choose a valid poll option.' });
    const item = await TenantCommunication.findOneAndUpdate({
      ...filter,
      votes: { $not: { $elemMatch: { userId: req.user._id } } },
    }, {
      $push: { votes: { userId: req.user._id, role: req.tenant.membership.role, optionIndex, votedAt: now } },
    }, { new: true });
    if (!item) return res.status(409).json({ message: 'You have already voted in this poll.' });
    return res.json({ message: 'Your vote has been recorded.', item: serialize(item, req.user._id, req.tenant.membership.role) });
  } catch (error) {
    console.error('Unable to record tenant poll vote:', error.message);
    return res.status(503).json({ message: 'Your vote could not be saved.' });
  }
});

router.patch('/:id/status', async (req, res) => {
  if (!canManageTenantNotices(req.tenant.membership)) {
    return res.status(403).json({ message: 'Only an authorized school administrator can archive communications.' });
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.id) || !['active', 'archived'].includes(req.body?.status)) {
    return res.status(400).json({ message: 'Choose a valid communication and status.' });
  }
  try {
    const branchIds = await visibleBranchIds(req);
    const item = await TenantCommunication.findOneAndUpdate({
      _id: req.params.id,
      organizationId: req.tenant.organization._id,
      branchId: { $in: branchIds },
    }, {
      $set: { status: req.body.status, updatedBy: req.user._id },
    }, { new: true });
    if (!item) return res.status(404).json({ message: 'Communication not found in the branches you can manage.' });
    return res.json({ message: item.status === 'active' ? 'Communication restored.' : 'Communication archived.' });
  } catch (error) {
    console.error('Unable to change tenant communication status:', error.message);
    return res.status(503).json({ message: 'Communication status could not be updated.' });
  }
});

module.exports = router;
