'use strict';

const express = require('express');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const ChildGuardian = require('../models/ChildGuardian');
const Branch = require('../models/Branch');
const ChildHandoverEvent = require('../models/ChildHandoverEvent');
const ChildHandoverState = require('../models/ChildHandoverState');
const AuditEvent = require('../models/AuditEvent');
const { tenantContext, requireBranchContext } = require('../middleware/tenantContext');
const { parseDateOnly } = require('../utils/dateOnly');
const { getZonedDayBounds, getTodayInTimeZone } = require('../utils/zonedDate');
const {
  HANDOVER_READ_ROLES,
  canReadHandover,
  canRecordHandover,
  validateCheckInInput,
  validateCheckOutInput,
  decideCheckIn,
  decideCheckOut,
  parentSafeEvent,
} = require('../utils/childHandoverPolicy');

const router = express.Router();
router.use(tenantContext);

const MAX_HISTORY_DAYS = 31;
const REGEX_SPECIAL = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);

function clean(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function childName(child) {
  return [child?.firstName, child?.middleName, child?.lastName].filter(Boolean).join(' ').trim();
}

function escapeRegex(value) {
  return Array.from(value, (character) => REGEX_SPECIAL.has(character) ? '\\' + character : character).join('');
}

function validObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

async function visibleBranchIds(req) {
  if (req.tenant.branch) return [req.tenant.branch._id];

  let branchIds = (req.tenant.membership.branchIds || []).map((id) => id?._id || id);
  if (req.tenant.membership.accessAllBranches) {
    const branches = await Branch.find({
      organizationId: req.tenant.organization._id,
      status: 'active',
    }).select('_id').lean();
    branchIds = branches.map((item) => item._id);
  }

  const activeBranches = branchIds.length ? await Branch.find({
    _id: { $in: branchIds },
    organizationId: req.tenant.organization._id,
    status: 'active',
  }).select('_id').lean() : [];
  branchIds = activeBranches.map((item) => item._id);

  if (req.tenant.membership.role !== 'parent') return branchIds;
  const guardianIds = req.tenant.membership.guardianIds || [];
  if (!guardianIds.length || !branchIds.length) return [];

  const links = await ChildGuardian.find({
    organizationId: req.tenant.organization._id,
    branchId: { $in: branchIds },
    guardianId: { $in: guardianIds },
  }).select('branchId').lean();
  const linked = new Set(links.map((link) => String(link.branchId)));
  return branchIds.filter((id) => linked.has(String(id)));
}

async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } finally {
    await session.endSession();
  }
}

