'use strict';

const express = require('express');
const mongoose = require('mongoose');
const TenantCalendarEvent = require('../models/TenantCalendarEvent');
const Branch = require('../models/Branch');
const ChildGuardian = require('../models/ChildGuardian');
const AuditEvent = require('../models/AuditEvent');
const { tenantContext, requireBranchContext } = require('../middleware/tenantContext');
const { parseDateOnly } = require('../utils/dateOnly');
const { getZonedDayBounds, getTodayInTimeZone } = require('../utils/zonedDate');
const {
  EVENT_TYPES,
  canReadCalendar,
  canManageCalendar,
  audienceForRole,
  validateCalendarEvent,
  validateCalendarRange,
} = require('../utils/tenantCalendarPolicy');

const router = express.Router();
router.use(tenantContext);

function clean(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

async function visibleBranchIds(req) {
  if (req.tenant.branch) return [req.tenant.branch._id];

  const membership = req.tenant.membership;
  let branchIds = (membership.branchIds || []).map((id) => id?._id || id);
  if (membership.accessAllBranches) {
    const branches = await Branch.find({
      organizationId: req.tenant.organization._id,
      status: 'active',
    }).select('_id').lean();
    branchIds = branches.map((item) => item._id);
  }

  // Prune closed or removed branch assignments before listing any school data.
  const activeBranches = branchIds.length ? await Branch.find({
    _id: { $in: branchIds },
    organizationId: req.tenant.organization._id,
    status: 'active',
  }).select('_id').lean() : [];
  branchIds = activeBranches.map((item) => item._id);

  if (membership.role !== 'parent') return branchIds;
  const guardianIds = membership.guardianIds || [];
  if (!guardianIds.length || !branchIds.length) return [];

  const links = await ChildGuardian.find({
    organizationId: req.tenant.organization._id,
    branchId: { $in: branchIds },
    guardianId: { $in: guardianIds },
  }).select('branchId').lean();

  const linkedBranchIds = new Set(links.map((item) => String(item.branchId)));
  return branchIds.filter((id) => linkedBranchIds.has(String(id)));
}

async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function writeCalendarAudit(req, session, event, action, changedFields = [], reason = '') {
  await AuditEvent.create([{
    organizationId: req.tenant.organization._id,
    branchId: event.branchId,
    actorUserId: req.user._id,
    action,
    resourceType: 'tenant_calendar_event',
    resourceId: String(event._id),
    outcome: 'success',
    reason: clean(reason, 500),
    summary: action === 'calendar_event.created'
      ? 'Calendar event created: ' + event.title + '.'
      : action === 'calendar_event.cancelled'
        ? 'Calendar event cancelled: ' + event.title + '.'
        : action === 'calendar_event.restored'
          ? 'Calendar event restored: ' + event.title + '.'
          : 'Calendar event updated: ' + event.title + '.',
    changedFields,
    ipAddress: String(req.ip || '').slice(0, 64),
    userAgent: String(req.get('user-agent') || '').slice(0, 300),
  }], { session });
}

function serialize(event) {
  return {
    id: String(event._id),
    title: event.title,
    description: event.description || '',
    type: event.type,
    audience: event.audience,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: Boolean(event.allDay),
    location: event.location || '',
    status: event.status,
    branch: event.branchId ? {
      id: String(event.branchId._id || event.branchId),
      name: event.branchId.name || '',
      code: event.branchId.code || '',
    } : null,
    createdBy: event.createdBy ? {
      id: String(event.createdBy._id || event.createdBy),
      name: event.createdBy.username || '',
    } : null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    cancelledAt: event.cancelledAt || null,
    cancellationReason: event.cancellationReason || '',
  };
}

function visibleEventAudiences(req) {
  return { $in: audienceForRole(req.tenant.membership.role) };
}

router.get('/', async (req, res) => {
  if (!canReadCalendar(req.tenant.membership)) {
    return res.status(403).json({ message: 'You do not have access to the school calendar.' });
  }
  if (req.tenant.membership.role === 'parent' &&
      (!Array.isArray(req.tenant.membership.guardianIds) || req.tenant.membership.guardianIds.length === 0)) {
    return res.status(403).json({ message: 'This parent account has no verified family link.' });
  }

  const timezone = req.tenant.branch?.timezone || req.tenant.organization.timezone || 'Asia/Kolkata';
  const defaultFrom = getTodayInTimeZone(timezone);
  const todayDate = parseDateOnly(defaultFrom);
  const defaultTo = new Date(todayDate || new Date());
  defaultTo.setUTCDate(defaultTo.getUTCDate() + 90);
  const from = clean(req.query.from, 10) || defaultFrom;
  const to = clean(req.query.to, 10) || defaultTo.toISOString().slice(0, 10);
  const range = validateCalendarRange(from, to);
  if (!range.valid) return res.status(400).json({ message: range.message });

  const bounds = getZonedDayBounds(from, timezone);
  const endBounds = getZonedDayBounds(to, timezone);
  if (!bounds || !endBounds) return res.status(400).json({ message: 'The calendar date range or school time zone is invalid.' });

  try {
    const branchIds = await visibleBranchIds(req);
    if (!branchIds.length) return res.json({ total: 0, events: [] });

    const filter = {
      organizationId: req.tenant.organization._id,
      branchId: { $in: branchIds },
      audience: visibleEventAudiences(req),
      startsAt: { $lt: endBounds.end },
      endsAt: { $gte: bounds.start },
    };
    const includeCancelled = req.query.includeCancelled === 'true' && canManageCalendar(req.tenant.membership);
    if (!includeCancelled) filter.status = 'active';
    if (req.query.type) {
      const type = clean(req.query.type, 40);
      if (!EVENT_TYPES.includes(type)) return res.status(400).json({ message: 'Choose a valid event type filter.' });
      filter.type = type;
    }

    const events = await TenantCalendarEvent.find(filter)
      .populate({ path: 'branchId', select: 'name code' })
      .populate({ path: 'createdBy', select: 'username' })
      .sort({ startsAt: 1, title: 1 })
      .limit(500)
      .lean();

    return res.json({
      from,
      to,
      total: events.length,
      events: events.map(serialize),
    });
  } catch (error) {
    console.error('Unable to load tenant calendar:', error.message);
    return res.status(503).json({ message: 'School calendar events could not be loaded.' });
  }
});

router.post('/', requireBranchContext, async (req, res) => {
  if (!canManageCalendar(req.tenant.membership)) {
    return res.status(403).json({ message: 'Only an authorized school administrator can create calendar events.' });
  }

  const validation = validateCalendarEvent(req.body || {});
  if (!validation.valid) {
    return res.status(400).json({
      message: validation.message || 'Please correct the calendar event details.',
      errors: validation.errors,
    });
  }

  try {
    const event = await withTransaction(async (session) => {
      const [created] = await TenantCalendarEvent.create([{
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
        ...validation.value,
        createdBy: req.user._id,
      }], { session });
      await writeCalendarAudit(req, session, created, 'calendar_event.created',
        ['title', 'description', 'type', 'audience', 'startsAt', 'endsAt', 'allDay', 'location']);
      return created;
    });

    const populated = await TenantCalendarEvent.findOne({
      _id: event._id,
      organizationId: req.tenant.organization._id,
      branchId: req.tenant.branch._id,
    })
      .populate({ path: 'branchId', select: 'name code' })
      .populate({ path: 'createdBy', select: 'username' })
      .lean();

    return res.status(201).json({ message: 'Calendar event created.', event: serialize(populated) });
  } catch (error) {
    console.error('Unable to create tenant calendar event:', error.message);
    return res.status(503).json({ message: 'The calendar event could not be created safely.' });
  }
});

router.put('/:id', requireBranchContext, async (req, res) => {
  if (!canManageCalendar(req.tenant.membership)) {
    return res.status(403).json({ message: 'Only an authorized school administrator can update calendar events.' });
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Choose a valid calendar event.' });
  }

  try {
    const result = await withTransaction(async (session) => {
      const event = await TenantCalendarEvent.findOne({
        _id: req.params.id,
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
      }).session(session);

      if (!event) {
        const missing = new Error('Calendar event not found in this branch.');
        missing.code = 'EVENT_NOT_FOUND';
        throw missing;
      }

      const validation = validateCalendarEvent(req.body || {}, event.toObject());
      if (!validation.valid) {
        const invalid = new Error(validation.message || 'Please correct the calendar event details.');
        invalid.code = 'EVENT_INVALID';
        invalid.errors = validation.errors;
        throw invalid;
      }

      const oldStatus = event.status;
      Object.assign(event, validation.value, { updatedBy: req.user._id });
      await event.save({ session });
      await writeCalendarAudit(req, session, event, 'calendar_event.updated',
        Object.keys(validation.value), clean(req.body?.reason, 500));
      return { event, oldStatus };
    });

    const populated = await TenantCalendarEvent.findOne({
      _id: result.event._id,
      organizationId: req.tenant.organization._id,
      branchId: req.tenant.branch._id,
    })
      .populate({ path: 'branchId', select: 'name code' })
      .populate({ path: 'createdBy', select: 'username' })
      .lean();
    return res.json({ message: 'Calendar event updated.', event: serialize(populated) });
  } catch (error) {
    if (error.code === 'EVENT_NOT_FOUND') return res.status(404).json({ message: error.message });
    if (error.code === 'EVENT_INVALID') return res.status(400).json({ message: error.message, errors: error.errors || {} });
    console.error('Unable to update tenant calendar event:', error.message);
    return res.status(503).json({ message: 'The calendar event could not be updated safely.' });
  }
});

router.patch('/:id/status', requireBranchContext, async (req, res) => {
  if (!canManageCalendar(req.tenant.membership)) {
    return res.status(403).json({ message: 'Only an authorized school administrator can cancel or restore calendar events.' });
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Choose a valid calendar event.' });
  }
  const status = clean(req.body?.status, 20);
  const reason = clean(req.body?.reason, 500);
  if (!['active', 'cancelled'].includes(status)) {
    return res.status(400).json({ message: 'Choose Active or Cancelled.' });
  }
  if (status === 'cancelled' && reason.length < 3) {
    return res.status(400).json({ message: 'Enter a reason before cancelling the event.' });
  }

  try {
    const result = await withTransaction(async (session) => {
      const event = await TenantCalendarEvent.findOne({
        _id: req.params.id,
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
      }).session(session);
      if (!event) {
        const missing = new Error('Calendar event not found in this branch.');
        missing.code = 'EVENT_NOT_FOUND';
        throw missing;
      }

      event.status = status;
      event.updatedBy = req.user._id;
      if (status === 'cancelled') {
        event.cancelledAt = new Date();
        event.cancelledBy = req.user._id;
        event.cancellationReason = reason;
      } else {
        event.cancelledAt = null;
        event.cancelledBy = null;
        event.cancellationReason = '';
      }
      await event.save({ session });
      await writeCalendarAudit(req, session, event,
        status === 'cancelled' ? 'calendar_event.cancelled' : 'calendar_event.restored',
        ['status'], reason);
      return event;
    });

    return res.json({
      message: status === 'cancelled' ? 'Calendar event cancelled.' : 'Calendar event restored.',
      event: serialize(result),
    });
  } catch (error) {
    if (error.code === 'EVENT_NOT_FOUND') return res.status(404).json({ message: error.message });
    console.error('Unable to update calendar event status:', error.message);
    return res.status(503).json({ message: 'The calendar event status could not be updated safely.' });
  }
});

module.exports = router;
