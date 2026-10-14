'use strict';

const mongoose = require('mongoose');

const REQUEST_TYPES = ['access_copy', 'correction', 'consent_withdrawal', 'retention_review'];
const REQUEST_STATUSES = ['submitted', 'under_review', 'action_required', 'completed', 'declined'];

const PublicStatusEventSchema = new mongoose.Schema({
  status: { type: String, enum: REQUEST_STATUSES, required: true },
  publicMessage: { type: String, trim: true, maxlength: 600, default: '' },
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const FamilyDataRequestSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true, index: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true, index: true },
  requesterUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true, index: true },
  requesterGuardianIds: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Guardian' }],
    required: true,
    validate: { validator: (ids) => Array.isArray(ids) && ids.length > 0, message: 'At least one linked guardian is required.' },
    immutable: true,
  },
  requestType: { type: String, enum: REQUEST_TYPES, required: true, immutable: true, index: true },
  description: { type: String, required: true, trim: true, minlength: 8, maxlength: 1200, immutable: true },
  contactPreference: { type: String, enum: ['portal', 'email', 'phone'], default: 'portal', immutable: true },
  status: { type: String, enum: REQUEST_STATUSES, default: 'submitted', index: true },
  submittedAt: { type: Date, default: Date.now, immutable: true },
  lastActionAt: { type: Date, default: Date.now },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  publicResponse: { type: String, trim: true, maxlength: 600, default: '' },
  internalNotes: { type: String, trim: true, maxlength: 2000, default: '' },
  publicHistory: { type: [PublicStatusEventSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
}, { timestamps: true, strict: 'throw' });

FamilyDataRequestSchema.index({ organizationId: 1, branchId: 1, status: 1, submittedAt: -1 });
FamilyDataRequestSchema.index({ organizationId: 1, requesterUserId: 1, submittedAt: -1 });
FamilyDataRequestSchema.index({ organizationId: 1, childId: 1, submittedAt: -1 });

module.exports = mongoose.model('FamilyDataRequest', FamilyDataRequestSchema);
module.exports.REQUEST_TYPES = REQUEST_TYPES;
module.exports.REQUEST_STATUSES = REQUEST_STATUSES;