async function lockHandoverState({ organizationId, branchId, childId, session }) {
  return ChildHandoverState.findOneAndUpdate(
    { organizationId, branchId, childId },
    { $setOnInsert: { state: 'outside' }, $inc: { version: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true, session },
  );
}

async function writeHandoverAudit(req, session, event, child, reason = '') {
  const isRefused = event.outcome === 'refused';
  await AuditEvent.create([{
    organizationId: req.tenant.organization._id,
    branchId: req.tenant.branch._id,
    actorUserId: req.user._id,
    action: 'child_handover.' + event.eventType + '_' + (isRefused ? 'refused' : 'completed'),
    resourceType: 'child_handover',
    resourceId: String(event._id),
    outcome: isRefused ? 'denied' : 'success',
    reason: clean(reason || event.refusalReason, 500),
    summary: isRefused
      ? 'Child ' + (event.eventType === 'check_in' ? 'arrival' : 'pickup') + ' was declined for ' + childName(child) + '.'
      : 'Child ' + (event.eventType === 'check_in' ? 'arrival recorded for ' : 'pickup recorded for ') + childName(child) + '.',
    changedFields: ['eventType', 'outcome', 'eventAt', 'guardianId', 'authorizationVerified', 'idChecked'],
    ipAddress: String(req.ip || '').slice(0, 64),
    userAgent: String(req.get('user-agent') || '').slice(0, 300),
  }], { session });
}

function staffSafeEvent(event) {
  return {
    id: String(event._id),
    eventType: event.eventType,
    outcome: event.outcome,
    eventAt: event.eventAt,
    method: event.method,
    child: event.childId ? {
      id: String(event.childId._id || event.childId),
      name: childName(event.childId) || '',
      admissionNumber: event.childId.stuNo || '',
      className: event.childId.standard || '',
    } : null,
    branch: event.branchId ? {
      id: String(event.branchId._id || event.branchId),
      name: event.branchId.name || '',
      code: event.branchId.code || '',
    } : null,
    guardianName: event.guardianNameSnapshot || '',
    relationship: event.relationshipSnapshot || '',
    personName: event.personName || '',
    authorizationVerified: Boolean(event.authorizationVerified),
    idChecked: Boolean(event.idChecked),
    refusalReason: event.refusalReason || '',
    staffNote: event.staffNote || '',
    recordedBy: event.recordedBy ? event.recordedBy.username || '' : '',
  };
}

async function findScopedChild(req, childId, session) {
  let query = Student.findOne({
    _id: childId,
    organizationId: req.tenant.organization._id,
    branchId: req.tenant.branch._id,
  }).select('_id firstName middleName lastName stuNo standard batchYear');
  if (session) query = query.session(session);
  const child = await query.lean();
  if (!child) return null;

  if (req.tenant.membership.role === 'teacher') {
    const assignedClasses = req.tenant.membership.classNames || [];
    if (!assignedClasses.includes(child.standard)) return null;
  }
  return child;
}

async function findGuardianLink(req, childId, guardianId, session) {
  if (!guardianId || !validObjectId(guardianId)) return null;
  let query = ChildGuardian.findOne({
    organizationId: req.tenant.organization._id,
    branchId: req.tenant.branch._id,
    childId,
    guardianId,
  }).populate({ path: 'guardianId', select: 'fullName phone' });
  if (session) query = query.session(session);
  return query;
}

async function createHandoverEvent(req, session, {
  child, eventType, outcome, method, guardianLink = null, personName = '',
  authorizationVerified = false, idChecked = false, refusalReason = '', staffNote = '',
}) {
  const guardian = guardianLink?.guardianId || null;
  const [event] = await ChildHandoverEvent.create([{
    organizationId: req.tenant.organization._id,
    branchId: req.tenant.branch._id,
    childId: child._id,
    eventType,
    outcome,
    eventAt: new Date(),
    method,
    guardianId: guardian?._id || null,
    guardianNameSnapshot: guardian?.fullName || '',
    relationshipSnapshot: guardianLink?.relationship || '',
    personName: clean(personName, 120),
    authorizationVerified: authorizationVerified === true,
    idChecked: idChecked === true,
    refusalReason: refusalReason || '',
    staffNote: clean(staffNote, 500),
    recordedBy: req.user._id,
  }], { session });

  await writeHandoverAudit(req, session, event, child, refusalReason);
  return event;
}

router.get('/children', requireBranchContext, async (req, res) => {
  if (!canRecordHandover(req.tenant.membership)) {
    return res.status(403).json({ message: 'Your account cannot access the staff arrival and pickup roster.' });
  }
  const queryText = clean(req.query.q, 100);
  const filter = {
    organizationId: req.tenant.organization._id,
    branchId: req.tenant.branch._id,
  };
  if (req.tenant.membership.role === 'teacher') {
    const assignedClasses = req.tenant.membership.classNames || [];
    if (!assignedClasses.length) return res.json({ total: 0, children: [] });
    filter.standard = { $in: assignedClasses };
  }
  if (req.query.className) {
    const requestedClass = clean(req.query.className, 80);
    if (req.tenant.membership.role === 'teacher' && !(req.tenant.membership.classNames || []).includes(requestedClass)) {
      return res.status(403).json({ message: 'You can only access your assigned classes.' });
    }
    filter.standard = requestedClass;
  }
  if (queryText) {
    const regex = new RegExp(escapeRegex(queryText), 'i');
    filter.$or = [{ firstName: regex }, { middleName: regex }, { lastName: regex }, { stuNo: regex }];
  }

  try {
    const children = await Student.find(filter)
      .select('_id firstName middleName lastName stuNo standard batchYear')
      .sort({ middleName: 1, lastName: 1, firstName: 1 })
      .limit(500)
      .lean();

    const ids = children.map((child) => child._id);
    if (!ids.length) return res.json({ total: 0, children: [] });

    const [states, links] = await Promise.all([
      ChildHandoverState.find({
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
        childId: { $in: ids },
      }).lean(),
      ChildGuardian.find({
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
        childId: { $in: ids },
      }).populate({ path: 'guardianId', select: 'fullName' }).lean(),
    ]);

    const stateByChild = new Map(states.map((state) => [String(state.childId), state]));
    const contactsByChild = new Map();
    for (const link of links) {
      if (!link.guardianId) continue;
      const childKey = String(link.childId);
      const contacts = contactsByChild.get(childKey) || [];
      contacts.push({
        guardianId: String(link.guardianId._id),
        name: link.guardianId.fullName,
        relationship: link.relationship,
        isPrimaryContact: Boolean(link.isPrimaryContact),
        authorizedPickup: Boolean(link.authorizedPickup),
      });
      contactsByChild.set(childKey, contacts);
    }

    return res.json({
      total: children.length,
      children: children.map((child) => {
        const state = stateByChild.get(String(child._id));
        return {
          id: String(child._id),
          name: childName(child),
          admissionNumber: child.stuNo || '',
          className: child.standard || '',
          academicYear: child.batchYear || '',
          state: state?.state || 'outside',
          lastEventAt: state?.lastCompletedAt || null,
          guardians: contactsByChild.get(String(child._id)) || [],
        };
      }),
    });
  } catch (error) {
    console.error('Unable to load the child handover roster:', error.message);
    return res.status(503).json({ message: 'The child arrival and pickup roster could not be loaded.' });
  }
});

router.get('/', async (req, res) => {
  if (!canReadHandover(req.tenant.membership)) {
    return res.status(403).json({ message: 'You do not have access to child arrival and pickup history.' });
  }
  if (req.tenant.membership.role === 'parent' &&
      (!Array.isArray(req.tenant.membership.guardianIds) || !req.tenant.membership.guardianIds.length)) {
    return res.status(403).json({ message: 'This parent account has no verified family link.' });
  }

  const timezone = req.tenant.branch?.timezone || req.tenant.organization.timezone || 'Asia/Kolkata';
  const today = getTodayInTimeZone(timezone);
  const todayDate = parseDateOnly(today);
  const defaultFromDate = new Date(todayDate || new Date());
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 6);
  const from = clean(req.query.from, 10) || defaultFromDate.toISOString().slice(0, 10);
  const to = clean(req.query.to, 10) || today;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const fromDate = parseDateOnly(from);
  const toDate = parseDateOnly(to);
  if (!datePattern.test(from) || !datePattern.test(to) || !fromDate || !toDate || toDate < fromDate) {
    return res.status(400).json({ message: 'Choose a valid start and end date for the handover history.' });
  }
  if (toDate.getTime() - fromDate.getTime() > MAX_HISTORY_DAYS * 24 * 60 * 60 * 1000) {
    return res.status(400).json({ message: 'Handover history can be viewed for up to 31 days at a time.' });
  }

  const bounds = getZonedDayBounds(from, timezone);
  const endBounds = getZonedDayBounds(to, timezone);
  if (!bounds || !endBounds) return res.status(400).json({ message: 'The school date range or time zone is invalid.' });

  try {
    const branchIds = await visibleBranchIds(req);
    if (!branchIds.length) return res.json({ from, to, events: [] });

    const filter = {
      organizationId: req.tenant.organization._id,
      branchId: { $in: branchIds },
      eventAt: { $gte: bounds.start, $lt: endBounds.end },
    };

    if (req.tenant.membership.role === 'parent') {
      const links = await ChildGuardian.find({
        organizationId: req.tenant.organization._id,
        branchId: { $in: branchIds },
        guardianId: { $in: req.tenant.membership.guardianIds || [] },
      }).select('childId').lean();
      const childIds = [...new Set(links.map((link) => String(link.childId)))];
      if (!childIds.length) return res.json({ from, to, total: 0, events: [] });
      filter.childId = { $in: childIds };
    } else if (req.tenant.membership.role === 'teacher') {
      const assignedClasses = req.tenant.membership.classNames || [];
      if (!assignedClasses.length) return res.json({ from, to, total: 0, events: [] });
      const assignedChildren = await Student.find({
        organizationId: req.tenant.organization._id,
        branchId: { $in: branchIds },
        standard: { $in: assignedClasses },
      }).select('_id').lean();
      filter.childId = { $in: assignedChildren.map((child) => child._id) };
    }

    const events = await ChildHandoverEvent.find(filter)
      .populate({ path: 'childId', select: 'firstName middleName lastName stuNo standard' })
      .populate({ path: 'branchId', select: 'name code' })
      .populate({ path: 'recordedBy', select: 'username' })
      .sort({ eventAt: -1 })
      .limit(500)
      .lean();

    if (req.tenant.membership.role === 'parent') {
      const parentEvents = events.map((event) => {
        const child = event.childId;
        return parentSafeEvent({
          ...event,
          childId: child ? { ...child, fullName: childName(child) } : null,
        });
      });
      return res.json({ from, to, total: parentEvents.length, events: parentEvents });
    }

    return res.json({ from, to, total: events.length, events: events.map(staffSafeEvent) });
  } catch (error) {
    console.error('Unable to load child handover history:', error.message);
    return res.status(503).json({ message: 'Arrival and pickup history could not be loaded.' });
  }
});

