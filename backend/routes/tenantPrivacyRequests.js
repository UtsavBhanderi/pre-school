'use strict';

const express = require('express');
const mongoose = require('mongoose');
const FamilyDataRequest = require('../models/FamilyDataRequest');
const Student = require('../models/Student');
const Branch = require('../models/Branch');
const AuditEvent = require('../models/AuditEvent');
const { tenantContext } = require('../middleware/tenantContext');
const { hasTenantRole } = require('../utils/tenantAuthorization');
const { validateRequestReviewInput } = require('../utils/familyDataRequestRules');

const router = express.Router();
const REVIEW_ROLES = ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions'];

router.use(tenantContext);

function clean(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function canReview(req, res) {
  if (hasTenantRole(req.tenant?.membership, REVIEW_ROLES)) return true;
  res.status(403).json({ message: 'Your role cannot review family data requests.' });
  return false;
}

function scopedBranchFilter(req) {
  if (req.tenant.branch) return { branchId: req.tenant.branch._id };
  if (req.tenant.membership.accessAllBranches) return {};
  return { branchId: { $in: req.tenant.membership.branchIds || [] } };
}

function messageForStatus(status) {
  if (status === 'under_review') return 'The preschool office is reviewing this request.';
  return '';
}

function serializeRequest(request, childById = new Map(), includeInternal = false) {
  const child = childById.get(String(request.childId)) || null;
  const output = {
    id: String(request._id),
    child: child ? {
      id: String(child._id),
      name: [child.firstName, child.middleName, child.lastName].filter(Boolean).join(' ').trim(),
      className: child.standard || '',
      admissionNumber: child.stuNo || '',
    } : null,
    branch: request.branchId ? {
      id: String(request.branchId._id || request.branchId),
      name: request.branchId.name || '',
      code: request.branchId.code || '',
    } : null,
    requester: request.requesterUserId && typeof request.requesterUserId === 'object'
      ? { name: request.requesterUserId.username || '', email: request.requesterUserId.email || '' }
      : null,
    requestType: request.requestType,
    description: request.description,
    contactPreference: request.contactPreference,
    status: request.status,
    submittedAt: request.submittedAt,
    lastActionAt: request.lastActionAt,
    reviewedAt: request.reviewedAt || null,
    completedAt: request.completedAt || null,
    publicResponse: request.publicResponse || '',
    history: (request.publicHistory || []).map((event) => ({
      status: event.status,
      publicMessage: event.publicMessage || '',
      createdAt: event.createdAt,
    })),
  };
  if (includeInternal) {
    output.internalNotes = request.internalNotes || '';
    output.reviewedBy = request.reviewedBy && typeof request.reviewedBy === 'object'
      ? { name: request.reviewedBy.username || '', email: request.reviewedBy.email || '' }
      : null;
  }
  return output;
}

async function withTransaction(work) {
  let session;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    if (session) await session.endSession();
  }
}

async function loadChildrenForRequests(requests, organizationId, allowedBranchFilter) {
  if (!requests.length) return new Map();
  const ids = [...new Set(requests.map((request) => String(request.childId)))];
  const children = await Student.find({
    _id: { $in: ids },
    organizationId,
    ...allowedBranchFilter,
  }).select('_id firstName middleName lastName stuNo standard branchId').lean();
  return new Map(children.map((child) => [String(child._id), child]));
}

router.get('/', async (req, res) => {
  if (!canReview(req, res)) return;
  const filter = {
    organizationId: req.tenant.organization._id,
    ...scopedBranchFilter(req),
  };

  if (req.query.status) {
    const status = clean(req.query.status, 30);
    if (!FamilyDataRequest.schema.path('status').enumValues.includes(status)) {
      return res.status(400).json({ message: 'Choose a valid request status filter.' });
    }
    filter.status = status;
  }
  if (req.query.requestType) {
    const type = clean(req.query.requestType, 40);
    if (!FamilyDataRequest.schema.path('requestType').enumValues.includes(type)) {
      return res.status(400).json({ message: 'Choose a valid request type filter.' });
    }
    filter.requestType = type;
  }

  const parsedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 100)) : 50;

  try {
    const requests = await FamilyDataRequest.find(filter)
      .populate({ path: 'branchId', select: 'name code' })
      .populate({ path: 'requesterUserId', select: 'username email' })
      .populate({ path: 'reviewedBy', select: 'username email' })
      .sort({ submittedAt: -1, _id: -1 })
      .limit(limit)
      .lean();
    const childMap = await loadChildrenForRequests(requests, req.tenant.organization._id, scopedBranchFilter(req));
    return res.json({
      total: requests.length,
      requests: requests.map((request) => serializeRequest(request, childMap, true)),
    });
  } catch (error) {
    console.error('Unable to list family data requests:', error.message);
    return res.status(503).json({ message: 'Family data requests could not be loaded.' });
  }
});