router.post('/check-in', requireBranchContext, async (req, res) => {
  if (!canRecordHandover(req.tenant.membership)) {
    return res.status(403).json({ message: 'Your account cannot record child arrivals.' });
  }
  const validation = validateCheckInInput(req.body || {});
  if (!validation.valid) return res.status(400).json({ message: validation.message, errors: validation.errors });
  if (!validObjectId(validation.value.childId)) return res.status(400).json({ message: 'Choose a valid child record.' });

  try {
    const result = await withTransaction(async (session) => {
      const child = await findScopedChild(req, validation.value.childId, session);
      if (!child) {
        const missing = new Error('Child not found in this branch or assigned classes.');
        missing.code = 'CHILD_NOT_FOUND';
        throw missing;
      }

      let guardianLink = null;
      if (validation.value.guardianId) {
        guardianLink = await findGuardianLink(req, child._id, validation.value.guardianId, session);
        if (!guardianLink) {
          const badGuardian = new Error('That contact is not linked to this child in the selected branch.');
          badGuardian.code = 'GUARDIAN_NOT_LINKED';
          throw badGuardian;
        }
      }

      const state = await lockHandoverState({
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
        childId: child._id,
        session,
      });
      const decision = decideCheckIn(state.state);
      const event = await createHandoverEvent(req, session, {
        child,
        eventType: 'check_in',
        outcome: decision.allowed ? 'completed' : 'refused',
        method: validation.value.method,
        guardianLink,
        personName: validation.value.method === 'family' ? (guardianLink?.guardianId?.fullName || '') : validation.value.personName,
        authorizationVerified: Boolean(guardianLink),
        refusalReason: decision.refusalReason || '',
        staffNote: validation.value.staffNote,
      });

      if (decision.allowed) {
        state.state = decision.nextState;
        state.lastCompletedEventId = event._id;
        state.lastCompletedAt = event.eventAt;
        await state.save({ session });
      }
      return { event, decision, child };
    });

    if (!result.decision.allowed) {
      return res.status(409).json({
        code: result.decision.refusalReason,
        message: result.decision.message,
        event: { id: String(result.event._id), outcome: result.event.outcome, eventAt: result.event.eventAt },
      });
    }
    return res.status(201).json({
      message: 'Arrival recorded. Child is now marked as on the premises.',
      event: { id: String(result.event._id), eventAt: result.event.eventAt, childId: String(result.child._id) },
    });
  } catch (error) {
    if (error.code === 'CHILD_NOT_FOUND' || error.code === 'GUARDIAN_NOT_LINKED') return res.status(404).json({ message: error.message });
    if (error.code === 11000 || error.code === 112) {
      return res.status(409).json({ message: 'Another arrival or pickup was recorded at the same time. Refresh the child status before trying again.' });
    }
    console.error('Unable to record child arrival:', error.message);
    return res.status(503).json({ message: 'Child arrival could not be recorded safely.' });
  }
});

router.post('/check-out', requireBranchContext, async (req, res) => {
  if (!canRecordHandover(req.tenant.membership)) {
    return res.status(403).json({ message: 'Your account cannot record child pickups.' });
  }
  const validation = validateCheckOutInput(req.body || {});
  if (!validation.valid) return res.status(400).json({ message: validation.message, errors: validation.errors });
  if (!validObjectId(validation.value.childId)) return res.status(400).json({ message: 'Choose a valid child record.' });

  try {
    const result = await withTransaction(async (session) => {
      const child = await findScopedChild(req, validation.value.childId, session);
      if (!child) {
        const missing = new Error('Child not found in this branch or assigned classes.');
        missing.code = 'CHILD_NOT_FOUND';
        throw missing;
      }

      const guardianLink = validation.value.guardianId
        ? await findGuardianLink(req, child._id, validation.value.guardianId, session)
        : null;
      const state = await lockHandoverState({
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
        childId: child._id,
        session,
      });
      const linkedContact = guardianLink ? { authorizedPickup: guardianLink.authorizedPickup === true } : null;
      const decision = decideCheckOut({
        currentState: state.state,
        linkedContact,
        idChecked: validation.value.idChecked,
      });
      const personName = guardianLink?.guardianId?.fullName || validation.value.personName || 'Unidentified person';
      const event = await createHandoverEvent(req, session, {
        child,
        eventType: 'check_out',
        outcome: decision.allowed ? 'completed' : 'refused',
        method: guardianLink ? 'family' : 'other',
        guardianLink,
        personName,
        authorizationVerified: Boolean(linkedContact?.authorizedPickup),
        idChecked: validation.value.idChecked,
        refusalReason: decision.refusalReason || '',
        staffNote: validation.value.staffNote,
      });

      if (decision.allowed) {
        state.state = decision.nextState;
        state.lastCompletedEventId = event._id;
        state.lastCompletedAt = event.eventAt;
        await state.save({ session });
      }
      return { event, decision, child };
    });

    if (!result.decision.allowed) {
      return res.status(409).json({
        code: result.decision.refusalReason,
        message: result.decision.message,
        event: { id: String(result.event._id), outcome: result.event.outcome, eventAt: result.event.eventAt },
      });
    }
    return res.status(201).json({
      message: 'Pickup recorded. Child is now marked as outside the premises.',
      event: { id: String(result.event._id), eventAt: result.event.eventAt, childId: String(result.child._id) },
    });
  } catch (error) {
    if (error.code === 'CHILD_NOT_FOUND') return res.status(404).json({ message: error.message });
    if (error.code === 11000 || error.code === 112) {
      return res.status(409).json({ message: 'Another arrival or pickup was recorded at the same time. Refresh the child status before trying again.' });
    }
    console.error('Unable to record child pickup:', error.message);
    return res.status(503).json({ message: 'Child pickup could not be recorded safely.' });
  }
});

module.exports = router;