router.patch('/:id/status', async (req, res) => {
  if (!canReview(req, res)) return;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid data request.' });

  try {
    const existing = await FamilyDataRequest.findOne({
      _id: req.params.id,
      organizationId: req.tenant.organization._id,
      ...scopedBranchFilter(req),
    }).lean();
    if (!existing) return res.status(404).json({ message: 'Family data request not found in your organization or permitted branch.' });

    const validation = validateRequestReviewInput(req.body, existing.status);
    if (!validation.valid) {
      return res.status(400).json({
        message: 'Please correct the review update.',
        errors: validation.errors,
      });
    }

    const updated = await withTransaction(async (session) => {
      const request = await FamilyDataRequest.findOne({
        _id: req.params.id,
        organizationId: req.tenant.organization._id,
        ...scopedBranchFilter(req),
      }).session(session);
      if (!request) {
        const notFound = new Error('Family data request not found.');
        notFound.code = 'NOT_FOUND';
        throw notFound;
      }

      // Recheck the transition inside the transaction in case another reviewer
      // changed the status after the initial validation.
      const currentValidation = validateRequestReviewInput(req.body, request.status);
      if (!currentValidation.valid) {
        const conflict = new Error('This request has changed. Refresh it and review the latest status.');
        conflict.code = 'STALE_STATUS';
        throw conflict;
      }

      const previousStatus = request.status;
      const nextStatus = currentValidation.value.status;
      const suppliedMessage = currentValidation.value.publicResponse;
      const publicMessage = suppliedMessage || messageForStatus(nextStatus);

      request.status = nextStatus;
      request.lastActionAt = new Date();
      request.reviewedBy = req.user._id;
      if (!request.reviewedAt) request.reviewedAt = new Date();
      if (nextStatus === 'completed' || nextStatus === 'declined') request.completedAt = new Date();
      if (suppliedMessage) request.publicResponse = suppliedMessage;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'internalNotes')) {
        request.internalNotes = currentValidation.value.internalNotes;
      }
      request.publicHistory.push({
        status: nextStatus,
        publicMessage,
        actorUserId: req.user._id,
        createdAt: new Date(),
      });
      await request.save({ session });

      await AuditEvent.create([{
        organizationId: req.tenant.organization._id,
        branchId: request.branchId,
        actorUserId: req.user._id,
        action: 'family.data_request_status_updated',
        resourceType: 'family_data_request',
        resourceId: String(request._id),
        summary: 'Family data-rights request status changed to ' + nextStatus + '.',
        changedFields: ['status', ...(suppliedMessage ? ['publicResponse'] : []), ...(Object.prototype.hasOwnProperty.call(req.body || {}, 'internalNotes') ? ['internalNotes'] : [])],
        ipAddress: String(req.ip || '').slice(0, 64),
        userAgent: String(req.get('user-agent') || '').slice(0, 300),
      }], { session });

      return request;
    });

    const childMap = await loadChildrenForRequests([updated.toObject ? updated.toObject() : updated], req.tenant.organization._id, scopedBranchFilter(req));
    return res.json({
      message: 'Family data request updated.',
      request: serializeRequest(updated.toObject ? updated.toObject() : updated, childMap, true),
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return res.status(404).json({ message: error.message });
    if (error.code === 'STALE_STATUS') return res.status(409).json({ message: error.message });
    console.error('Unable to update family data request:', error.message);
    return res.status(503).json({ message: 'The request review could not be saved safely.' });
  }
});

module.exports = router;
